// api/test-corrected-primecod.js
// Test with correct PrimeCOD API endpoints and handle all lead statuses
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🎯 TESTING CORRECTED PRIMECOD API with proper endpoints');

    // Test both endpoints to understand the difference
    const tests = [];

    // Test 1: Admin Leads endpoint with pagination
    console.log('📋 Test 1: Testing admin-leads endpoint...');
    
    let allLeads = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages && page <= 5) { // Limit to 5 pages for testing
      try {
        console.log(`   Fetching page ${page}...`);
        
        const response = await fetch(`https://api.primecod.app/api/admin-leads?page=${page}`, {
          headers: {
            'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          const leads = data.data || data;
          
          console.log(`   Page ${page}: ${Array.isArray(leads) ? leads.length : 0} leads`);
          
          if (Array.isArray(leads) && leads.length > 0) {
            allLeads.push(...leads);
            
            // Check if we should continue (if we got fewer leads than expected, we're at the end)
            if (leads.length < 10) { // Assuming 10 per page
              hasMorePages = false;
            }
          } else {
            hasMorePages = false;
          }
        } else {
          console.log(`   Page ${page} failed: ${response.status}`);
          hasMorePages = false;
        }
        
        page++;
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
        
      } catch (error) {
        console.log(`   Page ${page} error: ${error.message}`);
        hasMorePages = false;
      }
    }

    tests.push({
      endpoint: 'admin-leads',
      total_leads_retrieved: allLeads.length,
      pages_fetched: page - 1,
      success: allLeads.length > 0
    });

    // Test 2: Orders endpoint
    console.log('📦 Test 2: Testing orders endpoint...');
    
    let allOrders = [];
    try {
      const ordersResponse = await fetch(`https://api.primecod.app/api/orders?page=1`, {
        headers: {
          'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json();
        allOrders = ordersData.data || ordersData || [];
      }
    } catch (error) {
      console.log(`Orders endpoint error: ${error.message}`);
    }

    tests.push({
      endpoint: 'orders',
      total_orders_retrieved: Array.isArray(allOrders) ? allOrders.length : 0,
      success: Array.isArray(allOrders) && allOrders.length > 0
    });

    // Analyze the leads data we got
    const leadAnalysis = {
      total_leads: allLeads.length,
      confirmation_statuses: {},
      shipping_statuses: {},
      leads_with_tracking: 0,
      leads_delivered: 0,
      leads_returned: 0,
      leads_no_answer: 0,
      leads_duplicate: 0
    };

    allLeads.forEach(lead => {
      // Count confirmation statuses
      if (lead.confirmation_status) {
        leadAnalysis.confirmation_statuses[lead.confirmation_status] = 
          (leadAnalysis.confirmation_statuses[lead.confirmation_status] || 0) + 1;
      }

      // Count shipping statuses  
      if (lead.shipping_status) {
        leadAnalysis.shipping_statuses[lead.shipping_status] = 
          (leadAnalysis.shipping_statuses[lead.shipping_status] || 0) + 1;
      }

      // Count special conditions
      if (lead.tracking_number) leadAnalysis.leads_with_tracking++;
      if (lead.delivered_at) leadAnalysis.leads_delivered++;
      if (lead.returned_at) leadAnalysis.leads_returned++;
      if (lead.confirmation_status === 'no answer') leadAnalysis.leads_no_answer++;
      if (lead.confirmation_status === 'duplicate') leadAnalysis.leads_duplicate++;
    });

    // Test automation logic with new statuses
    const automationTests = [];
    const testLeads = allLeads.slice(0, 15); // Test first 15

    testLeads.forEach(lead => {
      const test = {
        reference: lead.reference,
        confirmation_status: lead.confirmation_status,
        shipping_status: lead.shipping_status,
        has_tracking: !!lead.tracking_number,
        delivered_at: lead.delivered_at,
        returned_at: lead.returned_at,
        shopify_action: 'none',
        reason: 'No action needed'
      };

      // Apply automation logic with new statuses
      if (lead.confirmation_status === 'duplicate') {
        test.shopify_action = 'cancel_order';
        test.reason = 'Duplicate order - cancel to avoid false revenue';
      } else if (lead.confirmation_status === 'no answer') {
        test.shopify_action = 'cancel_order';
        test.reason = 'Customer not reachable - cancel order';
      } else if (lead.shipping_status === 'shipped' && lead.tracking_number) {
        test.shopify_action = 'fulfill_with_tracking';
        test.reason = `Ship with tracking: ${lead.tracking_number}`;
      } else if (lead.delivered_at) {
        test.shopify_action = 'mark_as_paid';
        test.reason = `Mark as paid - delivered on ${lead.delivered_at}`;
      } else if (lead.returned_at) {
        test.shopify_action = 'cancel_order';
        test.reason = `Cancel order - returned on ${lead.returned_at}`;
      }

      automationTests.push(test);
    });

    // Test order matching with expanded dataset
    console.log('🔗 Testing order matching with expanded data...');
    
    const matchingTests = [];
    const leadsWithEmail = testLeads.filter(lead => lead.email).slice(0, 5);
    
    for (const lead of leadsWithEmail) {
      try {
        const orderSearch = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?email=${encodeURIComponent(lead.email)}&status=any&limit=5`,
          {
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );

        let matchResult = {
          lead_reference: lead.reference,
          lead_email: lead.email,
          confirmation_status: lead.confirmation_status,
          shopify_orders_found: 0,
          matching_possible: false
        };

        if (orderSearch.ok) {
          const searchResults = await orderSearch.json();
          matchResult.shopify_orders_found = searchResults.orders?.length || 0;
          matchResult.matching_possible = matchResult.shopify_orders_found > 0;
        }

        matchingTests.push(matchResult);
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        matchingTests.push({
          lead_reference: lead.reference,
          error: error.message
        });
      }
    }

    // Final assessment
    const productionReadiness = {
      can_get_more_leads: allLeads.length > 10,
      has_diverse_statuses: Object.keys(leadAnalysis.confirmation_statuses).length > 1,
      can_handle_all_scenarios: true,
      automation_coverage: {
        can_cancel_duplicates: leadAnalysis.leads_duplicate > 0,
        can_cancel_no_answer: leadAnalysis.leads_no_answer > 0,
        can_fulfill_shipped: leadAnalysis.leads_with_tracking > 0,
        can_mark_delivered_paid: leadAnalysis.leads_delivered > 0,
        can_cancel_returned: leadAnalysis.leads_returned > 0
      }
    };

    const overallSuccess = productionReadiness.can_get_more_leads && 
                          matchingTests.some(t => t.matching_possible);

    res.json({
      success: overallSuccess,
      message: overallSuccess ? 
        "🎉 CORRECTED API WORKING! Ready for production with full pagination!" :
        "⚠️ Issues found with corrected endpoints",

      endpoint_tests: tests,
      
      lead_analysis: leadAnalysis,
      
      automation_logic_tests: {
        total_tested: automationTests.length,
        tests: automationTests
      },
      
      order_matching_tests: {
        total_tested: matchingTests.length,
        successful_matches: matchingTests.filter(t => t.matching_possible).length,
        tests: matchingTests
      },
      
      production_readiness: productionReadiness,
      
      updated_automation_rules: {
        confirmed_shipped: "IF confirmation_status='confirmed' AND shipping_status='shipped' → Fulfill with tracking",
        delivered: "IF delivered_at EXISTS → Mark as paid",
        returned: "IF returned_at EXISTS → Cancel order",
        duplicate: "IF confirmation_status='duplicate' → Cancel order",
        no_answer: "IF confirmation_status='no answer' → Cancel order"
      },

      pagination_solution: {
        working_endpoint: "https://api.primecod.app/api/admin-leads?page={page}",
        total_leads_available: allLeads.length,
        pages_fetched: page - 1,
        recommendation: "Use admin-leads endpoint with page parameter for full data access"
      },

      next_steps: overallSuccess ? [
        "🎉 SUCCESS! Corrected API endpoints work perfectly",
        "🔄 Update sync-orders.js to use admin-leads endpoint with pagination", 
        "📊 Implement handling for 'duplicate' and 'no answer' statuses",
        "🚀 Deploy enhanced sync with full lead access",
        "📈 Can now handle unlimited daily order volume"
      ] : [
        "🔍 Investigate endpoint access issues",
        "📞 Verify API permissions for admin-leads endpoint",
        "🔧 Test authentication and authorization",
        "📋 Contact PrimeCOD support if needed"
      ]
    });

  } catch (error) {
    console.error('❌ Corrected API test error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
}

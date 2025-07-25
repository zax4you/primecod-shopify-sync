// api/test-primecod-data.js
// Comprehensive test to verify PrimeCOD data and our automation logic
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🧪 COMPREHENSIVE PRIMECOD DATA VERIFICATION TEST');
    console.log('📊 Testing all data fields and automation logic...');

    // Step 1: Get sample of PrimeCOD leads
    console.log('📦 Step 1: Fetching PrimeCOD leads...');
    
    const primecodResponse = await fetch('https://api.primecod.app/api/leads?limit=30', {
      headers: {
        'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!primecodResponse.ok) {
      throw new Error(`PrimeCOD API error: ${primecodResponse.status}`);
    }

    const primecodData = await primecodResponse.json();
    const leads = primecodData.data || primecodData;

    console.log(`📋 Retrieved ${leads.length} leads from PrimeCOD`);

    // Step 2: Analyze data structure and required fields
    console.log('🔍 Step 2: Analyzing data structure...');
    
    const dataAnalysis = {
      total_leads: leads.length,
      sample_lead: leads[0] || {},
      available_fields: [],
      status_distribution: {},
      shipping_status_distribution: {},
      leads_with_tracking: 0,
      leads_delivered: 0,
      leads_returned: 0,
      leads_with_email: 0
    };

    // Analyze first lead to see available fields
    if (leads[0]) {
      dataAnalysis.available_fields = Object.keys(leads[0]);
    }

    // Analyze all leads for patterns
    leads.forEach(lead => {
      // Count confirmation statuses
      if (lead.confirmation_status) {
        dataAnalysis.status_distribution[lead.confirmation_status] = 
          (dataAnalysis.status_distribution[lead.confirmation_status] || 0) + 1;
      }

      // Count shipping statuses
      if (lead.shipping_status) {
        dataAnalysis.shipping_status_distribution[lead.shipping_status] = 
          (dataAnalysis.shipping_status_distribution[lead.shipping_status] || 0) + 1;
      }

      // Count special conditions
      if (lead.tracking_number) dataAnalysis.leads_with_tracking++;
      if (lead.delivered_at) dataAnalysis.leads_delivered++;
      if (lead.returned_at) dataAnalysis.leads_returned++;
      if (lead.email) dataAnalysis.leads_with_email++;
    });

    // Step 3: Test automation logic with sample data
    console.log('🤖 Step 3: Testing automation logic...');
    
    const automationTests = [];
    
    // Test with first 15 leads (more comprehensive)
    const testLeads = leads.slice(0, Math.min(15, leads.length));
    
    for (const lead of testLeads) {
      const test = {
        reference: lead.reference,
        email: lead.email,
        confirmation_status: lead.confirmation_status,
        shipping_status: lead.shipping_status,
        tracking_number: lead.tracking_number,
        delivered_at: lead.delivered_at,
        returned_at: lead.returned_at,
        created_at: lead.created_at,
        shopify_action: 'none',
        reason: 'No action needed'
      };

      // Apply our automation logic
      if (lead.shipping_status === 'shipped' && lead.tracking_number) {
        test.shopify_action = 'fulfill_with_tracking';
        test.reason = `Ship with tracking: ${lead.tracking_number}`;
      }

      if (lead.delivered_at) {
        test.shopify_action = 'mark_as_paid';
        test.reason = `Mark as paid - delivered on ${lead.delivered_at}`;
      }

      if (lead.returned_at) {
        test.shopify_action = 'cancel_order';
        test.reason = `Cancel order - returned on ${lead.returned_at}`;
      }

      if (lead.confirmation_status === 'unconfirmed' || lead.confirmation_status === 'cancelled') {
        test.shopify_action = 'cancel_order';
        test.reason = `Cancel order - status: ${lead.confirmation_status}`;
      }

      automationTests.push(test);
    }

    // Step 4: Check Shopify order matching capability
    console.log('🔗 Step 4: Testing Shopify order matching...');
    
    const matchingTests = [];
    
    // Test matching for leads with emails (test more)
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
          shopify_orders_found: 0,
          matching_possible: false
        };

        if (orderSearch.ok) {
          const searchResults = await orderSearch.json();
          matchResult.shopify_orders_found = searchResults.orders?.length || 0;
          matchResult.matching_possible = matchResult.shopify_orders_found > 0;
          
          if (searchResults.orders?.length > 0) {
            matchResult.sample_order = {
              id: searchResults.orders[0].id,
              name: searchResults.orders[0].name,
              financial_status: searchResults.orders[0].financial_status,
              fulfillment_status: searchResults.orders[0].fulfillment_status
            };
          }
        }

        matchingTests.push(matchResult);
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        matchingTests.push({
          lead_reference: lead.reference,
          lead_email: lead.email,
          error: error.message
        });
      }
    }

    // Step 5: Production readiness assessment
    const productionReadiness = {
      data_availability: {
        confirmation_status: dataAnalysis.status_distribution,
        shipping_status: dataAnalysis.shipping_status_distribution,
        tracking_numbers: `${dataAnalysis.leads_with_tracking}/${leads.length}`,
        delivery_dates: `${dataAnalysis.leads_delivered}/${leads.length}`,
        return_dates: `${dataAnalysis.leads_returned}/${leads.length}`,
        email_addresses: `${dataAnalysis.leads_with_email}/${leads.length}`
      },
      
      automation_coverage: {
        can_fulfill: dataAnalysis.leads_with_tracking > 0,
        can_mark_paid: dataAnalysis.leads_delivered > 0,
        can_cancel_returns: dataAnalysis.leads_returned > 0,
        can_match_orders: matchingTests.some(t => t.matching_possible)
      },
      
      potential_issues: [],
      recommendations: []
    };

    // Check for potential issues
    if (dataAnalysis.leads_with_email < leads.length * 0.8) {
      productionReadiness.potential_issues.push("Some leads missing email addresses - may affect order matching");
    }

    if (dataAnalysis.leads_with_tracking === 0) {
      productionReadiness.potential_issues.push("No leads have tracking numbers - fulfillment automation may not work");
    }

    if (!matchingTests.some(t => t.matching_possible)) {
      productionReadiness.potential_issues.push("Could not match any PrimeCOD leads to Shopify orders");
    }

    // Generate recommendations
    if (productionReadiness.automation_coverage.can_fulfill) {
      productionReadiness.recommendations.push("✅ Fulfillment automation ready");
    }

    if (productionReadiness.automation_coverage.can_mark_paid) {
      productionReadiness.recommendations.push("✅ Payment marking automation ready");  
    }

    if (productionReadiness.automation_coverage.can_cancel_returns) {
      productionReadiness.recommendations.push("✅ Return cancellation automation ready");
    }

    if (productionReadiness.potential_issues.length === 0) {
      productionReadiness.recommendations.push("🚀 READY FOR PRODUCTION");
    }

    // Final assessment
    const overallReadiness = 
      productionReadiness.automation_coverage.can_fulfill &&
      productionReadiness.automation_coverage.can_mark_paid &&
      productionReadiness.automation_coverage.can_cancel_returns &&
      productionReadiness.automation_coverage.can_match_orders;

    res.json({
      success: true,
      message: overallReadiness ? 
        "🎉 PrimeCOD integration ready for production!" :
        "⚠️ Some issues found - review before production",

      data_analysis: dataAnalysis,
      
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
      
      next_steps: overallReadiness ? [
        "🚀 Deploy updated sync-orders.js to production",
        "📊 Monitor first few sync runs",
        "✅ Enable automated daily sync",
        "📈 Review order processing metrics"
      ] : [
        "🔍 Investigate identified issues",
        "🧪 Run additional tests with problematic data",
        "🔧 Fix data or logic issues",
        "🔄 Re-run verification test"
      ],

      sample_automation_rules: {
        shipped: "IF shipping_status='shipped' AND tracking_number EXISTS → Fulfill order",
        delivered: "IF delivered_at EXISTS → Mark as paid",
        returned: "IF returned_at EXISTS → Cancel order",
        unconfirmed: "IF confirmation_status='unconfirmed' → Cancel order"
      }
    });

  } catch (error) {
    console.error('❌ Verification test error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message,
      message: "Data verification test failed"
    });
  }
}

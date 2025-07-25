// api/test-simple-pagination.js
// Test simple pagination with leads?page=2 approach
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;

  try {
    console.log('📄 TESTING SIMPLE PAGINATION: leads?page=X');

    const paginationTests = [];
    let allLeads = [];

    // Test multiple pages
    for (let page = 1; page <= 5; page++) {
      try {
        console.log(`📋 Testing page ${page}...`);
        
        const response = await fetch(`https://api.primecod.app/api/leads?page=${page}`, {
          headers: {
            'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        const result = {
          page: page,
          status: response.status,
          success: response.ok,
          leads_count: 0,
          first_lead_reference: null,
          different_from_page_1: false
        };

        if (response.ok) {
          const data = await response.json();
          const leads = data.data || data;
          
          if (Array.isArray(leads)) {
            result.leads_count = leads.length;
            result.first_lead_reference = leads[0]?.reference || null;
            
            // Check if this page has different data than page 1
            if (page > 1 && paginationTests[0]?.first_lead_reference) {
              result.different_from_page_1 = leads[0]?.reference !== paginationTests[0].first_lead_reference;
            }
            
            // Add unique leads to our collection
            leads.forEach(lead => {
              if (!allLeads.find(existing => existing.reference === lead.reference)) {
                allLeads.push(lead);
              }
            });
          }
        } else {
          result.error = await response.text();
        }

        paginationTests.push(result);
        console.log(`   Page ${page}: ${result.leads_count} leads (${result.success ? 'SUCCESS' : 'FAILED'})`);

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        paginationTests.push({
          page: page,
          success: false,
          error: error.message
        });
      }
    }

    // Analyze results
    const analysis = {
      total_unique_leads: allLeads.length,
      pages_tested: paginationTests.length,
      successful_pages: paginationTests.filter(p => p.success).length,
      pages_with_data: paginationTests.filter(p => p.leads_count > 0).length,
      pagination_working: paginationTests.some(p => p.different_from_page_1),
      
      lead_distribution: paginationTests.map(p => ({
        page: p.page,
        leads: p.leads_count,
        different_data: p.different_from_page_1
      }))
    };

    // Analyze lead statuses from all collected leads
    const statusAnalysis = {
      confirmation_statuses: {},
      shipping_statuses: {},
      leads_with_tracking: 0,
      leads_delivered: 0,
      leads_returned: 0,
      date_range: { oldest: null, newest: null }
    };

    if (allLeads.length > 0) {
      allLeads.forEach(lead => {
        // Count statuses
        if (lead.confirmation_status) {
          statusAnalysis.confirmation_statuses[lead.confirmation_status] = 
            (statusAnalysis.confirmation_statuses[lead.confirmation_status] || 0) + 1;
        }
        
        if (lead.shipping_status) {
          statusAnalysis.shipping_statuses[lead.shipping_status] = 
            (statusAnalysis.shipping_statuses[lead.shipping_status] || 0) + 1;
        }
        
        if (lead.tracking_number) statusAnalysis.leads_with_tracking++;
        if (lead.delivered_at) statusAnalysis.leads_delivered++;
        if (lead.returned_at) statusAnalysis.leads_returned++;
      });

      // Find date range
      const dates = allLeads.map(lead => new Date(lead.created_at)).sort();
      statusAnalysis.date_range.oldest = dates[0].toISOString().split('T')[0];
      statusAnalysis.date_range.newest = dates[dates.length - 1].toISOString().split('T')[0];
    }

    // Determine if pagination is working
    const paginationWorking = analysis.pagination_working;
    const canGetMoreLeads = analysis.total_unique_leads > 10;

    res.json({
      success: paginationWorking,
      message: paginationWorking ? 
        `🎉 PAGINATION WORKING! Got ${analysis.total_unique_leads} unique leads across ${analysis.successful_pages} pages!` :
        `⚠️ Pagination returns same data - got ${analysis.total_unique_leads} leads total`,

      pagination_test_results: paginationTests,
      
      analysis: analysis,
      
      lead_status_analysis: statusAnalysis,
      
      sample_leads: allLeads.slice(0, 5).map(lead => ({
        reference: lead.reference,
        created_at: lead.created_at,
        confirmation_status: lead.confirmation_status,
        shipping_status: lead.shipping_status,
        has_tracking: !!lead.tracking_number,
        delivered_at: lead.delivered_at,
        returned_at: lead.returned_at
      })),

      pagination_verdict: {
        working: paginationWorking,
        can_scale: canGetMoreLeads,
        method: paginationWorking ? "leads?page=X" : "Single page only",
        max_leads_found: analysis.total_unique_leads
      },

      production_recommendations: paginationWorking ? [
        "🎉 SUCCESS! Simple pagination works",
        `📊 Can access ${analysis.total_unique_leads} leads across multiple pages`,
        "🔄 Update sync-orders.js to use leads?page=X",
        "🚀 Ready for production with unlimited scale",
        "📈 Can handle any daily order volume"
      ] : canGetMoreLeads ? [
        "📄 Multiple pages accessible but same data",
        "💡 May need different parameters or timing",
        "🔄 Try different page sizes or date filters", 
        "📞 Contact PrimeCOD about pagination specifics"
      ] : [
        "⚠️ Only single page available (10 leads)",
        "🔄 Use multiple daily syncs for scale",
        "⏰ Consider hourly syncs for high volume",
        "📞 Contact PrimeCOD about pagination options"
      ],

      next_steps: paginationWorking ? [
        "✅ Pagination confirmed working",
        "🔄 Implement paginated sync in production",
        "📊 Test with real order volumes",
        "🚀 Deploy full-scale automation"
      ] : [
        "🔍 Try different pagination parameters",
        "📅 Test date-based filtering",
        "💡 Implement multiple daily syncs",
        "📞 Get PrimeCOD pagination documentation"
      ]
    });

  } catch (error) {
    console.error('❌ Simple pagination test error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
}

// api/debug-sync-issue.js - Find why new orders aren't being processed
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🔍 Debugging sync issue - finding new orders from last 3 days...');
    const startTime = new Date();

    const debugResults = {
      current_time: new Date().toISOString(),
      poland_time: new Date().toLocaleString("en-US", {timeZone: "Europe/Warsaw"}),
      pages_checked: 5, // Check more pages for new orders
      total_leads_found: 0,
      date_analysis: {},
      status_analysis: {},
      email_analysis: {},
      recent_orders: [],
      shopify_matches: [],
      potential_issues: [],
      recommendations: []
    };

    // Check first 5 pages for recent orders (last 3 days)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    for (let page = 1; page <= 5; page++) {
      console.log(`📄 Checking page ${page}/5 for recent orders...`);
      
      const primecodResponse = await fetch(`https://api.primecod.app/api/leads?page=${page}`, {
        headers: {
          'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!primecodResponse.ok) {
        throw new Error(`PrimeCOD API error on page ${page}: ${primecodResponse.status}`);
      }

      const primecodData = await primecodResponse.json();
      const leads = primecodData.data;
      
      debugResults.total_leads_found += leads.length;
      console.log(`📦 Found ${leads.length} leads on page ${page}`);

      // Analyze each lead
      for (const lead of leads) {
        const createdDate = new Date(lead.created_at);
        const dayKey = createdDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Date analysis
        debugResults.date_analysis[dayKey] = (debugResults.date_analysis[dayKey] || 0) + 1;
        
        // Status analysis
        const status = lead.shipping_status || 'unknown';
        debugResults.status_analysis[status] = (debugResults.status_analysis[status] || 0) + 1;
        
        // Email analysis
        const hasEmail = !!(lead.email && lead.email.trim());
        const emailStatus = hasEmail ? 'has_email' : 'no_email';
        debugResults.email_analysis[emailStatus] = (debugResults.email_analysis[emailStatus] || 0) + 1;
        
        // Focus on recent orders (last 3 days)
        if (createdDate >= threeDaysAgo) {
          const recentOrder = {
            page: page,
            reference: lead.reference,
            created_at: lead.created_at,
            shipping_status: status,
            email: lead.email,
            phone: lead.phone,
            has_tracking: !!(lead.tracking_number && lead.tracking_number.trim()),
            tracking_number: lead.tracking_number,
            carrier: lead.carrier || 'Unknown'
          };
          
          debugResults.recent_orders.push(recentOrder);
          
          // Try to find matching Shopify order
          if (hasEmail) {
            try {
              const shopifyOrder = await findShopifyOrder(lead, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
              if (shopifyOrder) {
                debugResults.shopify_matches.push({
                  primecod_reference: lead.reference,
                  shopify_order_number: shopifyOrder.order_number,
                  shopify_order_id: shopifyOrder.id,
                  shopify_financial_status: shopifyOrder.financial_status,
                  shopify_fulfillment_status: shopifyOrder.fulfillment_status,
                  email_match: lead.email,
                  created_diff_hours: Math.abs((new Date(shopifyOrder.created_at) - createdDate) / (1000 * 60 * 60))
                });
                console.log(`✅ Found Shopify match: ${lead.reference} → Order ${shopifyOrder.order_number}`);
              } else {
                console.log(`❌ No Shopify match for: ${lead.reference} (${lead.email})`);
              }
            } catch (error) {
              console.error(`❌ Error checking Shopify for ${lead.reference}:`, error.message);
            }
          }
        }
      }
    }

    // Analyze issues
    const recentOrdersCount = debugResults.recent_orders.length;
    const matchesCount = debugResults.shopify_matches.length;
    
    if (recentOrdersCount === 0) {
      debugResults.potential_issues.push("🚨 NO RECENT ORDERS: No orders found in last 3 days - check if PrimeCOD is receiving new orders");
    } else if (matchesCount === 0) {
      debugResults.potential_issues.push("🚨 NO SHOPIFY MATCHES: Recent PrimeCOD orders exist but no Shopify matches found");
      debugResults.potential_issues.push("📧 EMAIL ISSUE: Check if emails in PrimeCOD match emails in Shopify orders");
    } else if (matchesCount < recentOrdersCount) {
      debugResults.potential_issues.push(`⚠️ PARTIAL MATCHES: ${matchesCount}/${recentOrdersCount} recent orders have Shopify matches`);
    }

    // Check for orders that need updates
    const ordersNeedingUpdate = debugResults.shopify_matches.filter(match => {
      const recentOrder = debugResults.recent_orders.find(order => order.reference === match.primecod_reference);
      if (!recentOrder) return false;
      
      // Check if order needs fulfillment
      if (recentOrder.shipping_status === 'delivered' && recentOrder.has_tracking && 
          match.shopify_fulfillment_status !== 'fulfilled') {
        return true;
      }
      
      // Check if order needs payment marking
      if (recentOrder.shipping_status === 'delivered' && 
          match.shopify_financial_status === 'pending') {
        return true;
      }
      
      // Check if order needs status update
      if (recentOrder.shipping_status === 'order placed' || recentOrder.shipping_status === 'shipped') {
        return true;
      }
      
      return false;
    });

    if (ordersNeedingUpdate.length === 0 && matchesCount > 0) {
      debugResults.potential_issues.push("✅ ALL UP TO DATE: Recent orders are already processed correctly");
    }

    // Generate recommendations
    if (recentOrdersCount === 0) {
      debugResults.recommendations.push("Check PrimeCOD dashboard to verify new orders are being created");
      debugResults.recommendations.push("Verify PrimeCOD API token is still valid and has proper permissions");
    } else if (matchesCount === 0) {
      debugResults.recommendations.push("Check email formats in both PrimeCOD and Shopify");
      debugResults.recommendations.push("Consider implementing phone number matching as fallback");
      debugResults.recommendations.push("Check if Shopify orders are being created with different email format");
    } else if (ordersNeedingUpdate.length > 0) {
      debugResults.recommendations.push(`Process ${ordersNeedingUpdate.length} orders that need updates`);
      debugResults.recommendations.push("Run manual sync to process these orders");
    } else {
      debugResults.recommendations.push("System appears to be working correctly - no action needed");
    }

    const duration = ((new Date() - startTime) / 1000).toFixed(2);
    
    res.status(200).json({
      success: true,
      message: `Debug analysis completed in ${duration}s`,
      debug_results: debugResults,
      orders_needing_update: ordersNeedingUpdate,
      summary: {
        total_leads_checked: debugResults.total_leads_found,
        recent_orders_last_3_days: recentOrdersCount,
        shopify_matches: matchesCount,
        match_percentage: recentOrdersCount > 0 ? Math.round((matchesCount / recentOrdersCount) * 100) : 0,
        orders_needing_updates: ordersNeedingUpdate.length
      }
    });

  } catch (error) {
    console.error('💥 Debug failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Helper function to find Shopify orders
async function findShopifyOrder(lead, shopifyStore, shopifyAccessToken) {
  if (!lead.email || !lead.email.trim()) {
    return null;
  }

  try {
    // Search by email
    const emailSearch = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json?email=${encodeURIComponent(lead.email)}&status=any&limit=10`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (emailSearch.ok) {
      const emailResults = await emailSearch.json();
      
      if (emailResults.orders && emailResults.orders.length > 0) {
        // Return the most recent order for this email
        return emailResults.orders[0];
      }
    }
  } catch (error) {
    console.error(`Error searching for order with email ${lead.email}:`, error.message);
  }
  
  return null;
}

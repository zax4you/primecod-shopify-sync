// api/debug-matching-issue.js - Debug why enhanced matching failed
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🔍 Debugging matching issue...');
    
    const debug = {
      primecod_sample: [],
      shopify_sample: [],
      matching_tests: [],
      cache_vs_live: {},
      recommendations: []
    };

    // Get first 5 PrimeCOD leads for detailed analysis
    console.log('📦 Getting PrimeCOD sample...');
    const primecodResponse = await fetch(`https://api.primecod.app/api/leads?page=1`, {
      headers: {
        'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const primecodData = await primecodResponse.json();
    const sampleLeads = primecodData.data.slice(0, 5);

    debug.primecod_sample = sampleLeads.map(lead => ({
      reference: lead.reference,
      email: lead.email,
      phone: lead.phone,
      status: lead.shipping_status,
      created_at: lead.created_at
    }));

    // Get recent Shopify orders (live API)
    console.log('📦 Getting Shopify orders (live API)...');
    const liveResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=10`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const liveData = await liveResponse.json();
    debug.shopify_sample = liveData.orders.slice(0, 5).map(order => ({
      order_number: order.order_number,
      email: order.email,
      phone: order.phone,
      billing_phone: order.billing_address?.phone,
      created_at: order.created_at,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      tags: order.tags
    }));

    // Test matching for each PrimeCOD lead against Shopify orders
    console.log('🧪 Testing matching logic...');
    for (const lead of sampleLeads) {
      const matchTest = {
        primecod_ref: lead.reference,
        primecod_email: lead.email,
        primecod_phone: lead.phone,
        email_match: null,
        phone_match: null,
        partial_match: null,
        fuzzy_match: null
      };

      // Test email matching
      if (lead.email) {
        const emailMatch = liveData.orders.find(order => 
          order.email && order.email.toLowerCase().trim() === lead.email.toLowerCase().trim()
        );
        matchTest.email_match = emailMatch ? {
          order_number: emailMatch.order_number,
          shopify_email: emailMatch.email
        } : 'NO_MATCH';
      }

      // Test phone matching
      if (lead.phone) {
        const normalizedLeadPhone = normalizePhoneNumber(lead.phone);
        const phoneMatch = liveData.orders.find(order => {
          const orderPhone = normalizePhoneNumber(order.phone || order.billing_address?.phone || '');
          return orderPhone && orderPhone === normalizedLeadPhone;
        });
        matchTest.phone_match = phoneMatch ? {
          order_number: phoneMatch.order_number,
          shopify_phone: phoneMatch.phone || phoneMatch.billing_address?.phone,
          normalized_lead: normalizedLeadPhone,
          normalized_shopify: normalizePhoneNumber(phoneMatch.phone || phoneMatch.billing_address?.phone || '')
        } : 'NO_MATCH';
      }

      // Test partial email matching
      if (lead.email && lead.email.includes('@')) {
        const username = lead.email.split('@')[0].toLowerCase();
        const partialMatch = liveData.orders.find(order => {
          if (!order.email) return false;
          const orderUsername = order.email.split('@')[0].toLowerCase();
          return orderUsername === username;
        });
        matchTest.partial_match = partialMatch ? {
          order_number: partialMatch.order_number,
          lead_username: username,
          shopify_username: partialMatch.email.split('@')[0]
        } : 'NO_MATCH';
      }

      debug.matching_tests.push(matchTest);
    }

    // Compare cache vs live API
    console.log('🔄 Comparing cache vs live API...');
    const cacheResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=2025-07-20T00:00:00Z`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const cacheData = await cacheResponse.json();
    debug.cache_vs_live = {
      live_orders_count: liveData.orders.length,
      cache_orders_count: cacheData.orders.length,
      live_date_range: liveData.orders.length > 0 ? 
        `${liveData.orders[liveData.orders.length - 1].created_at.split('T')[0]} to ${liveData.orders[0].created_at.split('T')[0]}` : 'No orders',
      cache_date_range: cacheData.orders.length > 0 ? 
        `${cacheData.orders[cacheData.orders.length - 1].created_at.split('T')[0]} to ${cacheData.orders[0].created_at.split('T')[0]}` : 'No orders'
    };

    // Check if recent orders have PrimeCOD tags (already processed)
    const processedOrders = liveData.orders.filter(order => 
      order.tags && (
        order.tags.includes('primecod') || 
        order.tags.includes('PrimeCOD') ||
        order.tags.includes('cod-fulfilled')
      )
    );

    debug.cache_vs_live.already_processed_count = processedOrders.length;
    debug.cache_vs_live.processed_orders = processedOrders.map(order => ({
      order_number: order.order_number,
      tags: order.tags,
      email: order.email
    }));

    // Generate recommendations
    const totalMatches = debug.matching_tests.reduce((count, test) => {
      return count + (test.email_match !== 'NO_MATCH' ? 1 : 0) + 
                   (test.phone_match !== 'NO_MATCH' ? 1 : 0) + 
                   (test.partial_match !== 'NO_MATCH' ? 1 : 0);
    }, 0);

    if (totalMatches === 0) {
      debug.recommendations.push("🚨 CRITICAL: No matches found in sample - email/phone data might be different");
      debug.recommendations.push("📧 Check if PrimeCOD emails match Shopify emails exactly");
      debug.recommendations.push("📞 Verify phone number formats between systems");
    } else {
      debug.recommendations.push(`✅ Found ${totalMatches} potential matches in sample`);
      debug.recommendations.push("🔄 Enhanced script might have cache/timing issue");
    }

    if (processedOrders.length > 0) {
      debug.recommendations.push(`⚠️ ${processedOrders.length} orders already have PrimeCOD tags - may be skipped`);
      debug.recommendations.push("🔄 Enhanced script might be avoiding duplicate processing");
    }

    res.status(200).json({
      success: true,
      message: 'Matching debug analysis completed',
      debug_results: debug,
      summary: {
        primecod_leads_analyzed: sampleLeads.length,
        shopify_orders_analyzed: liveData.orders.length,
        potential_matches_found: totalMatches,
        already_processed_orders: processedOrders.length
      }
    });

  } catch (error) {
    console.error('💥 Debug analysis failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Handle Polish numbers
  if (normalized.startsWith('+48')) {
    normalized = normalized.substring(3); // Remove +48
  } else if (normalized.startsWith('48') && normalized.length === 11) {
    normalized = normalized.substring(2); // Remove 48
  } else if (normalized.startsWith('0') && normalized.length === 10) {
    normalized = normalized.substring(1); // Remove leading 0
  }
  
  return normalized;
}

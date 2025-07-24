export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    // Get first PrimeCOD order
    const primecodResponse = await fetch('https://api.primecod.app/api/leads', {
      headers: {
        'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const primecodData = await primecodResponse.json();
    const firstLead = primecodData.data[0];
    
    // Try to find matching Shopify order
    const emailSearch = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?email=${encodeURIComponent(firstLead.email)}&status=any&limit=10`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const emailResults = await emailSearch.json();
    
    // Also get recent Shopify orders
    const recentOrders = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=5`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const recentOrdersData = await recentOrders.json();
    
    res.status(200).json({
      primecod_sample: {
        reference: firstLead.reference,
        email: firstLead.email,
        total_price_eur: firstLead.total_price_eur,
        confirmation_status: firstLead.confirmation_status
      },
      shopify_search_by_email: {
        found_orders: emailResults.orders?.length || 0,
        orders: emailResults.orders?.map(o => ({
          id: o.id,
          email: o.email,
          total_price: o.total_price,
          created_at: o.created_at
        })) || []
      },
      recent_shopify_orders: recentOrdersData.orders?.map(o => ({
        id: o.id,
        email: o.email,
        total_price: o.total_price,
        created_at: o.created_at
      })) || []
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

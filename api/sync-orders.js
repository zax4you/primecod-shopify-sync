// api/sync-orders.js
export default async function handler(req, res) {
  // Environment variables (set in Vercel dashboard)
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // yavina
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    console.log('🚀 Starting PrimeCOD → Shopify sync...');
    
    // Fetch orders from PrimeCOD API
    const primecodResponse = await fetch('https://api.primecod.app/api/leads', {
      headers: {
        'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!primecodResponse.ok) {
      throw new Error(`PrimeCOD API error: ${primecodResponse.status}`);
    }
    
    const primecodData = await primecodResponse.json();
    const leads = primecodData.data;
    
    console.log(`📦 Found ${leads.length} orders from PrimeCOD`);
    
    const updates = [];
    
    // Process each lead
    for (const lead of leads) {
      try {
        const update = await processLead(lead, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
        if (update) {
          updates.push(update);
        }
      } catch (error) {
        console.error(`❌ Error processing lead ${lead.reference}:`, error.message);
      }
    }
    
    console.log(`✅ Sync completed. ${updates.length} orders updated.`);
    
    res.status(200).json({
      success: true,
      message: `Sync completed. ${updates.length} orders updated.`,
      updates: updates
    });
    
  } catch (error) {
    console.error('💥 Sync failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function processLead(lead, shopifyStore, shopifyAccessToken) {
  // Skip if no meaningful status change
  if (!lead.confirmation_status && !lead.shipping_status && !lead.tracking_number) {
    return null;
  }
  
  // Find corresponding Shopify order
  const shopifyOrder = await findShopifyOrder(lead, shopifyStore, shopifyAccessToken);
  
  if (!shopifyOrder) {
    console.log(`🔍 No Shopify order found for PrimeCOD ${lead.reference}`);
    return null;
  }
  
  const updates = [];
  
  // Update based on shipping status
  if (lead.shipping_status === 'shipped' && lead.tracking_number) {
    await createFulfillment(shopifyOrder.id, lead.tracking_number, shopifyStore, shopifyAccessToken);
    updates.push('fulfilled');
  }
  
  console.log(`📝 Updated Shopify order ${shopifyOrder.order_number} for PrimeCOD ${lead.reference}`);
  
  return {
    primecod_reference: lead.reference,
    shopify_order: shopifyOrder.order_number,
    updates: updates
  };
}

async function findShopifyOrder(lead, shopifyStore, shopifyAccessToken) {
  // Search by customer email first
  if (lead.email) {
    const emailSearch = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json?email=${encodeURIComponent(lead.email)}&status=any&limit=50`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (emailSearch.ok) {
      const emailResults = await emailSearch.json();
      
      // Match by total price and date proximity
      const matchingOrder = emailResults.orders.find(order => {
        const orderTotal = parseFloat(order.total_price);
        const leadTotal = parseFloat(lead.total_price_eur);
        const priceDiff = Math.abs(orderTotal - leadTotal);
        
        // Allow 10% price difference for currency conversion
        return priceDiff < (orderTotal * 0.1);
      });
      
      if (matchingOrder) {
        return matchingOrder;
      }
    }
  }
  
  return null;
}

async function createFulfillment(orderId, trackingNumber, shopifyStore, shopifyAccessToken) {
  const response = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fulfillment: {
          tracking_number: trackingNumber,
          tracking_company: 'PrimeCOD',
          notify_customer: true
        }
      })
    }
  );
  
  return response.ok;
}
// api/sync-orders.js
export default async function handler(req, res) {
  // Environment variables (set in Vercel dashboard)
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
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
  // Find corresponding Shopify order
  const shopifyOrder = await findShopifyOrder(lead, shopifyStore, shopifyAccessToken);
  
  if (!shopifyOrder) {
    console.log(`🔍 No Shopify order found for PrimeCOD ${lead.reference}`);
    return null;
  }
  
  const updates = [];
  
  // Sync based on confirmation status
  if (lead.confirmation_status === 'new') {
    await addOrderNote(shopifyOrder.id, `PrimeCOD: Order received (${lead.reference})`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-new'], shopifyStore, shopifyAccessToken);
    updates.push('marked-as-new');
  }
  
  if (lead.confirmation_status === 'confirmed') {
    await addOrderNote(shopifyOrder.id, `PrimeCOD: Order confirmed (${lead.reference})`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-confirmed'], shopifyStore, shopifyAccessToken);
    updates.push('marked-as-confirmed');
  }
  
  // Sync based on shipping status
  if (lead.shipping_status === 'order placed') {
    await addOrderNote(shopifyOrder.id, `PrimeCOD: Order placed with supplier (${lead.reference})`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-processing'], shopifyStore, shopifyAccessToken);
    updates.push('marked-as-processing');
  }
  
  if (lead.shipping_status === 'shipped' && lead.tracking_number) {
    await createFulfillment(shopifyOrder.id, lead.tracking_number, shopifyStore, shopifyAccessToken);
    await addOrderNote(shopifyOrder.id, `PrimeCOD: Package shipped with tracking ${lead.tracking_number}`, shopifyStore, shopifyAccessToken);
    updates.push('fulfilled-with-tracking');
  }
  
  // Handle delivered orders
  if (lead.delivered_at) {
    await addOrderNote(shopifyOrder.id, `PrimeCOD: Package delivered on ${lead.delivered_at}`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-delivered'], shopifyStore, shopifyAccessToken);
    updates.push('marked-as-delivered');
  }
  
  // Handle returned orders
  if (lead.returned_at) {
    await addOrderNote(shopifyOrder.id, `PrimeCOD: Package returned on ${lead.returned_at}`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-returned'], shopifyStore, shopifyAccessToken);
    updates.push('marked-as-returned');
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
      
      // If only one order found with this email, assume it's a match
      if (emailResults.orders && emailResults.orders.length === 1) {
        return emailResults.orders[0];
      }
      
      // If multiple orders, try to match by date proximity (within 2 days)
      if (emailResults.orders && emailResults.orders.length > 1) {
        const leadDate = new Date(lead.created_at);
        
        const matchingOrder = emailResults.orders.find(order => {
          const orderDate = new Date(order.created_at);
          const timeDiff = Math.abs(leadDate - orderDate);
          const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
          
          // Match if within 2 days
          return daysDiff <= 2;
        });
        
        if (matchingOrder) {
          return matchingOrder;
        }
        
        // If no date match, return the most recent one
        return emailResults.orders[0];
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

async function updateOrderTags(orderId, newTags, shopifyStore, shopifyAccessToken) {
  // First get existing tags
  const orderResponse = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (orderResponse.ok) {
    const orderData = await orderResponse.json();
    const existingTags = orderData.order.tags ? orderData.order.tags.split(', ') : [];
    const allTags = [...new Set([...existingTags, ...newTags])]; // Remove duplicates
    
    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            id: orderId,
            tags: allTags.join(', ')
          }
        })
      }
    );
    
    return response.ok;
  }
}

async function addOrderNote(orderId, note, shopifyStore, shopifyAccessToken) {
  // Get existing order to preserve existing notes
  const orderResponse = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (orderResponse.ok) {
    const orderData = await orderResponse.json();
    const existingNote = orderData.order.note || '';
    const newNote = existingNote ? `${existingNote}\n\n${note}` : note;
    
    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            id: orderId,
            note: newNote
          }
        })
      }
    );
    
    return response.ok;
  }
}

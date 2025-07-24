// api/fulfill-order-1283.js
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  // Order #1283 details
  const orderNumber = 1283;
  
  try {
    // Step 1: Find the order by order number
    console.log(`🔍 Looking for Shopify order #${orderNumber}...`);
    
    const searchResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?name=%23${orderNumber}&status=any&limit=1`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!searchResponse.ok) {
      throw new Error(`Failed to search for order: ${searchResponse.status}`);
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData.orders || searchData.orders.length === 0) {
      return res.status(404).json({
        error: `Order #${orderNumber} not found`,
        searched_for: `#${orderNumber}`
      });
    }
    
    const order = searchData.orders[0];
    const orderId = order.id;
    
    console.log(`✅ Found order #${order.order_number} (ID: ${orderId})`);
    
    // Step 2: Get the tracking number from PrimeCOD
    console.log('📦 Fetching tracking info from PrimeCOD...');
    
    const primecodResponse = await fetch('https://api.primecod.app/api/leads', {
      headers: {
        'Authorization': `Bearer ${process.env.PRIMECOD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!primecodResponse.ok) {
      throw new Error(`PrimeCOD API error: ${primecodResponse.status}`);
    }
    
    const primecodData = await primecodResponse.json();
    const leads = primecodData.data;
    
    // Find matching lead by email
    const customerEmail = order.customer?.email;
    let matchingLead = null;
    let trackingNumber = null;
    
    if (customerEmail) {
      // Try to find by email and date proximity
      const orderDate = new Date(order.created_at);
      
      matchingLead = leads.find(lead => {
        if (lead.email !== customerEmail) return false;
        
        const leadDate = new Date(lead.created_at);
        const timeDiff = Math.abs(orderDate - leadDate);
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        
        return daysDiff <= 3; // Within 3 days
      });
      
      if (matchingLead) {
        trackingNumber = matchingLead.tracking_number;
        console.log(`📋 Found matching PrimeCOD lead: ${matchingLead.reference}`);
        console.log(`📦 Tracking number: ${trackingNumber || 'Not available'}`);
      }
    }
    
    // Step 3: Check if already fulfilled
    if (order.fulfillment_status === 'fulfilled') {
      return res.json({
        message: `Order #${orderNumber} is already fulfilled`,
        current_fulfillment_status: order.fulfillment_status,
        tracking_from_primecod: trackingNumber,
        primecod_reference: matchingLead?.reference,
        order_details: {
          id: orderId,
          order_number: order.order_number,
          customer_email: customerEmail,
          created_at: order.created_at
        }
      });
    }
    
    // Step 4: Create fulfillment with tracking
    console.log('🚀 Creating fulfillment...');
    
    const fulfillmentData = {
      fulfillment: {
        notify_customer: true,
        tracking_company: 'PrimeCOD'
      }
    };
    
    // Add tracking number if available
    if (trackingNumber) {
      fulfillmentData.fulfillment.tracking_number = trackingNumber;
      fulfillmentData.fulfillment.tracking_url = `https://track.primecod.app/${trackingNumber}`;
    }
    
    const fulfillmentResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fulfillmentData)
      }
    );
    
    const fulfillmentText = await fulfillmentResponse.text();
    let fulfillmentResult;
    
    try {
      fulfillmentResult = fulfillmentText ? JSON.parse(fulfillmentText) : { empty: true };
    } catch (e) {
      fulfillmentResult = { raw: fulfillmentText };
    }
    
    // Step 5: Add order note and tags
    if (fulfillmentResponse.ok) {
      console.log('📝 Adding order note and tags...');
      
      // Add note
      const noteText = matchingLead 
        ? `PrimeCOD: Package shipped with tracking ${trackingNumber || 'N/A'} (${matchingLead.reference}) - COD delivery in progress`
        : `Order #${orderNumber} fulfilled via PrimeCOD integration`;
      
      await addOrderNote(orderId, noteText, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
      
      // Add tags
      const tags = ['primecod-shipped', 'cod-in-transit'];
      if (matchingLead) {
        tags.push(`primecod-${matchingLead.reference}`);
      }
      
      await updateOrderTags(orderId, tags, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    }
    
    // Step 6: Get final order status
    const finalOrderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const finalOrderData = await finalOrderResponse.json();
    
    res.json({
      success: fulfillmentResponse.ok,
      message: fulfillmentResponse.ok 
        ? `Order #${orderNumber} successfully fulfilled with tracking` 
        : `Failed to fulfill order #${orderNumber}`,
      
      order_details: {
        shopify_order_id: orderId,
        order_number: order.order_number,
        customer_email: customerEmail
      },
      
      primecod_details: {
        reference: matchingLead?.reference || 'Not found',
        tracking_number: trackingNumber || 'Not available',
        shipping_status: matchingLead?.shipping_status || 'Unknown'
      },
      
      fulfillment_result: {
        success: fulfillmentResponse.ok,
        status: fulfillmentResponse.status,
        response: fulfillmentResult
      },
      
      final_status: {
        fulfillment_status: finalOrderData.order?.fulfillment_status,
        tags: finalOrderData.order?.tags
      }
    });
    
  } catch (error) {
    console.error('❌ Error fulfilling order:', error.message);
    res.status(500).json({ 
      error: error.message,
      order_number: orderNumber
    });
  }
}

// Helper function to add order note
async function addOrderNote(orderId, note, shopifyStore, shopifyAccessToken) {
  try {
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
      
      const updateResponse = await fetch(
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
      
      return updateResponse.ok;
    }
  } catch (error) {
    console.error('Error adding note:', error);
  }
  return false;
}

// Helper function to update order tags
async function updateOrderTags(orderId, newTags, shopifyStore, shopifyAccessToken) {
  try {
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
      
      const updateResponse = await fetch(
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
      
      return updateResponse.ok;
    }
  } catch (error) {
    console.error('Error updating tags:', error);
  }
  return false;
}

// api/fulfill-order-1283-fixed.js
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
    console.log(`📋 Current status - Financial: ${order.financial_status}, Fulfillment: ${order.fulfillment_status}`);
    
    // Step 2: Get locations to find the correct location_id
    console.log('📍 Getting store locations...');
    
    const locationsResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/locations.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    let locationId = null;
    if (locationsResponse.ok) {
      const locationsData = await locationsResponse.json();
      // Use the first active location, or primary location
      const primaryLocation = locationsData.locations.find(loc => loc.primary) || locationsData.locations[0];
      locationId = primaryLocation?.id;
      console.log(`📍 Using location: ${primaryLocation?.name} (ID: ${locationId})`);
    }
    
    // Step 3: Get the tracking number from PrimeCOD
    console.log('📦 Fetching tracking info from PrimeCOD...');
    
    let trackingNumber = null;
    let matchingLead = null;
    
    try {
      const primecodResponse = await fetch('https://api.primecod.app/api/leads', {
        headers: {
          'Authorization': `Bearer ${process.env.PRIMECOD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (primecodResponse.ok) {
        const primecodData = await primecodResponse.json();
        const leads = primecodData.data;
        
        // Find matching lead by email
        const customerEmail = order.customer?.email;
        if (customerEmail) {
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
      }
    } catch (error) {
      console.log(`⚠️ Could not fetch from PrimeCOD: ${error.message}`);
    }
    
    // Step 4: Check if already fulfilled
    if (order.fulfillment_status === 'fulfilled') {
      return res.json({
        message: `Order #${orderNumber} is already fulfilled`,
        current_fulfillment_status: order.fulfillment_status,
        tracking_from_primecod: trackingNumber,
        primecod_reference: matchingLead?.reference,
        order_details: {
          id: orderId,
          order_number: order.order_number,
          customer_email: order.customer?.email,
          created_at: order.created_at,
          financial_status: order.financial_status,
          fulfillment_status: order.fulfillment_status
        }
      });
    }
    
    // Step 5: Try different fulfillment approaches
    console.log('🚀 Attempting fulfillment...');
    
    // Approach 1: Simple fulfillment without location_id
    let fulfillmentResult = await tryFulfillment1(orderId, trackingNumber, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    
    // Approach 2: With location_id if first failed
    if (!fulfillmentResult.success && locationId) {
      console.log('🔄 Trying with location_id...');
      fulfillmentResult = await tryFulfillment2(orderId, trackingNumber, locationId, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    }
    
    // Approach 3: With specific line items if still failed
    if (!fulfillmentResult.success) {
      console.log('🔄 Trying with line items...');
      fulfillmentResult = await tryFulfillment3(orderId, trackingNumber, locationId, order.line_items, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    }
    
    // Approach 4: Minimal fulfillment as last resort
    if (!fulfillmentResult.success) {
      console.log('🔄 Trying minimal fulfillment...');
      fulfillmentResult = await tryFulfillment4(orderId, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    }
    
    // Step 6: Add order note and tags if successful
    if (fulfillmentResult.success) {
      console.log('📝 Adding order note and tags...');
      
      const noteText = matchingLead 
        ? `PrimeCOD: Package shipped with tracking ${trackingNumber || 'N/A'} (${matchingLead.reference}) - COD delivery in progress`
        : `Order #${orderNumber} fulfilled manually via PrimeCOD integration`;
      
      await addOrderNote(orderId, noteText, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
      
      const tags = ['primecod-shipped', 'cod-in-transit', 'manual-fulfillment'];
      if (matchingLead) {
        tags.push(`primecod-${matchingLead.reference}`);
      }
      
      await updateOrderTags(orderId, tags, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    }
    
    // Step 7: Get final order status
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
      success: fulfillmentResult.success,
      message: fulfillmentResult.success 
        ? `Order #${orderNumber} successfully fulfilled!` 
        : `Failed to fulfill order #${orderNumber} - all methods tried`,
      
      order_details: {
        shopify_order_id: orderId,
        order_number: order.order_number,
        customer_email: order.customer?.email,
        initial_status: {
          financial: order.financial_status,
          fulfillment: order.fulfillment_status
        }
      },
      
      primecod_details: {
        reference: matchingLead?.reference || 'Not found',
        tracking_number: trackingNumber || 'Not available',
        shipping_status: matchingLead?.shipping_status || 'Unknown'
      },
      
      fulfillment_attempts: fulfillmentResult.attempts,
      
      final_status: {
        fulfillment_status: finalOrderData.order?.fulfillment_status,
        financial_status: finalOrderData.order?.financial_status,
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

// Approach 1: Simple fulfillment
async function tryFulfillment1(orderId, trackingNumber, shopifyStore, shopifyAccessToken) {
  const fulfillmentData = {
    fulfillment: {
      notify_customer: true
    }
  };
  
  if (trackingNumber) {
    fulfillmentData.fulfillment.tracking_number = trackingNumber;
    fulfillmentData.fulfillment.tracking_company = 'PrimeCOD';
  }
  
  const response = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fulfillmentData)
    }
  );
  
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  
  return {
    success: response.ok,
    method: 'Simple fulfillment',
    status: response.status,
    response: data,
    attempts: [{ method: 'Simple', success: response.ok, status: response.status }]
  };
}

// Approach 2: With location_id
async function tryFulfillment2(orderId, trackingNumber, locationId, shopifyStore, shopifyAccessToken) {
  const fulfillmentData = {
    fulfillment: {
      location_id: locationId,
      notify_customer: true
    }
  };
  
  if (trackingNumber) {
    fulfillmentData.fulfillment.tracking_number = trackingNumber;
    fulfillmentData.fulfillment.tracking_company = 'PrimeCOD';
  }
  
  const response = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fulfillmentData)
    }
  );
  
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  
  return {
    success: response.ok,
    method: 'With location_id',
    status: response.status,
    response: data,
    attempts: [{ method: 'With location', success: response.ok, status: response.status }]
  };
}

// Approach 3: With line items
async function tryFulfillment3(orderId, trackingNumber, locationId, lineItems, shopifyStore, shopifyAccessToken) {
  const fulfillmentData = {
    fulfillment: {
      notify_customer: true,
      line_items: lineItems.map(item => ({
        id: item.id,
        quantity: item.quantity
      }))
    }
  };
  
  if (locationId) {
    fulfillmentData.fulfillment.location_id = locationId;
  }
  
  if (trackingNumber) {
    fulfillmentData.fulfillment.tracking_number = trackingNumber;
    fulfillmentData.fulfillment.tracking_company = 'PrimeCOD';
  }
  
  const response = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fulfillmentData)
    }
  );
  
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  
  return {
    success: response.ok,
    method: 'With line items',
    status: response.status,
    response: data,
    attempts: [{ method: 'With line items', success: response.ok, status: response.status }]
  };
}

// Approach 4: Minimal fulfillment
async function tryFulfillment4(orderId, shopifyStore, shopifyAccessToken) {
  const fulfillmentData = {
    fulfillment: {}
  };
  
  const response = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fulfillmentData)
    }
  );
  
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  
  return {
    success: response.ok,
    method: 'Minimal fulfillment',
    status: response.status,
    response: data,
    attempts: [{ method: 'Minimal', success: response.ok, status: response.status }]
  };
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

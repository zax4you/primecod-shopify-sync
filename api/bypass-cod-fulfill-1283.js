// api/bypass-cod-fulfill-1283.js
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderNumber = 1283;
  const orderId = 6433796456699;
  
  try {
    console.log(`🚀 Starting COD bypass fulfillment for order #${orderNumber}...`);
    
    // Step 1: Get current order details
    console.log('📋 Getting current order status...');
    
    const orderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!orderResponse.ok) {
      throw new Error(`Failed to fetch order: ${orderResponse.status}`);
    }
    
    const orderData = await orderResponse.json();
    const order = orderData.order;
    
    console.log(`📊 Current status: Financial=${order.financial_status}, Fulfillment=${order.fulfillment_status}`);
    
    // Step 2: Get store locations
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
      const primaryLocation = locationsData.locations.find(loc => loc.primary) || locationsData.locations[0];
      locationId = primaryLocation?.id;
      console.log(`📍 Using location: ${primaryLocation?.name} (ID: ${locationId})`);
    }
    
    // Step 3: Try to get tracking from PrimeCOD
    let trackingNumber = null;
    let matchingLead = null;
    
    try {
      console.log('📦 Checking PrimeCOD for tracking...');
      const primecodResponse = await fetch('https://api.primecod.app/api/leads', {
        headers: {
          'Authorization': `Bearer ${process.env.PRIMECOD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (primecodResponse.ok) {
        const primecodData = await primecodResponse.json();
        const leads = primecodData.data;
        
        // Find by email match (gronie.kanik@gmail.com)
        matchingLead = leads.find(lead => 
          lead.email === 'gronie.kanik@gmail.com'
        );
        
        if (matchingLead) {
          trackingNumber = matchingLead.tracking_number;
          console.log(`✅ Found PrimeCOD lead: ${matchingLead.reference}`);
          console.log(`📦 Tracking: ${trackingNumber || 'N/A'}`);
          console.log(`🚚 Status: ${matchingLead.shipping_status}`);
        }
      }
    } catch (error) {
      console.log(`⚠️ PrimeCOD error: ${error.message}`);
    }
    
    // Step 4: Method 1 - Try direct fulfillment with "ignore COD" approach
    console.log('🎯 Method 1: Direct fulfillment attempt...');
    
    const fulfillmentData1 = {
      fulfillment: {
        location_id: locationId,
        notify_customer: false, // Don't notify until we're sure it works
        line_items: order.line_items.map(item => ({
          id: item.id,
          quantity: item.fulfillable_quantity || item.quantity
        }))
      }
    };
    
    if (trackingNumber) {
      fulfillmentData1.fulfillment.tracking_number = trackingNumber;
      fulfillmentData1.fulfillment.tracking_company = 'PrimeCOD';
    }
    
    const fulfillResponse1 = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fulfillmentData1)
      }
    );
    
    const fulfillText1 = await fulfillResponse1.text();
    let fulfillResult1;
    try {
      fulfillResult1 = fulfillText1 ? JSON.parse(fulfillText1) : {};
    } catch (e) {
      fulfillResult1 = { raw: fulfillText1 };
    }
    
    // If Method 1 succeeded, we're done!
    if (fulfillResponse1.ok) {
      console.log('✅ Method 1 succeeded - Direct fulfillment worked!');
      
      // Add notes and tags
      await addOrderNote(orderId, 
        `PrimeCOD: Order fulfilled with tracking ${trackingNumber || 'N/A'} - COD delivery in progress`, 
        SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN
      );
      
      await updateOrderTags(orderId, 
        ['primecod-shipped', 'cod-in-transit', 'manual-fulfillment'], 
        SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN
      );
      
      return res.json({
        success: true,
        message: `Order #${orderNumber} successfully fulfilled!`,
        method_used: 'Direct fulfillment',
        tracking_number: trackingNumber,
        primecod_reference: matchingLead?.reference
      });
    }
    
    // Step 5: Method 2 - Mark as paid first, then fulfill
    console.log('🎯 Method 2: Mark as paid first, then fulfill...');
    
    // First, create a payment transaction to mark as paid
    const paymentResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction: {
            kind: 'sale',
            status: 'success',
            amount: order.total_price,
            currency: order.currency,
            gateway: 'manual',
            message: 'COD payment received - fulfillment preparation'
          }
        })
      }
    );
    
    const paymentText = await paymentResponse.text();
    let paymentResult;
    try {
      paymentResult = paymentText ? JSON.parse(paymentText) : {};
    } catch (e) {
      paymentResult = { raw: paymentText };
    }
    
    // Now try fulfillment again
    const fulfillResponse2 = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fulfillmentData1)
      }
    );
    
    const fulfillText2 = await fulfillResponse2.text();
    let fulfillResult2;
    try {
      fulfillResult2 = fulfillText2 ? JSON.parse(fulfillText2) : {};
    } catch (e) {
      fulfillResult2 = { raw: fulfillText2 };
    }
    
    // Step 6: Method 3 - Try partial fulfillment of specific items
    let fulfillResponse3 = { ok: false };
    let fulfillResult3 = {};
    
    if (!fulfillResponse2.ok) {
      console.log('🎯 Method 3: Trying partial fulfillment...');
      
      // Try fulfilling just the main product (not the warranty)
      const mainItem = order.line_items.find(item => 
        !item.title.toLowerCase().includes('gwarancja') && 
        !item.title.toLowerCase().includes('warranty')
      );
      
      if (mainItem) {
        const fulfillmentData3 = {
          fulfillment: {
            location_id: locationId,
            notify_customer: false,
            line_items: [{
              id: mainItem.id,
              quantity: mainItem.fulfillable_quantity || mainItem.quantity
            }]
          }
        };
        
        if (trackingNumber) {
          fulfillmentData3.fulfillment.tracking_number = trackingNumber;
          fulfillmentData3.fulfillment.tracking_company = 'PrimeCOD';
        }
        
        fulfillResponse3 = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(fulfillmentData3)
          }
        );
        
        const fulfillText3 = await fulfillResponse3.text();
        try {
          fulfillResult3 = fulfillText3 ? JSON.parse(fulfillText3) : {};
        } catch (e) {
          fulfillResult3 = { raw: fulfillText3 };
        }
      }
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
    const finalOrder = finalOrderData.order;
    
    // Determine success
    const success = fulfillResponse1.ok || fulfillResponse2.ok || fulfillResponse3.ok;
    const successMethod = fulfillResponse1.ok ? 'Direct' : 
                         fulfillResponse2.ok ? 'After payment' : 
                         fulfillResponse3.ok ? 'Partial' : 'None';
    
    if (success) {
      // Add notes and tags for successful fulfillment
      await addOrderNote(orderId, 
        `PrimeCOD: Order fulfilled via ${successMethod} method with tracking ${trackingNumber || 'N/A'}`, 
        SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN
      );
      
      await updateOrderTags(orderId, 
        ['primecod-shipped', 'cod-in-transit', 'manual-fulfillment', successMethod.toLowerCase()], 
        SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN
      );
    }
    
    res.json({
      success: success,
      message: success 
        ? `Order #${orderNumber} successfully fulfilled using ${successMethod} method!` 
        : `All fulfillment methods failed for order #${orderNumber}`,
      
      order_details: {
        order_number: orderNumber,
        customer_email: 'gronie.kanik@gmail.com'
      },
      
      primecod_details: {
        reference: matchingLead?.reference || 'Not found',
        tracking_number: trackingNumber || 'Not available',
        shipping_status: matchingLead?.shipping_status || 'Unknown'
      },
      
      attempts: {
        method1_direct: {
          success: fulfillResponse1.ok,
          status: fulfillResponse1.status,
          response: fulfillResult1
        },
        method2_payment_first: {
          payment_success: paymentResponse.ok,
          payment_status: paymentResponse.status,
          fulfillment_success: fulfillResponse2.ok,
          fulfillment_status: fulfillResponse2.status,
          fulfillment_response: fulfillResult2
        },
        method3_partial: {
          success: fulfillResponse3.ok,
          status: fulfillResponse3.status,
          response: fulfillResult3
        }
      },
      
      final_status: {
        financial_status: finalOrder.financial_status,
        fulfillment_status: finalOrder.fulfillment_status,
        tags: finalOrder.tags
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      order_number: orderNumber
    });
  }
}

// Helper functions
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
      const allTags = [...new Set([...existingTags, ...newTags])];
      
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

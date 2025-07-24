// api/manual-fulfill-1283.js
// Mimicking the exact flow that happens when you click "Fulfill items" in Shopify admin
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderNumber = 1283;
  const orderId = 6433796456699;
  
  try {
    console.log(`🎯 Manual fulfillment attempt for order #${orderNumber}...`);
    
    // Step 1: Get the full order details first
    console.log('📋 Getting complete order details...');
    
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
    
    console.log(`📊 Order details:`);
    console.log(`   Financial Status: ${order.financial_status}`);
    console.log(`   Fulfillment Status: ${order.fulfillment_status}`);
    console.log(`   Line Items: ${order.line_items.length}`);
    
    // Step 2: Try to get PrimeCOD tracking
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
        
        // Search for this specific customer
        matchingLead = leads.find(lead => {
          if (lead.email !== 'gronie.kanik@gmail.com') return false;
          
          // Also check if order dates are close
          const orderDate = new Date(order.created_at);
          const leadDate = new Date(lead.created_at);
          const daysDiff = Math.abs(orderDate - leadDate) / (1000 * 60 * 60 * 24);
          
          return daysDiff <= 5; // Within 5 days
        });
        
        if (matchingLead) {
          trackingNumber = matchingLead.tracking_number;
          console.log(`✅ Found PrimeCOD lead: ${matchingLead.reference}`);
          console.log(`📦 Tracking: ${trackingNumber || 'Not available'}`);
          console.log(`🚚 Shipping Status: ${matchingLead.shipping_status}`);
          console.log(`📅 Lead Date: ${lead.created_at}`);
        } else {
          console.log('❌ No matching PrimeCOD lead found');
          // List all leads for this email for debugging
          const emailLeads = leads.filter(lead => lead.email === 'gronie.kanik@gmail.com');
          console.log(`📧 Found ${emailLeads.length} leads for this email:`);
          emailLeads.forEach(lead => {
            console.log(`   - ${lead.reference}: ${lead.created_at} (${lead.shipping_status})`);
          });
        }
      }
    } catch (error) {
      console.log(`⚠️ PrimeCOD API error: ${error.message}`);
    }
    
    // Step 3: Get store locations
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
      console.log(`📍 Found ${locationsData.locations.length} locations`);
      
      // Try to find the best location
      const primaryLocation = locationsData.locations.find(loc => loc.primary);
      const activeLocation = locationsData.locations.find(loc => loc.active);
      locationId = primaryLocation?.id || activeLocation?.id || locationsData.locations[0]?.id;
      
      console.log(`📍 Using location ID: ${locationId}`);
      if (primaryLocation) console.log(`   Name: ${primaryLocation.name}`);
    }
    
    // Step 4: Try the simplest possible fulfillment (what the UI would do)
    console.log('🚀 Attempting simplest fulfillment...');
    
    const simpleFulfillmentData = {
      fulfillment: {}
    };
    
    // Add tracking if we have it
    if (trackingNumber) {
      simpleFulfillmentData.fulfillment.tracking_number = trackingNumber;
      simpleFulfillmentData.fulfillment.tracking_company = 'PrimeCOD';
    }
    
    // Add location if we have it
    if (locationId) {
      simpleFulfillmentData.fulfillment.location_id = locationId;
    }
    
    const simpleResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(simpleFulfillmentData)
      }
    );
    
    const simpleText = await simpleResponse.text();
    let simpleResult;
    try {
      simpleResult = simpleText ? JSON.parse(simpleText) : {};
    } catch (e) {
      simpleResult = { raw: simpleText };
    }
    
    console.log(`📝 Simple fulfillment result: ${simpleResponse.status}`);
    
    // Step 5: If that failed, try with manual payment gateway approach
    let paymentResult = null;
    
    if (!simpleResponse.ok) {
      console.log('💰 Trying to handle payment first...');
      
      // Try to mark the order as if it has a manual payment method
      const paymentUpdateResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
        {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            order: {
              id: orderId,
              gateway: 'manual',
              processing_method: 'manual'
            }
          })
        }
      );
      
      const paymentText = await paymentUpdateResponse.text();
      try {
        paymentResult = {
          success: paymentUpdateResponse.ok,
          status: paymentUpdateResponse.status,
          response: paymentText ? JSON.parse(paymentText) : {}
        };
      } catch (e) {
        paymentResult = {
          success: paymentUpdateResponse.ok,
          status: paymentUpdateResponse.status,
          response: { raw: paymentText }
        };
      }
      
      // Try fulfillment again after payment update
      if (paymentUpdateResponse.ok) {
        console.log('🔄 Retrying fulfillment after payment update...');
        
        const retryResponse = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(simpleFulfillmentData)
          }
        );
        
        const retryText = await retryResponse.text();
        try {
          simpleResult = {
            ...simpleResult,
            retry: {
              success: retryResponse.ok,
              status: retryResponse.status,
              response: retryText ? JSON.parse(retryText) : {}
            }
          };
        } catch (e) {
          simpleResult.retry = {
            success: retryResponse.ok,
            status: retryResponse.status,
            response: { raw: retryText }
          };
        }
        
        if (retryResponse.ok) {
          simpleResponse.ok = true; // Update success status
        }
      }
    }
    
    // Step 6: If still failed, try with explicit line items
    if (!simpleResponse.ok) {
      console.log('📦 Trying with explicit line items...');
      
      const lineItemsFulfillmentData = {
        fulfillment: {
          line_items: order.line_items.map(item => ({
            id: item.id,
            quantity: item.quantity
          }))
        }
      };
      
      if (trackingNumber) {
        lineItemsFulfillmentData.fulfillment.tracking_number = trackingNumber;
        lineItemsFulfillmentData.fulfillment.tracking_company = 'PrimeCOD';
      }
      
      if (locationId) {
        lineItemsFulfillmentData.fulfillment.location_id = locationId;
      }
      
      const lineItemsResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(lineItemsFulfillmentData)
        }
      );
      
      const lineItemsText = await lineItemsResponse.text();
      try {
        simpleResult.lineItems = {
          success: lineItemsResponse.ok,
          status: lineItemsResponse.status,
          response: lineItemsText ? JSON.parse(lineItemsText) : {}
        };
      } catch (e) {
        simpleResult.lineItems = {
          success: lineItemsResponse.ok,
          status: lineItemsResponse.status,
          response: { raw: lineItemsText }
        };
      }
      
      if (lineItemsResponse.ok) {
        simpleResponse.ok = true; // Update success status
      }
    }
    
    // Step 7: Get final order status
    const finalResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const finalData = await finalResponse.json();
    const finalOrder = finalData.order;
    
    // Step 8: Add notes if successful
    const success = simpleResponse.ok || finalOrder.fulfillment_status;
    
    if (success) {
      console.log('✅ Adding success notes...');
      
      const noteText = matchingLead 
        ? `PrimeCOD Integration: Order fulfilled with tracking ${trackingNumber || 'N/A'} (${matchingLead.reference})`
        : `Order #${orderNumber} manually fulfilled via API integration`;
      
      await addOrderNote(orderId, noteText, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    }
    
    res.json({
      success: success,
      message: success 
        ? `Order #${orderNumber} successfully fulfilled!`
        : `Manual fulfillment failed for order #${orderNumber}`,
      
      order_details: {
        order_number: orderNumber,
        customer_email: order.customer?.email,
        initial_status: {
          financial: order.financial_status,
          fulfillment: order.fulfillment_status
        }
      },
      
      primecod_details: {
        reference: matchingLead?.reference || 'Not found',
        tracking_number: trackingNumber || 'Not available',
        shipping_status: matchingLead?.shipping_status || 'Unknown',
        lead_found: !!matchingLead
      },
      
      fulfillment_attempts: {
        simple_fulfillment: {
          success: simpleResponse.ok,
          status: simpleResponse.status,
          response: simpleResult
        },
        payment_update: paymentResult
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

// Helper function
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

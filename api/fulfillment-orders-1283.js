// api/fulfillment-orders-1283.js
// Using the newer Fulfillment Orders API that replaced the legacy fulfillment API
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderNumber = 1283;
  const orderId = 6433796456699;
  
  try {
    console.log(`🚀 Using Fulfillment Orders API for order #${orderNumber}...`);
    
    // Step 1: Get fulfillment orders for this order
    console.log('📋 Getting fulfillment orders...');
    
    const fulfillmentOrdersResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillment_orders.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!fulfillmentOrdersResponse.ok) {
      throw new Error(`Failed to get fulfillment orders: ${fulfillmentOrdersResponse.status}`);
    }
    
    const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
    const fulfillmentOrders = fulfillmentOrdersData.fulfillment_orders;
    
    console.log(`📦 Found ${fulfillmentOrders.length} fulfillment orders`);
    
    if (fulfillmentOrders.length === 0) {
      return res.status(404).json({
        error: 'No fulfillment orders found',
        message: 'This order may not be ready for fulfillment'
      });
    }
    
    // Step 2: Try to get tracking from PrimeCOD
    let trackingNumber = null;
    let matchingLead = null;
    
    try {
      console.log('📦 Checking PrimeCOD...');
      const primecodResponse = await fetch('https://api.primecod.app/api/leads', {
        headers: {
          'Authorization': `Bearer ${process.env.PRIMECOD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (primecodResponse.ok) {
        const primecodData = await primecodResponse.json();
        const leads = primecodData.data;
        
        // Find by exact email match
        matchingLead = leads.find(lead => 
          lead.email === 'gronie.kanik@gmail.com'
        );
        
        if (matchingLead) {
          trackingNumber = matchingLead.tracking_number;
          console.log(`✅ Found PrimeCOD lead: ${matchingLead.reference}`);
          console.log(`📦 Tracking: ${trackingNumber || 'N/A'}`);
        }
      }
    } catch (error) {
      console.log(`⚠️ PrimeCOD error: ${error.message}`);
    }
    
    // Step 3: Process each fulfillment order
    const results = [];
    
    for (const fulfillmentOrder of fulfillmentOrders) {
      console.log(`🔄 Processing fulfillment order: ${fulfillmentOrder.id}`);
      
      // Method 1: Try direct fulfillment creation
      const fulfillmentData = {
        fulfillment: {
          line_items: fulfillmentOrder.line_items.map(item => ({
            id: item.id,
            quantity: item.quantity
          })),
          notify_customer: true
        }
      };
      
      if (trackingNumber) {
        fulfillmentData.fulfillment.tracking_info = {
          number: trackingNumber,
          company: 'PrimeCOD',
          url: `https://track.primecod.app/${trackingNumber}`
        };
      }
      
      console.log('🎯 Attempting fulfillment creation...');
      
      const createFulfillmentResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/fulfillments.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fulfillmentData)
        }
      );
      
      const fulfillmentText = await createFulfillmentResponse.text();
      let fulfillmentResult;
      try {
        fulfillmentResult = fulfillmentText ? JSON.parse(fulfillmentText) : {};
      } catch (e) {
        fulfillmentResult = { raw: fulfillmentText };
      }
      
      results.push({
        fulfillment_order_id: fulfillmentOrder.id,
        method: 'Direct creation',
        success: createFulfillmentResponse.ok,
        status: createFulfillmentResponse.status,
        response: fulfillmentResult
      });
      
      // If direct creation failed, try GraphQL approach
      if (!createFulfillmentResponse.ok) {
        console.log('🔄 Trying GraphQL fulfillment...');
        
        const graphqlQuery = `
          mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
            fulfillmentCreate(fulfillment: $fulfillment) {
              fulfillment {
                id
                status
                trackingInfo {
                  number
                  company
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        const graphqlVariables = {
          fulfillment: {
            lineItems: fulfillmentOrder.line_items.map(item => ({
              id: `gid://shopify/FulfillmentOrderLineItem/${item.id}`,
              quantity: item.quantity
            })),
            notifyCustomer: true
          }
        };
        
        if (trackingNumber) {
          graphqlVariables.fulfillment.trackingInfo = {
            number: trackingNumber,
            company: 'PrimeCOD'
          };
        }
        
        const graphqlResponse = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: graphqlQuery,
              variables: graphqlVariables
            })
          }
        );
        
        const graphqlText = await graphqlResponse.text();
        let graphqlResult;
        try {
          graphqlResult = graphqlText ? JSON.parse(graphqlText) : {};
        } catch (e) {
          graphqlResult = { raw: graphqlText };
        }
        
        results.push({
          fulfillment_order_id: fulfillmentOrder.id,
          method: 'GraphQL',
          success: graphqlResponse.ok && !graphqlResult.data?.fulfillmentCreate?.userErrors?.length,
          status: graphqlResponse.status,
          response: graphqlResult
        });
      }
    }
    
    // Step 4: Try the "Mark as Shipped" approach as alternative
    console.log('🚢 Trying manual "Mark as Shipped" approach...');
    
    const shipmentData = {
      fulfillment: {
        location_id: 74474365179, // Use default location
        tracking_number: trackingNumber || 'PRIMECOD-MANUAL',
        tracking_company: 'PrimeCOD',
        notify_customer: false, // Don't notify until we're sure
      }
    };
    
    const shipmentResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(shipmentData)
      }
    );
    
    const shipmentText = await shipmentResponse.text();
    let shipmentResult;
    try {
      shipmentResult = shipmentText ? JSON.parse(shipmentText) : {};
    } catch (e) {
      shipmentResult = { raw: shipmentText };
    }
    
    // Step 5: If nothing worked, try the "bypass COD" trick
    let bypassResult = null;
    const anySuccess = results.some(r => r.success) || shipmentResponse.ok;
    
    if (!anySuccess) {
      console.log('💡 Trying COD bypass method...');
      
      // First, try to update order to remove COD restriction
      const orderUpdateResponse = await fetch(
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
              note: `PrimeCOD Integration: Manual fulfillment requested for tracking ${trackingNumber || 'N/A'}`
            }
          })
        }
      );
      
      // Then try fulfillment again with minimal data
      const minimalFulfillmentData = {
        fulfillment: {
          notify_customer: false
        }
      };
      
      const bypassResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/fulfillments.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(minimalFulfillmentData)
        }
      );
      
      const bypassText = await bypassResponse.text();
      try {
        bypassResult = {
          success: bypassResponse.ok,
          status: bypassResponse.status,
          response: bypassText ? JSON.parse(bypassText) : {}
        };
      } catch (e) {
        bypassResult = {
          success: bypassResponse.ok,
          status: bypassResponse.status,
          response: { raw: bypassText }
        };
      }
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
    const finalOrder = finalOrderData.order;
    
    // Determine overall success
    const overallSuccess = results.some(r => r.success) || 
                          shipmentResponse.ok || 
                          (bypassResult && bypassResult.success) ||
                          finalOrder.fulfillment_status === 'fulfilled';
    
    res.json({
      success: overallSuccess,
      message: overallSuccess 
        ? `Order #${orderNumber} fulfillment successful!`
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
      
      fulfillment_orders_found: fulfillmentOrders.length,
      
      attempts: {
        fulfillment_orders_api: results,
        manual_shipment: {
          success: shipmentResponse.ok,
          status: shipmentResponse.status,
          response: shipmentResult
        },
        cod_bypass: bypassResult
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

// api/correct-fulfillment-approach.js
// Using the CORRECT modern Shopify fulfillment process via FulfillmentOrders
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const testOrderId = 6431141593339; // Order #1266
  const testOrderNumber = 1266;
  
  try {
    console.log('🎯 Using CORRECT modern fulfillment process...');
    
    // Step 1: Get the FulfillmentOrders for this order (the modern way)
    console.log('📋 Getting FulfillmentOrders for the order...');
    
    const fulfillmentOrdersQuery = `
      query getFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) {
          id
          name
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                status
                assignedLocation {
                  id
                  name
                }
                lineItems(first: 20) {
                  edges {
                    node {
                      id
                      quantity
                      lineItem {
                        id
                        title
                        sku
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const fulfillmentOrdersResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: fulfillmentOrdersQuery,
          variables: {
            orderId: `gid://shopify/Order/${testOrderId}`
          }
        })
      }
    );
    
    const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
    
    if (!fulfillmentOrdersResponse.ok || fulfillmentOrdersData.errors) {
      throw new Error(`Failed to get fulfillment orders: ${JSON.stringify(fulfillmentOrdersData.errors || 'Unknown error')}`);
    }
    
    const order = fulfillmentOrdersData.data.order;
    const fulfillmentOrders = order.fulfillmentOrders.edges;
    
    console.log(`📦 Found ${fulfillmentOrders.length} fulfillment orders`);
    
    if (fulfillmentOrders.length === 0) {
      return res.status(404).json({
        error: 'No fulfillment orders found for this order',
        order_id: testOrderId
      });
    }
    
    // Step 2: Process each fulfillment order
    const fulfillmentResults = [];
    
    for (const fulfillmentOrderEdge of fulfillmentOrders) {
      const fulfillmentOrder = fulfillmentOrderEdge.node;
      
      console.log(`🔄 Processing fulfillment order: ${fulfillmentOrder.id}`);
      console.log(`📍 Location: ${fulfillmentOrder.assignedLocation.name}`);
      console.log(`📊 Status: ${fulfillmentOrder.status}`);
      
      // Step 3: Create fulfillment using the CORRECT modern API
      const fulfillmentMutation = `
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
      
      // Build line items using FulfillmentOrderLineItem IDs (not Order LineItem IDs!)
      const fulfillmentLineItems = fulfillmentOrder.lineItems.edges.map(edge => ({
        id: edge.node.id, // This is the FulfillmentOrderLineItem ID!
        quantity: edge.node.quantity
      }));
      
      const fulfillmentVariables = {
        fulfillment: {
          lineItems: fulfillmentLineItems,
          locationId: fulfillmentOrder.assignedLocation.id,
          trackingInfo: {
            number: `PRIMECOD-CORRECT-${Date.now()}`,
            company: "PrimeCOD"
          },
          notifyCustomer: false // Don't notify until we're sure it works
        }
      };
      
      console.log('📦 Creating fulfillment with correct API...');
      console.log('📋 Variables:', JSON.stringify(fulfillmentVariables, null, 2));
      
      const fulfillmentResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: fulfillmentMutation,
            variables: fulfillmentVariables
          })
        }
      );
      
      const fulfillmentData = await fulfillmentResponse.json();
      
      const isSuccess = fulfillmentResponse.ok && 
                       fulfillmentData.data?.fulfillmentCreate?.fulfillment &&
                       (!fulfillmentData.data.fulfillmentCreate.userErrors || 
                        fulfillmentData.data.fulfillmentCreate.userErrors.length === 0);
      
      fulfillmentResults.push({
        fulfillment_order_id: fulfillmentOrder.id,
        location: fulfillmentOrder.assignedLocation.name,
        status: fulfillmentOrder.status,
        success: isSuccess,
        response: fulfillmentData,
        user_errors: fulfillmentData.data?.fulfillmentCreate?.userErrors || []
      });
      
      console.log(`📦 Fulfillment result: ${isSuccess ? 'SUCCESS' : 'FAILED'}`);
      
      if (!isSuccess && fulfillmentData.data?.fulfillmentCreate?.userErrors) {
        console.log('❌ User errors:', fulfillmentData.data.fulfillmentCreate.userErrors);
      }
    }
    
    // Step 4: Get final order status
    const finalOrderQuery = `
      query getFinalOrder($orderId: ID!) {
        order(id: $orderId) {
          id
          fulfillmentStatus
          fulfillments(first: 10) {
            id
            status
            trackingInfo {
              number
              company
            }
          }
        }
      }
    `;
    
    const finalOrderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: finalOrderQuery,
          variables: {
            orderId: `gid://shopify/Order/${testOrderId}`
          }
        })
      }
    );
    
    const finalOrderData = await finalOrderResponse.json();
    
    const overallSuccess = fulfillmentResults.some(result => result.success);
    
    res.json({
      success: overallSuccess,
      message: overallSuccess 
        ? `Order #${testOrderNumber} fulfilled using CORRECT modern API!`
        : `Modern fulfillment API failed for order #${testOrderNumber}`,
      
      approach: "Modern FulfillmentOrders API (correct method)",
      
      fulfillment_orders_found: fulfillmentOrders.length,
      
      fulfillment_orders: fulfillmentOrders.map(edge => ({
        id: edge.node.id,
        status: edge.node.status,
        location: edge.node.assignedLocation.name,
        line_items_count: edge.node.lineItems.edges.length
      })),
      
      fulfillment_results: fulfillmentResults,
      
      final_order_status: {
        fulfillment_status: finalOrderData.data?.order?.fulfillmentStatus,
        fulfillments: finalOrderData.data?.order?.fulfillments || []
      },
      
      key_insights: [
        "Used modern FulfillmentOrders API instead of legacy fulfillment API",
        "Referenced FulfillmentOrderLineItem IDs instead of Order LineItem IDs", 
        "Used GraphQL fulfillmentCreate mutation instead of REST API",
        "This is the correct approach per Shopify documentation"
      ]
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      test_order: testOrderNumber
    });
  }
}

// api/order-1251-fixed-fulfillment.js
// FIXED VERSION with correct GraphQL structure for fulfillment
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    console.log('🚀 FIXED FULFILLMENT TEST for Order #1251');
    
    // Step 1: Get Order #1251 directly
    const orderId = "6428610822395";
    
    const getOrderQuery = `
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          legacyResourceId
          name
          email
          phone
          displayFinancialStatus
          displayFulfillmentStatus
          paymentGatewayNames
          tags
        }
      }
    `;
    
    const getOrderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: getOrderQuery,
          variables: {
            id: `gid://shopify/Order/${orderId}`
          }
        })
      }
    );
    
    const orderData = await getOrderResponse.json();
    const order = orderData.data.order;
    
    console.log(`✅ Found Order ${order.name}`);
    console.log(`📧 Email: ${order.email}`);
    console.log(`💰 Status: ${order.displayFinancialStatus}/${order.displayFulfillmentStatus}`);
    
    // Step 2: Get Fulfillment Orders
    const fulfillmentOrdersQuery = `
      query getFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) {
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                status
                assignedLocation {
                  location {
                    id
                    name
                  }
                }
                lineItems(first: 20) {
                  edges {
                    node {
                      id
                      totalQuantity
                      remainingQuantity
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
            orderId: order.id
          }
        })
      }
    );
    
    const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
    const fulfillmentOrders = fulfillmentOrdersData.data.order.fulfillmentOrders.edges;
    
    console.log(`📦 Found ${fulfillmentOrders.length} fulfillment orders`);
    
    if (fulfillmentOrders.length === 0) {
      return res.json({
        success: false,
        error: "No fulfillment orders found",
        order_status: order.displayFulfillmentStatus
      });
    }
    
    const fulfillmentOrder = fulfillmentOrders[0].node;
    const testTrackingNumber = `FIXED-1251-${Date.now()}`;
    
    console.log(`🔄 Processing fulfillment order: ${fulfillmentOrder.id}`);
    console.log(`📍 Location: ${fulfillmentOrder.assignedLocation.location.name}`);
    console.log(`📦 Using tracking: ${testTrackingNumber}`);
    
    // Step 3: Create fulfillment with CORRECT structure
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
    
    // CORRECT STRUCTURE for modern Fulfillment Orders API
    const fulfillmentVariables = {
      fulfillment: {
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: fulfillmentOrder.id,
            fulfillmentOrderLineItems: fulfillmentOrder.lineItems.edges.map(edge => ({
              id: edge.node.id,
              quantity: edge.node.remainingQuantity || edge.node.totalQuantity
            }))
          }
        ],
        trackingInfo: {
          number: testTrackingNumber,
          company: "Test Fulfillment"
        },
        notifyCustomer: true
      }
    };
    
    console.log('📦 Creating fulfillment with CORRECT structure...');
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
    
    console.log('📝 Fulfillment Response:', JSON.stringify(fulfillmentData, null, 2));
    
    const fulfillmentSuccess = fulfillmentResponse.ok && 
                              fulfillmentData.data?.fulfillmentCreate?.fulfillment &&
                              (!fulfillmentData.data.fulfillmentCreate.userErrors || 
                               fulfillmentData.data.fulfillmentCreate.userErrors.length === 0);
    
    if (fulfillmentSuccess) {
      console.log(`🎉 SUCCESS: Fulfillment created!`);
      console.log(`📦 Fulfillment ID: ${fulfillmentData.data.fulfillmentCreate.fulfillment.id}`);
      
      // Add success note
      const successNote = `🎉 FULFILLMENT SUCCESS! Order #1251 fulfilled via corrected GraphQL API structure. Tracking: ${testTrackingNumber}. Modern Fulfillment Orders API working!`;
      
      await fetch(
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
              note: successNote
            }
          })
        }
      );
      
      return res.json({
        success: true,
        message: "🎉 ORDER #1251 FULFILLMENT SUCCESS!",
        fulfillment_id: fulfillmentData.data.fulfillmentCreate.fulfillment.id,
        tracking_number: testTrackingNumber,
        integration_status: "🚀 READY FOR PRODUCTION",
        next_steps: [
          "✅ Modern Fulfillment Orders API working",
          "✅ Update main sync-orders.js with correct structure",
          "✅ Enable automated fulfillment for all orders",
          "✅ Deploy to production"
        ]
      });
      
    } else {
      console.log(`❌ FAILED: Fulfillment creation failed`);
      
      return res.json({
        success: false,
        message: "Fulfillment still failed with corrected structure",
        errors: fulfillmentData.errors,
        user_errors: fulfillmentData.data?.fulfillmentCreate?.userErrors,
        full_response: fulfillmentData,
        variables_sent: fulfillmentVariables
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message
    });
  }
}

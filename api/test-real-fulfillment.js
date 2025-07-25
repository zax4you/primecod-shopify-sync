// api/test-real-fulfillment.js - Test fulfillment with your actual delivered order
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🧪 Testing fulfillment with real delivered order...');

    // Use one of your actual delivered orders
    const testOrderReference = 'PCOD-4663628'; // Has tracking: 523000015008304088449263
    
    const result = await testSpecificDeliveredOrder(
      testOrderReference, 
      SHOPIFY_STORE, 
      SHOPIFY_ACCESS_TOKEN, 
      PRIMECOD_TOKEN
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        message: `Fulfillment test completed for ${testOrderReference}`,
        test_results: result,
        next_steps: result.processing_result 
          ? "✅ Processing successful - ready for full automation!"
          : "⚠️ No updates made - order may already be processed or no Shopify match found"
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: "Fulfillment test failed"
      });
    }

  } catch (error) {
    console.error('💥 Test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Core fulfillment function optimized for your data
async function fulfillOrderWithTracking(orderId, trackingNumber, shopifyStore, shopifyAccessToken) {
  try {
    console.log(`🚚 Fulfilling order ${orderId} with tracking: ${trackingNumber || 'N/A'}`);

    // Step 1: Get fulfillment orders
    const fulfillmentOrdersQuery = `
      query GetFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) {
          id
          name
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                status
                lineItems(first: 50) {
                  edges {
                    node {
                      id
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

    const fulfillmentOrdersResponse = await fetch(`https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: fulfillmentOrdersQuery,
        variables: { orderId: `gid://shopify/Order/${orderId}` }
      })
    });

    const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
    
    if (fulfillmentOrdersData.errors) {
      console.error('❌ GraphQL errors:', fulfillmentOrdersData.errors);
      return { success: false, error: 'GraphQL query failed', details: fulfillmentOrdersData.errors };
    }

    const order = fulfillmentOrdersData.data?.order;
    if (!order) {
      return { success: false, error: 'Order not found', orderId };
    }

    const fulfillmentOrders = order.fulfillmentOrders?.edges || [];
    if (fulfillmentOrders.length === 0) {
      return { success: false, error: 'No fulfillment orders found', orderName: order.name };
    }

    const fulfillmentOrder = fulfillmentOrders[0].node;
    console.log(`📦 Found fulfillment order: ${fulfillmentOrder.id}`);
    
    // Step 2: Create fulfillment with tracking
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

    const fulfillmentVariables = {
      fulfillment: {
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: fulfillmentOrder.id,
            fulfillmentOrderLineItems: fulfillmentOrder.lineItems.edges.map(edge => ({
              id: edge.node.id,
              quantity: edge.node.remainingQuantity
            }))
          }
        ],
        notifyCustomer: false,
        trackingInfo: trackingNumber ? {
          number: trackingNumber.toString(),
          company: "PrimeCOD"
        } : undefined
      }
    };

    console.log(`🔄 Creating fulfillment with tracking: ${trackingNumber}`);

    const fulfillmentResponse = await fetch(`https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: fulfillmentMutation,
        variables: fulfillmentVariables
      })
    });

    const fulfillmentData = await fulfillmentResponse.json();
    
    if (fulfillmentData.errors) {
      return { success: false, error: 'GraphQL fulfillment failed', details: fulfillmentData.errors };
    }

    if (fulfillmentData.data?.fulfillmentCreate?.userErrors?.length > 0) {
      return { 
        success: false, 
        error: 'Fulfillment user errors', 
        details: fulfillmentData.data.fulfillmentCreate.userErrors 
      };
    }

    if (fulfillmentData.data?.fulfillmentCreate?.fulfillment?.id) {
      const fulfillmentId = fulfillmentData.data.fulfillmentCreate.fulfillment.id;
      console.log(`✅ Fulfillment created: ${fulfillmentId}`);
      return { 
        success: true, 
        fulfillmentId,
        trackingNumber,
        carrier: "PrimeCOD"
      };
    }

    return { success: false, error: 'Unexpected fulfillment response', details: fulfillmentData };

  } catch (error) {
    console.error('❌ Error creating fulfillment:', error.message);
    return { success: false, error: error.message };
  }
}

async function testSpecificDeliveredOrder(referenceId, shopifyStore, shopifyAccessToken, primecodToken) {
  try {
    console.log(`🔍 Finding PrimeCOD order: ${referenceId}`);

    // Find the lead in PrimeCOD data
    let targetLead = null;
    for (let page = 1; page <= 3; page++) {
      const response = await fetch(`https://api.primecod.app/api/leads?page=${page}`, {
        headers: {
          'Authorization': `Bearer ${primecodToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      targetLead = data.data.find(lead => lead.reference === referenceId);
      if (targetLead) break;
    }

    if (!targetLead) {
      throw new Error(`Lead ${referenceId} not found in PrimeCOD data`);
    }

    console.log(`📦 Found PrimeCOD lead:`, {
      reference: targetLead.reference,
      status: targetLead.shipping_status,
      tracking: targetLead.tracking_number,
      email: targetLead.email
    });

    // Find matching Shopify order
    const shopifyOrder = await findShopifyOrder(targetLead, shopifyStore, shopifyAccessToken);
    
    if (!shopifyOrder) {
      return {
        success: false,
        error: 'No matching Shopify order found',
        primecod_data: targetLead
      };
    }

    console.log(`🛍️ Found Shopify order: ${shopifyOrder.order_number} (ID: ${shopifyOrder.id})`);

    // Test fulfillment
    if (targetLead.shipping_status === 'delivered' && targetLead.tracking_number) {
      const fulfillmentResult = await fulfillOrderWithTracking(
        shopifyOrder.id,
        targetLead.tracking_number,
        shopifyStore,
        shopifyAccessToken
      );

      return {
        success: true,
        primecod_data: targetLead,
        shopify_order: {
          id: shopifyOrder.id,
          number: shopifyOrder.order_number,
          financial_status: shopifyOrder.financial_status,
          fulfillment_status: shopifyOrder.fulfillment_status
        },
        fulfillment_result: fulfillmentResult
      };
    } else {
      return {
        success: false,
        error: 'Order not delivered or missing tracking',
        primecod_data: targetLead,
        shopify_order: shopifyOrder
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function findShopifyOrder(lead, shopifyStore, shopifyAccessToken) {
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
      
      if (emailResults.orders && emailResults.orders.length >= 1) {
        return emailResults.orders[0]; // Return the first/most recent match
      }
    }
  }
  return null;
}

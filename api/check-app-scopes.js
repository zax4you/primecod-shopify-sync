// api/check-app-scopes.js
// Check what permissions our app currently has
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    console.log('🔍 Checking current app permissions and capabilities...');
    
    // Test 1: Check if we can access basic order info
    console.log('📋 Test 1: Basic order access...');
    const orderTest = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?limit=1`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Test 2: Check if we can access legacy fulfillments
    console.log('📦 Test 2: Legacy fulfillments access...');
    const fulfillmentTest = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/6431141593339/fulfillments.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Test 3: Check GraphQL introspection for available fields
    console.log('🔍 Test 3: GraphQL introspection...');
    const introspectionQuery = `
      query {
        __type(name: "Order") {
          fields {
            name
            description
          }
        }
      }
    `;
    
    const introspectionTest = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: introspectionQuery
        })
      }
    );
    
    // Test 4: Try to access modern fulfillment fields
    console.log('🚀 Test 4: Modern fulfillment access...');
    const modernFulfillmentQuery = `
      query {
        orders(first: 1) {
          edges {
            node {
              id
              fulfillmentOrders(first: 1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const modernFulfillmentTest = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: modernFulfillmentQuery
        })
      }
    );
    
    // Test 5: Check what scopes we might need
    console.log('🔧 Test 5: Testing specific scope requirements...');
    const scopeTests = [
      {
        name: "merchant_managed_fulfillment_orders",
        query: `
          query {
            fulfillmentOrders(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
        `
      }
    ];
    
    const scopeTestResults = [];
    
    for (const test of scopeTests) {
      const testResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: test.query
          })
        }
      );
      
      const testData = await testResponse.json();
      
      scopeTestResults.push({
        scope_test: test.name,
        success: testResponse.ok && !testData.errors,
        response: testData
      });
    }
    
    // Parse all responses
    const orderData = orderTest.ok ? await orderTest.json() : { error: await orderTest.text() };
    const fulfillmentData = fulfillmentTest.ok ? await fulfillmentTest.json() : { error: await fulfillmentTest.text() };
    const introspectionData = introspectionTest.ok ? await introspectionTest.json() : { error: await introspectionTest.text() };
    const modernFulfillmentData = modernFulfillmentTest.ok ? await modernFulfillmentTest.json() : { error: await modernFulfillmentTest.text() };
    
    // Check what Order fields are available
    const availableOrderFields = introspectionData.data?.__type?.fields?.map(f => f.name) || [];
    const hasFulfillmentOrders = availableOrderFields.includes('fulfillmentOrders');
    
    res.json({
      app_permissions_analysis: {
        basic_order_access: {
          success: orderTest.ok,
          status: orderTest.status,
          can_read_orders: !!orderData.orders
        },
        
        legacy_fulfillment_access: {
          success: fulfillmentTest.ok,
          status: fulfillmentTest.status,
          can_read_fulfillments: !fulfillmentData.error
        },
        
        graphql_introspection: {
          success: introspectionTest.ok,
          status: introspectionTest.status,
          order_fields_available: availableOrderFields.length,
          has_fulfillment_orders_field: hasFulfillmentOrders
        },
        
        modern_fulfillment_access: {
          success: modernFulfillmentTest.ok && !modernFulfillmentData.errors,
          status: modernFulfillmentTest.status,
          errors: modernFulfillmentData.errors || null
        },
        
        scope_specific_tests: scopeTestResults
      },
      
      current_capabilities: {
        can_read_orders: orderTest.ok,
        can_access_legacy_fulfillments: fulfillmentTest.ok,
        can_access_modern_fulfillments: modernFulfillmentTest.ok && !modernFulfillmentData.errors,
        has_graphql_access: introspectionTest.ok
      },
      
      required_scopes_for_modern_fulfillment: [
        "read_merchant_managed_fulfillment_orders",
        "write_merchant_managed_fulfillment_orders",
        "read_assigned_fulfillment_orders", 
        "write_assigned_fulfillment_orders"
      ],
      
      current_scopes_likely: [
        "read_orders",
        "write_orders", 
        "read_fulfillments",
        "write_fulfillments"
      ],
      
      recommendations: {
        immediate: "Update Shopify app scopes to include modern fulfillment permissions",
        alternative: "Use legacy fulfillment API with correct parameters",
        long_term: "Migrate to modern FulfillmentOrders API for best compatibility"
      },
      
      debug_data: {
        order_response: orderData,
        fulfillment_response: fulfillmentData,
        modern_fulfillment_errors: modernFulfillmentData.errors,
        available_order_fields: availableOrderFields
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message
    });
  }
}

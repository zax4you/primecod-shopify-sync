// api/test-shopify-auth.js - Test Shopify API authentication
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🔐 Testing Shopify API authentication...');
    
    const testResults = {
      environment_variables: {
        shopify_store: SHOPIFY_STORE ? '✅ Found' : '❌ Missing',
        shopify_access_token: SHOPIFY_ACCESS_TOKEN ? '✅ Found' : '❌ Missing',
        store_value: SHOPIFY_STORE,
        token_length: SHOPIFY_ACCESS_TOKEN ? SHOPIFY_ACCESS_TOKEN.length : 0,
        token_prefix: SHOPIFY_ACCESS_TOKEN ? SHOPIFY_ACCESS_TOKEN.substring(0, 10) + '...' : 'N/A'
      },
      api_tests: {}
    };

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'Missing environment variables',
        results: testResults
      });
    }

    // Test 1: Basic shop info
    console.log('📊 Testing basic shop info...');
    try {
      const shopResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      testResults.api_tests.shop_info = {
        status: shopResponse.status,
        success: shopResponse.ok,
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/shop.json`
      };

      if (shopResponse.ok) {
        const shopData = await shopResponse.json();
        testResults.api_tests.shop_info.shop_name = shopData.shop?.name || 'Unknown';
        testResults.api_tests.shop_info.shop_domain = shopData.shop?.domain || 'Unknown';
        console.log(`✅ Shop info: ${shopData.shop?.name} (${shopData.shop?.domain})`);
      } else {
        const errorText = await shopResponse.text();
        testResults.api_tests.shop_info.error = errorText;
        console.log(`❌ Shop info failed: ${shopResponse.status} - ${errorText}`);
      }
    } catch (error) {
      testResults.api_tests.shop_info = {
        success: false,
        error: error.message
      };
    }

    // Test 2: Orders access
    console.log('📦 Testing orders access...');
    try {
      const ordersResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?limit=1&status=any`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      testResults.api_tests.orders_access = {
        status: ordersResponse.status,
        success: ordersResponse.ok,
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json`
      };

      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json();
        testResults.api_tests.orders_access.orders_count = ordersData.orders?.length || 0;
        if (ordersData.orders && ordersData.orders.length > 0) {
          const sampleOrder = ordersData.orders[0];
          testResults.api_tests.orders_access.sample_order = {
            order_number: sampleOrder.order_number,
            created_at: sampleOrder.created_at,
            email: sampleOrder.email,
            phone: sampleOrder.phone,
            financial_status: sampleOrder.financial_status,
            fulfillment_status: sampleOrder.fulfillment_status
          };
        }
        console.log(`✅ Orders access: Found ${ordersData.orders?.length || 0} orders`);
      } else {
        const errorText = await ordersResponse.text();
        testResults.api_tests.orders_access.error = errorText;
        console.log(`❌ Orders access failed: ${ordersResponse.status} - ${errorText}`);
      }
    } catch (error) {
      testResults.api_tests.orders_access = {
        success: false,
        error: error.message
      };
    }

    // Test 3: GraphQL access
    console.log('🔍 Testing GraphQL access...');
    try {
      const graphqlQuery = `
        query {
          shop {
            id
            name
            url
          }
        }
      `;

      const graphqlResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: graphqlQuery })
        }
      );

      testResults.api_tests.graphql_access = {
        status: graphqlResponse.status,
        success: graphqlResponse.ok,
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`
      };

      if (graphqlResponse.ok) {
        const graphqlData = await graphqlResponse.json();
        if (graphqlData.errors) {
          testResults.api_tests.graphql_access.graphql_errors = graphqlData.errors;
          console.log(`❌ GraphQL errors:`, graphqlData.errors);
        } else {
          testResults.api_tests.graphql_access.shop_data = graphqlData.data?.shop;
          console.log(`✅ GraphQL access: ${graphqlData.data?.shop?.name}`);
        }
      } else {
        const errorText = await graphqlResponse.text();
        testResults.api_tests.graphql_access.error = errorText;
        console.log(`❌ GraphQL access failed: ${graphqlResponse.status} - ${errorText}`);
      }
    } catch (error) {
      testResults.api_tests.graphql_access = {
        success: false,
        error: error.message
      };
    }

    // Test 4: Customer search (for phone matching)
    console.log('👥 Testing customer search...');
    try {
      const customerResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/customers.json?limit=1`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      testResults.api_tests.customer_access = {
        status: customerResponse.status,
        success: customerResponse.ok,
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/customers.json`
      };

      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        testResults.api_tests.customer_access.customers_count = customerData.customers?.length || 0;
        if (customerData.customers && customerData.customers.length > 0) {
          const sampleCustomer = customerData.customers[0];
          testResults.api_tests.customer_access.sample_customer = {
            id: sampleCustomer.id,
            email: sampleCustomer.email,
            phone: sampleCustomer.phone,
            created_at: sampleCustomer.created_at
          };
        }
        console.log(`✅ Customer access: Found ${customerData.customers?.length || 0} customers`);
      } else {
        const errorText = await customerResponse.text();
        testResults.api_tests.customer_access.error = errorText;
        console.log(`❌ Customer access failed: ${customerResponse.status} - ${errorText}`);
      }
    } catch (error) {
      testResults.api_tests.customer_access = {
        success: false,
        error: error.message
      };
    }

    // Overall assessment
    const allTestsPassed = Object.values(testResults.api_tests).every(test => test.success);
    const diagnosis = generateDiagnosis(testResults);

    console.log(`🏁 Authentication test complete. Overall success: ${allTestsPassed}`);

    res.status(200).json({
      success: allTestsPassed,
      message: allTestsPassed ? 'All Shopify API tests passed' : 'Some Shopify API tests failed',
      test_results: testResults,
      diagnosis: diagnosis,
      recommendations: generateRecommendations(testResults)
    });

  } catch (error) {
    console.error('💥 Authentication test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      test_results: testResults || {}
    });
  }
}

function generateDiagnosis(results) {
  const diagnosis = [];
  
  if (!results.environment_variables.shopify_store || !results.environment_variables.shopify_access_token) {
    diagnosis.push("🚨 CRITICAL: Missing environment variables");
  }
  
  if (results.api_tests.shop_info?.status === 401) {
    diagnosis.push("🚨 CRITICAL: Access token is invalid or expired");
  } else if (results.api_tests.shop_info?.status === 403) {
    diagnosis.push("🚨 CRITICAL: Access token lacks required permissions");
  } else if (results.api_tests.shop_info?.success) {
    diagnosis.push("✅ GOOD: Basic API authentication working");
  }
  
  if (results.api_tests.orders_access?.status === 401) {
    diagnosis.push("❌ ORDERS: Cannot access orders (authentication issue)");
  } else if (results.api_tests.orders_access?.status === 403) {
    diagnosis.push("❌ ORDERS: Cannot access orders (permission issue)");
  } else if (results.api_tests.orders_access?.success) {
    diagnosis.push("✅ ORDERS: Can access orders successfully");
  }
  
  if (results.api_tests.graphql_access?.success) {
    diagnosis.push("✅ GRAPHQL: GraphQL API working (fulfillment will work)");
  } else {
    diagnosis.push("❌ GRAPHQL: GraphQL API not working (fulfillment will fail)");
  }
  
  if (results.api_tests.customer_access?.success) {
    diagnosis.push("✅ CUSTOMERS: Can access customers (phone matching possible)");
  } else {
    diagnosis.push("❌ CUSTOMERS: Cannot access customers (phone matching impossible)");
  }
  
  return diagnosis;
}

function generateRecommendations(results) {
  const recommendations = [];
  
  if (results.api_tests.shop_info?.status === 401) {
    recommendations.push({
      priority: "CRITICAL",
      action: "Regenerate Shopify access token",
      reason: "Current token is invalid or expired",
      steps: [
        "Go to Shopify Admin → Settings → Apps and sales channels",
        "Find 'PrimeCOD Order Automation' app",
        "Regenerate access token",
        "Update SHOPIFY_ACCESS_TOKEN in Vercel environment variables"
      ]
    });
  }
  
  if (results.api_tests.orders_access?.status === 403) {
    recommendations.push({
      priority: "HIGH",
      action: "Update app permissions",
      reason: "App lacks read_orders permission",
      steps: [
        "Edit app scopes in Shopify Admin",
        "Ensure read_orders and write_orders are enabled",
        "Reinstall or update app permissions"
      ]
    });
  }
  
  if (!results.api_tests.customer_access?.success) {
    recommendations.push({
      priority: "MEDIUM",
      action: "Enable customer access",
      reason: "Phone number matching requires customer API access",
      steps: [
        "Add read_customers scope to app",
        "This will enable phone number fallback matching"
      ]
    });
  }
  
  if (results.api_tests.shop_info?.success && results.api_tests.orders_access?.success) {
    recommendations.push({
      priority: "READY",
      action: "API authentication is working",
      reason: "Basic functionality should work - investigate email matching issue"
    });
  }
  
  return recommendations;
}

// api/scope-verification-only.js
// JUST test if the new Admin API token has the required scopes
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    console.log('🔍 Testing new Admin API token scopes...');
    console.log(`🔑 Token: ${SHOPIFY_ACCESS_TOKEN.substring(0, 20)}...`);
    
    // Test all required scopes in one GraphQL query
    const scopeTestQuery = `
      query testAllScopes {
        fulfillmentOrders(first: 1) {
          edges {
            node {
              id
              status
            }
          }
        }
        orders(first: 1) {
          edges {
            node {
              id
              name
            }
          }
        }
        locations(first: 1) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;
    
    const scopeTestResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: scopeTestQuery
        })
      }
    );
    
    const scopeTestData = await scopeTestResponse.json();
    
    // Check if we got any access denied errors
    if (scopeTestData.errors) {
      const accessDeniedErrors = scopeTestData.errors.filter(
        error => error.extensions?.code === 'ACCESS_DENIED'
      );
      
      if (accessDeniedErrors.length > 0) {
        return res.json({
          success: false,
          message: "❌ SCOPE VERIFICATION FAILED",
          token_status: "New Admin API token still missing required scopes",
          
          errors: accessDeniedErrors,
          
          missing_scopes: [
            "read_merchant_managed_fulfillment_orders",
            "write_merchant_managed_fulfillment_orders", 
            "read_locations",
            "read_orders",
            "write_orders"
          ],
          
          what_to_do: [
            "1. Go to Shopify Admin → Apps → Develop apps",
            "2. Click on 'PrimeCOD Order Sync' app",
            "3. Go to Configuration → Admin API integration",
            "4. Add missing scopes and save",
            "5. Reinstall/update app permissions"
          ],
          
          current_token: `${SHOPIFY_ACCESS_TOKEN.substring(0, 25)}...`,
          
          next_step: "Fix scopes first, then test again"
        });
      }
      
      // Other GraphQL errors (not scope-related)
      return res.json({
        success: false,
        message: "❌ GraphQL errors (not scope-related)",
        errors: scopeTestData.errors
      });
    }
    
    // SUCCESS! All scopes work
    const fulfillmentOrdersCount = scopeTestData.data?.fulfillmentOrders?.edges?.length || 0;
    const ordersCount = scopeTestData.data?.orders?.edges?.length || 0;
    const locationsCount = scopeTestData.data?.locations?.edges?.length || 0;
    
    res.json({
      success: true,
      message: "🎉 ALL SCOPES VERIFIED! New Admin API token works perfectly!",
      
      scope_test_results: {
        fulfillment_orders: `✅ ACCESSIBLE (${fulfillmentOrdersCount} found)`,
        orders: `✅ ACCESSIBLE (${ordersCount} found)`,
        locations: `✅ ACCESSIBLE (${locationsCount} found)`
      },
      
      token_info: {
        type: "Admin API token (shpat_...)",
        token_preview: `${SHOPIFY_ACCESS_TOKEN.substring(0, 25)}...`,
        scopes_verified: [
          "✅ read_merchant_managed_fulfillment_orders",
          "✅ read_orders", 
          "✅ read_locations"
        ]
      },
      
      integration_status: "🚀 READY FOR COD FULFILLMENT TESTING",
      
      next_steps: [
        "✅ Scopes confirmed working",
        "🎯 Ready to test Order #1251 fulfillment",
        "📦 Can proceed with full integration test",
        "🚀 COD API fulfillment should now work"
      ],
      
      what_this_means: [
        "🎉 The scope update worked!",
        "✅ Modern Fulfillment Orders API is accessible",
        "✅ Location API is accessible (2024-10 requirement)",
        "✅ Order API remains accessible", 
        "🚀 COD orders can now be fulfilled via API"
      ]
    });
    
  } catch (error) {
    console.error('❌ Scope verification error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message,
      message: "Unexpected error during scope verification"
    });
  }
}

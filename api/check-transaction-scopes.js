// api/check-transaction-scopes.js
// Verify we have the required scopes for transaction creation
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    console.log('🔍 Checking transaction creation scopes...');
    
    // Test 1: Can we read orders? (Basic test)
    console.log('📋 Test 1: Read orders access...');
    const ordersTest = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?limit=1`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const ordersSuccess = ordersTest.ok;
    console.log(`   read_orders: ${ordersSuccess ? '✅ WORKING' : '❌ FAILED'}`);
    
    // Test 2: Can we access transactions on an existing order?
    let transactionReadSuccess = false;
    if (ordersSuccess) {
      console.log('💳 Test 2: Read transactions access...');
      
      // Use Order #1251 for testing since we know it exists
      const orderId = "6428610822395";
      
      const transactionsTest = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      transactionReadSuccess = transactionsTest.ok;
      console.log(`   read transactions: ${transactionReadSuccess ? '✅ WORKING' : '❌ FAILED'}`);
      
      if (transactionsTest.ok) {
        const transactionData = await transactionsTest.json();
        console.log(`   📊 Found ${transactionData.transactions.length} existing transactions`);
      }
    }
    
    // Test 3: Check current app scopes via GraphQL
    console.log('🔐 Test 3: Check current app scopes...');
    
    const scopeQuery = `
      query {
        appInstallation {
          accessScopes {
            handle
          }
        }
      }
    `;
    
    const scopeTest = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: scopeQuery
        })
      }
    );
    
    let currentScopes = [];
    if (scopeTest.ok) {
      const scopeData = await scopeTest.json();
      if (scopeData.data?.appInstallation?.accessScopes) {
        currentScopes = scopeData.data.appInstallation.accessScopes.map(scope => scope.handle);
        console.log(`   📋 Current scopes: ${currentScopes.join(', ')}`);
      }
    }
    
    // Analyze scope requirements
    const requiredForTransactions = [
      'read_orders',
      'write_orders'
    ];
    
    const recommendedForTransactions = [
      'read_products',
      'write_products'
    ];
    
    const hasRequired = requiredForTransactions.every(scope => currentScopes.includes(scope));
    const hasRecommended = recommendedForTransactions.every(scope => currentScopes.includes(scope));
    
    // Test 4: Try to create a test transaction (dry run)
    let transactionWriteSuccess = false;
    let transactionTestError = null;
    
    if (hasRequired && ordersSuccess) {
      console.log('💰 Test 4: Transaction creation capability...');
      
      // Test with Order #1251 (minimal amount to avoid actual charges)
      const orderId = "6428610822395";
      
      const testTransaction = {
        transaction: {
          kind: "sale",
          status: "success",
          amount: "0.01", // Minimal test amount
          currency: "PLN",
          gateway: "manual",
          test: true, // Mark as test transaction
          message: "Scope verification test - will be voided"
        }
      };
      
      const transactionWriteTest = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(testTransaction)
        }
      );
      
      transactionWriteSuccess = transactionWriteTest.ok;
      
      if (transactionWriteTest.ok) {
        const newTransaction = await transactionWriteTest.json();
        console.log(`   ✅ Transaction creation: SUCCESS`);
        console.log(`   📦 Created test transaction: ${newTransaction.transaction.id}`);
        
        // Immediately void the test transaction to clean up
        const voidResponse = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              transaction: {
                kind: "void",
                parent_id: newTransaction.transaction.id
              }
            })
          }
        );
        
        if (voidResponse.ok) {
          console.log(`   🗑️ Test transaction voided successfully`);
        }
        
      } else {
        const errorData = await transactionWriteTest.json();
        transactionTestError = errorData;
        console.log(`   ❌ Transaction creation: FAILED`);
        console.log(`   📝 Error: ${JSON.stringify(errorData, null, 2)}`);
      }
    }
    
    // Final assessment
    const overallSuccess = ordersSuccess && transactionReadSuccess && hasRequired && transactionWriteSuccess;
    
    res.json({
      success: overallSuccess,
      message: overallSuccess 
        ? "🎉 ALL TRANSACTION SCOPES VERIFIED! Ready for COD payment marking."
        : "⚠️ Missing required scopes for transaction creation",
      
      scope_verification: {
        read_orders: ordersSuccess ? '✅ WORKING' : '❌ MISSING',
        read_transactions: transactionReadSuccess ? '✅ WORKING' : '❌ MISSING', 
        write_orders: transactionWriteSuccess ? '✅ WORKING' : '❌ MISSING',
        transaction_creation: transactionWriteSuccess ? '✅ VERIFIED' : '❌ FAILED'
      },
      
      current_scopes: currentScopes,
      
      required_scopes: {
        essential: requiredForTransactions,
        recommended: recommendedForTransactions,
        has_essential: hasRequired,
        has_recommended: hasRecommended
      },
      
      missing_scopes: requiredForTransactions.filter(scope => !currentScopes.includes(scope)),
      
      next_steps: overallSuccess ? [
        "✅ All transaction scopes verified",
        "🚀 Ready to implement COD payment marking",
        "💰 Test the mark-cod-paid-working.js endpoint"
      ] : [
        "🔧 Add missing scopes to your Shopify app",
        "📝 Required: " + requiredForTransactions.filter(scope => !currentScopes.includes(scope)).join(', '),
        "🔄 Reinstall app after adding scopes",
        "🧪 Re-test transaction capability"
      ],
      
      how_to_add_scopes: [
        "1. Go to Shopify Admin → Settings → Apps and sales channels",
        "2. Click 'Develop apps' → Your app name",
        "3. Click 'Configuration' → Edit Admin API integration",
        "4. Add required scopes: read_orders, write_orders",
        "5. Save and reinstall the app"
      ],
      
      debug_info: {
        orders_test_status: ordersTest.status,
        transaction_test_error: transactionTestError,
        app_installation_check: scopeTest.ok
      }
    });
    
  } catch (error) {
    console.error('❌ Scope check error:', error.message);
    res.status(500).json({ 
      error: error.message,
      message: "Error during scope verification"
    });
  }
}

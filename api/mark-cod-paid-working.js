// api/mark-cod-paid-working.js
// WORKING solution for marking COD orders as paid in Shopify
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = "6428610822395"; // Order #1251 for testing
  
  try {
    console.log('💰 WORKING COD Payment Solution Test...');
    
    // Step 1: Get order details first
    const orderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const orderData = await orderResponse.json();
    const order = orderData.order;
    
    console.log(`📊 Order ${order.name}:`);
    console.log(`   💰 Financial Status: ${order.financial_status}`);
    console.log(`   💳 Gateway: ${order.payment_gateway_names[0] || 'none'}`);
    console.log(`   💵 Total Price: ${order.total_price} ${order.currency}`);
    console.log(`   📦 Fulfillment: ${order.fulfillment_status}`);
    
    // Step 2: Create a proper payment transaction
    // This is the KEY - create a transaction rather than just updating status
    console.log('💳 Creating COD payment transaction...');
    
    const transactionData = {
      transaction: {
        kind: "sale",           // 'sale' is better than 'capture' for COD
        status: "success",
        amount: order.total_price,
        currency: order.currency,
        gateway: "manual",      // Manual gateway for COD
        source_name: "web",
        message: "COD payment received on delivery",
        test: false             // Mark as real transaction
      }
    };
    
    const transactionResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(transactionData)
      }
    );
    
    const transactionResult = await transactionResponse.json();
    
    if (transactionResponse.ok && transactionResult.transaction) {
      console.log(`✅ Transaction created: ${transactionResult.transaction.id}`);
      console.log(`💰 Amount: ${transactionResult.transaction.amount} ${transactionResult.transaction.currency}`);
      console.log(`🎯 Kind: ${transactionResult.transaction.kind}`);
      console.log(`✅ Status: ${transactionResult.transaction.status}`);
      
      // Step 3: Verify the order is now marked as paid
      const verifyResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const verifyData = await verifyResponse.json();
      const updatedOrder = verifyData.order;
      
      console.log(`🔍 VERIFICATION:`);
      console.log(`   💰 New Financial Status: ${updatedOrder.financial_status}`);
      console.log(`   💵 Outstanding Amount: ${updatedOrder.total_outstanding} ${updatedOrder.currency}`);
      
      // Step 4: Add success note
      if (updatedOrder.financial_status === 'paid') {
        const successNote = [
          `💰 COD PAYMENT SUCCESSFUL - ${new Date().toISOString()}`,
          `✅ Transaction ID: ${transactionResult.transaction.id}`,
          `💵 Amount: ${transactionResult.transaction.amount} ${transactionResult.transaction.currency}`,
          `🚚 Payment collected on delivery by PrimeCOD driver`,
          `📊 Order fully processed: Fulfilled + Paid`
        ].join('\n');
        
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
                note: (updatedOrder.note || '') + '\n\n' + successNote
              }
            })
          }
        );
        
        return res.json({
          success: true,
          message: "🎉 COD PAYMENT MARKING SUCCESS!",
          
          payment_details: {
            transaction_id: transactionResult.transaction.id,
            amount: `${transactionResult.transaction.amount} ${transactionResult.transaction.currency}`,
            method: "Manual COD Transaction",
            gateway: transactionResult.transaction.gateway
          },
          
          order_status: {
            before: {
              financial: order.financial_status,
              outstanding: `${order.total_outstanding} ${order.currency}`
            },
            after: {
              financial: updatedOrder.financial_status,
              outstanding: `${updatedOrder.total_outstanding} ${updatedOrder.currency}`
            }
          },
          
          integration_status: "🚀 COMPLETE COD WORKFLOW WORKING",
          
          next_steps: [
            "✅ COD payment marking confirmed working",
            "✅ Update main sync-orders.js with this solution",
            "✅ Deploy automated COD processing",
            "🎯 Complete production deployment"
          ]
        });
        
      } else {
        // Transaction created but order still not marked as paid
        return res.json({
          success: false,
          message: "Transaction created but order not marked as paid",
          transaction_created: transactionResult.transaction.id,
          current_financial_status: updatedOrder.financial_status,
          possible_issue: "Order may need authorization or settlement step"
        });
      }
      
    } else {
      // Transaction creation failed
      console.log(`❌ Transaction failed: ${transactionResponse.status}`);
      console.log(`📝 Response:`, transactionResult);
      
      return res.json({
        success: false,
        message: "Transaction creation failed",
        error: transactionResult,
        status: transactionResponse.status,
        
        troubleshooting: [
          "Check if order allows manual transactions",
          "Verify payment gateway settings",
          "Ensure order is in correct state for payment"
        ]
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message
    });
  }
}

// Helper function for production use
export async function markCODOrderAsPaid(orderId, amount, currency, shopifyStore, shopifyAccessToken) {
  try {
    console.log(`💰 Marking COD order ${orderId} as paid...`);
    
    // Method 1: Try capture transaction (most common for COD)
    let transactionResponse = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction: {
            kind: "capture",
            status: "success",
            amount: amount,
            currency: currency,
            gateway: "manual",
            source_name: "web",
            message: "COD payment received on delivery via PrimeCOD",
            test: false
          }
        })
      }
    );
    
    // If capture fails, try authorization + capture
    if (!transactionResponse.ok) {
      console.log('💳 Capture failed, trying authorization + capture...');
      
      // First create authorization
      const authResponse = await fetch(
        `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            transaction: {
              kind: "authorization",
              status: "success",
              amount: amount,
              currency: currency,
              gateway: "manual",
              message: "COD authorization for manual capture",
              test: false
            }
          })
        }
      );
      
      if (authResponse.ok) {
        const authData = await authResponse.json();
        
        // Then capture against the authorization
        transactionResponse = await fetch(
          `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              transaction: {
                kind: "capture",
                status: "success",
                amount: amount,
                currency: currency,
                gateway: "manual",
                parent_id: authData.transaction.id,
                message: "COD payment captured on delivery",
                test: false
              }
            })
          }
        );
      }
    }
    
    if (transactionResponse.ok) {
      const transactionData = await transactionResponse.json();
      console.log(`✅ COD payment recorded: ${transactionData.transaction.id}`);
      return {
        success: true,
        transaction_id: transactionData.transaction.id,
        amount: transactionData.transaction.amount
      };
    } else {
      const errorData = await transactionResponse.json();
      console.log(`❌ Payment failed: ${transactionResponse.status}`);
      return {
        success: false,
        error: errorData,
        status: transactionResponse.status
      };
    }
    
  } catch (error) {
    console.error('❌ COD payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// api/mark-cod-paid-correct.js
// CORRECT solution using Shopify's orderMarkAsPaid GraphQL mutation
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = "6428610822395"; // Order #1251 for testing
  const orderNumber = 1251;
  
  try {
    console.log('💰 CORRECT COD Payment Solution - Using orderMarkAsPaid mutation...');
    
    // Step 1: Get order details first to verify it can be marked as paid
    console.log('📋 Checking order status...');
    
    const orderCheckQuery = `
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          canMarkAsPaid
          displayFinancialStatus
          totalOutstandingSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalPrice
        }
      }
    `;
    
    const orderCheckResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: orderCheckQuery,
          variables: {
            id: `gid://shopify/Order/${orderId}`
          }
        })
      }
    );
    
    const orderCheckData = await orderCheckResponse.json();
    const order = orderCheckData.data.order;
    
    console.log(`📊 Order ${order.name}:`);
    console.log(`   💰 Financial Status: ${order.displayFinancialStatus}`);
    console.log(`   📦 Can Mark as Paid: ${order.canMarkAsPaid}`);
    console.log(`   💵 Outstanding: ${order.totalOutstandingSet.shopMoney.amount} ${order.totalOutstandingSet.shopMoney.currencyCode}`);
    console.log(`   💸 Total Price: ${order.totalPrice}`);
    
    if (!order.canMarkAsPaid) {
      return res.json({
        success: false,
        message: "Order cannot be marked as paid",
        reason: order.displayFinancialStatus === 'PAID' 
          ? "Order is already paid" 
          : "Order is not in a state where it can be marked as paid",
        order_status: {
          financial: order.displayFinancialStatus,
          outstanding: `${order.totalOutstandingSet.shopMoney.amount} ${order.totalOutstandingSet.shopMoney.currencyCode}`,
          can_mark_paid: order.canMarkAsPaid
        }
      });
    }
    
    // Step 2: Use the CORRECT GraphQL mutation to mark as paid
    console.log('💳 Marking order as paid using orderMarkAsPaid mutation...');
    
    const markAsPaidMutation = `
      mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          userErrors {
            field
            message
          }
          order {
            id
            name
            canMarkAsPaid
            displayFinancialStatus
            totalOutstandingSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            transactions(first: 5) {
              id
              kind
              status
              amountSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              gateway
              createdAt
            }
          }
        }
      }
    `;
    
    const markAsPaidResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: markAsPaidMutation,
          variables: {
            input: {
              id: `gid://shopify/Order/${orderId}`
            }
          }
        })
      }
    );
    
    const markAsPaidData = await markAsPaidResponse.json();
    
    if (markAsPaidData.data?.orderMarkAsPaid?.userErrors?.length > 0) {
      console.log('❌ Mark as paid failed with user errors');
      return res.json({
        success: false,
        message: "Failed to mark order as paid",
        errors: markAsPaidData.data.orderMarkAsPaid.userErrors,
        full_response: markAsPaidData
      });
    }
    
    if (markAsPaidData.errors) {
      console.log('❌ GraphQL errors occurred');
      return res.json({
        success: false,
        message: "GraphQL errors occurred",
        errors: markAsPaidData.errors,
        full_response: markAsPaidData
      });
    }
    
    // Success!
    const updatedOrder = markAsPaidData.data.orderMarkAsPaid.order;
    const latestTransaction = updatedOrder.transactions[0]; // Most recent transaction
    
    console.log(`✅ SUCCESS! Order marked as paid`);
    console.log(`💰 New Financial Status: ${updatedOrder.displayFinancialStatus}`);
    console.log(`💵 Outstanding: ${updatedOrder.totalOutstandingSet.shopMoney.amount} ${updatedOrder.totalOutstandingSet.shopMoney.currencyCode}`);
    console.log(`📦 Transaction Created: ${latestTransaction.id} (${latestTransaction.kind})`);
    
    // Step 3: Add success note to order
    const successNote = [
      `💰 COD PAYMENT MARKED AS PAID - ${new Date().toISOString()}`,
      `✅ Order #${orderNumber} payment received on delivery`,
      `📦 Transaction ID: ${latestTransaction.id}`,
      `💵 Amount: ${latestTransaction.amountSet.shopMoney.amount} ${latestTransaction.amountSet.shopMoney.currencyCode}`,
      `🚚 COD payment collected by PrimeCOD driver`,
      `🎉 Complete COD workflow: Fulfilled + Paid!`
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
            note: successNote
          }
        })
      }
    );
    
    return res.json({
      success: true,
      message: `🎉 COD ORDER #${orderNumber} MARKED AS PAID SUCCESSFULLY!`,
      
      payment_details: {
        transaction_id: latestTransaction.id,
        transaction_kind: latestTransaction.kind,
        amount: `${latestTransaction.amountSet.shopMoney.amount} ${latestTransaction.amountSet.shopMoney.currencyCode}`,
        gateway: latestTransaction.gateway,
        created_at: latestTransaction.createdAt
      },
      
      order_status: {
        before: {
          financial: order.displayFinancialStatus,
          outstanding: `${order.totalOutstandingSet.shopMoney.amount} ${order.totalOutstandingSet.shopMoney.currencyCode}`,
          can_mark_paid: order.canMarkAsPaid
        },
        after: {
          financial: updatedOrder.displayFinancialStatus,
          outstanding: `${updatedOrder.totalOutstandingSet.shopMoney.amount} ${updatedOrder.totalOutstandingSet.shopMoney.currencyCode}`,
          can_mark_paid: updatedOrder.canMarkAsPaid
        }
      },
      
      integration_status: "🚀 COMPLETE COD WORKFLOW SUCCESS!",
      
      next_steps: [
        "✅ COD payment marking confirmed working",
        "✅ Update main sync-orders.js with this GraphQL approach",
        "✅ Deploy automated COD processing",
        "🎯 Complete production deployment"
      ],
      
      technical_details: {
        method: "GraphQL orderMarkAsPaid mutation",
        api_version: "2024-01",
        mutation_success: true,
        transaction_created: true
      }
    });
    
  } catch (error) {
    console.error('❌ COD payment error:', error.message);
    res.status(500).json({ 
      error: error.message,
      order_number: orderNumber
    });
  }
}

// Helper function for production use in sync-orders.js
export async function markCODOrderAsPaid(orderId, shopifyStore, shopifyAccessToken) {
  try {
    console.log(`💰 Marking COD order ${orderId} as paid using orderMarkAsPaid...`);
    
    const markAsPaidMutation = `
      mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          userErrors {
            field
            message
          }
          order {
            id
            name
            displayFinancialStatus
            totalOutstandingSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            transactions(first: 1) {
              id
              kind
              status
              amountSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: markAsPaidMutation,
          variables: {
            input: {
              id: `gid://shopify/Order/${orderId}`
            }
          }
        })
      }
    );
    
    const data = await response.json();
    
    if (data.errors || data.data?.orderMarkAsPaid?.userErrors?.length > 0) {
      console.log(`❌ Failed to mark order as paid:`, data.errors || data.data.orderMarkAsPaid.userErrors);
      return {
        success: false,
        error: data.errors || data.data.orderMarkAsPaid.userErrors
      };
    }
    
    const updatedOrder = data.data.orderMarkAsPaid.order;
    const transaction = updatedOrder.transactions[0];
    
    console.log(`✅ Order ${updatedOrder.name} marked as paid - Transaction: ${transaction.id}`);
    
    return {
      success: true,
      financial_status: updatedOrder.displayFinancialStatus,
      transaction_id: transaction.id,
      amount: transaction.amountSet.shopMoney.amount
    };
    
  } catch (error) {
    console.error('❌ COD payment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

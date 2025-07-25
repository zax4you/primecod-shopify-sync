// api/cancel-order-1283.js
// Simple test: Can we cancel Order #1283?
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = "6433796456699"; // Order #1283
  
  try {
    console.log('🔄 Testing cancellation of Order #1283...');
    
    // Step 1: Get current order status
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
    
    console.log(`📊 Order #1283 current status:`);
    console.log(`   💰 Financial: ${order.financial_status}`);
    console.log(`   📦 Fulfillment: ${order.fulfillment_status}`);
    console.log(`   ❌ Cancelled: ${order.cancelled_at || 'No'}`);
    
    // Step 2: Try to cancel the order
    console.log('❌ Attempting to cancel order...');
    
    const cancelResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/cancel.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'customer',
          email: false, // Don't email customer
          refund: false // Don't create refund
        })
      }
    );
    
    const cancelSuccess = cancelResponse.ok;
    let cancelResult = {};
    
    if (cancelSuccess) {
      const cancelData = await cancelResponse.json();
      cancelResult = {
        success: true,
        message: 'Order cancelled successfully',
        cancelled_at: cancelData.order.cancelled_at,
        financial_status: cancelData.order.financial_status
      };
      console.log('✅ Order cancelled successfully');
    } else {
      const errorData = await cancelResponse.text();
      cancelResult = {
        success: false,
        message: 'Cancellation failed',
        error: errorData,
        status: cancelResponse.status
      };
      console.log(`❌ Cancellation failed: ${cancelResponse.status}`);
    }
    
    // Step 3: Get final order status
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
    
    res.json({
      success: cancelResult.success,
      message: cancelResult.success ? 
        '✅ Order #1283 cancelled successfully!' : 
        '❌ Could not cancel Order #1283',
      
      test_results: {
        order_id: orderId,
        cancellation_attempt: cancelResult,
        
        order_status: {
          before: {
            financial: order.financial_status,
            fulfillment: order.fulfillment_status,
            cancelled: order.cancelled_at || 'No'
          },
          after: {
            financial: finalOrder.financial_status,
            fulfillment: finalOrder.fulfillment_status,
            cancelled: finalOrder.cancelled_at || 'No'
          }
        }
      },
      
      what_this_means: cancelResult.success ? [
        '✅ Cancellation works for COD returns',
        '📊 Order removed from revenue calculations',
        '🔄 Can implement this in automated sync',
        '💡 Simple solution: Always cancel returned COD orders'
      ] : [
        '❌ Cannot cancel this order (might be fulfilled/paid)',
        '🔍 Need to check order status requirements',
        '💡 May need different approach for this order'
      ],
      
      next_steps: cancelResult.success ? [
        '🎉 SUCCESS! Cancellation works',
        '🔄 Update sync-orders.js with cancel logic',
        '🚀 Deploy automated COD return handling'
      ] : [
        '🔍 Investigate why cancellation failed',
        '📋 Check order requirements in Shopify admin',
        '💡 Consider alternative approaches'
      ]
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      message: 'Test failed due to unexpected error'
    });
  }
}

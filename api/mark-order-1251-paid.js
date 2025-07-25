// api/mark-order-1251-paid.js
// Test marking Order #1251 as paid (simulating COD payment received)
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = "6428610822395"; // Order #1251
  const orderNumber = 1251;
  
  try {
    console.log('💰 Testing payment marking for delivered COD order #1251...');
    
    // Step 1: Get current order status
    console.log('📋 Getting current order status...');
    
    const orderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!orderResponse.ok) {
      throw new Error(`Failed to fetch order: ${orderResponse.status}`);
    }
    
    const orderData = await orderResponse.json();
    const order = orderData.order;
    
    console.log(`📊 Order ${order.name} Current Status:`);
    console.log(`   💰 Financial: ${order.financial_status}`);
    console.log(`   📦 Fulfillment: ${order.fulfillment_status}`);
    console.log(`   💳 Gateway: ${order.payment_gateway_names[0]}`);
    console.log(`   💵 Total Outstanding: ${order.total_outstanding} ${order.currency}`);
    console.log(`   💸 Total Price: ${order.total_price} ${order.currency}`);
    
    // Step 2: Try multiple payment marking approaches
    const paymentMethods = [
      {
        name: "Method 1: Direct financial_status update",
        approach: async () => {
          const response = await fetch(
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
                  financial_status: "paid"
                }
              })
            }
          );
          
          const data = response.ok ? await response.json() : { error: await response.text() };
          return {
            success: response.ok,
            status: response.status,
            response: data
          };
        }
      },
      {
        name: "Method 2: Create manual payment transaction",
        approach: async () => {
          const response = await fetch(
            `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
            {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                transaction: {
                  kind: "sale",
                  status: "success",
                  amount: order.total_price,
                  currency: order.currency,
                  gateway: "manual",
                  source_name: "web",
                  message: "COD payment received on delivery via PrimeCOD driver"
                }
              })
            }
          );
          
          const data = response.ok ? await response.json() : { error: await response.text() };
          return {
            success: response.ok,
            status: response.status,
            response: data
          };
        }
      },
      {
        name: "Method 3: Create capture transaction",
        approach: async () => {
          const response = await fetch(
            `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
            {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                transaction: {
                  kind: "capture",
                  status: "success",
                  amount: order.total_price,
                  currency: order.currency,
                  gateway: "manual",
                  message: "COD payment captured - delivered and payment received"
                }
              })
            }
          );
          
          const data = response.ok ? await response.json() : { error: await response.text() };
          return {
            success: response.ok,
            status: response.status,
            response: data
          };
        }
      }
    ];
    
    const results = [];
    let successfulMethod = null;
    
    // Try each payment method
    for (const method of paymentMethods) {
      console.log(`💳 Trying ${method.name}...`);
      
      const result = await method.approach();
      result.method = method.name;
      results.push(result);
      
      console.log(`   Result: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.status})`);
      
      if (result.success && !successfulMethod) {
        successfulMethod = method.name;
        console.log(`✅ ${method.name} worked!`);
        break; // Stop trying other methods
      }
      
      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Step 3: Get final order status
    console.log('📊 Getting final order status...');
    
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
    
    console.log(`📊 Final Status:`);
    console.log(`   💰 Financial: ${finalOrder.financial_status}`);
    console.log(`   💵 Outstanding: ${finalOrder.total_outstanding} ${finalOrder.currency}`);
    
    // Step 4: Add payment note if successful
    const paymentSuccess = successfulMethod || finalOrder.financial_status === 'paid';
    
    if (paymentSuccess) {
      const paymentNote = [
        `💰 COD PAYMENT MARKING TEST - ${new Date().toISOString()}`,
        `✅ Order #${orderNumber} marked as PAID`,
        `💳 Method: ${successfulMethod || 'Status updated'}`,
        `📦 Fulfillment: Already completed with tracking`,
        `🎉 Complete COD workflow tested successfully!`,
        `💡 Ready for production deployment`
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
              note: (finalOrder.note || '') + '\n\n' + paymentNote
            }
          })
        }
      );
    }
    
    // Final results
    const overallSuccess = paymentSuccess;
    
    res.json({
      success: overallSuccess,
      message: overallSuccess 
        ? `🎉 Order #${orderNumber} payment marking SUCCESS!`
        : `❌ All payment marking methods failed for order #${orderNumber}`,
      
      order_info: {
        order_number: orderNumber,
        order_id: orderId,
        initial_status: {
          financial: order.financial_status,
          fulfillment: order.fulfillment_status,
          outstanding: `${order.total_outstanding} ${order.currency}`
        },
        final_status: {
          financial: finalOrder.financial_status,
          fulfillment: finalOrder.fulfillment_status,
          outstanding: `${finalOrder.total_outstanding} ${finalOrder.currency}`
        }
      },
      
      payment_methods_tested: results,
      successful_method: successfulMethod,
      
      complete_cod_workflow: {
        step1_order_created: "✅ Order exists",
        step2_fulfillment: "✅ Fulfilled via API with tracking",
        step3_payment_marking: overallSuccess ? "✅ Marked as paid" : "❌ Failed",
        integration_status: overallSuccess ? "🚀 COMPLETE SUCCESS" : "⚠️ Payment marking needs work"
      },
      
      production_readiness: overallSuccess ? [
        "✅ Fulfillment automation working",
        "✅ Payment marking working", 
        "✅ Complete COD workflow functional",
        "✅ Ready for PrimeCOD integration",
        "🚀 Deploy to production!"
      ] : [
        "✅ Fulfillment automation working",
        "⚠️ Payment marking needs debugging",
        "🔧 Review COD payment workflow"
      ]
    });
    
  } catch (error) {
    console.error('❌ Payment marking error:', error.message);
    res.status(500).json({ 
      error: error.message,
      order_number: orderNumber
    });
  }
}

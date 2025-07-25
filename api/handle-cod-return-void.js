// api/handle-cod-return-void.js
// CORRECT solution for COD returns/refusals - VOID instead of refund
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = "6433796456699"; // Order #1283 for testing
  const orderNumber = 1283;
  
  try {
    console.log(`🔄 HANDLING COD RETURN/REFUSAL for Order #${orderNumber}...`);
    console.log('💡 Using VOID method (not refund) because payment was never collected');
    
    // Step 1: Get current order details
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
    
    console.log(`📊 Order #${orderNumber} Status:`);
    console.log(`   💰 Financial: ${order.financial_status}`);
    console.log(`   📦 Fulfillment: ${order.fulfillment_status}`);
    console.log(`   💵 Total: ${order.total_price} ${order.currency}`);
    
    // Step 2: Determine correct action based on payment status
    let actionPlan = {};
    
    if (order.financial_status === 'pending') {
      actionPlan = {
        action: 'CANCEL_ORDER',
        reason: 'COD payment never collected - order should be cancelled',
        method: 'Cancel order (not refund)',
        financial_impact: 'Removes false revenue from books',
        correct_approach: true
      };
    } else if (order.financial_status === 'paid') {
      actionPlan = {
        action: 'CREATE_REFUND',
        reason: 'Payment was already collected and now returned',
        method: 'Create refund for returned goods',
        financial_impact: 'Reverses actual payment received',
        correct_approach: true
      };
    } else {
      actionPlan = {
        action: 'MANUAL_REVIEW',
        reason: `Unusual status: ${order.financial_status}`,
        method: 'Requires manual investigation',
        financial_impact: 'Unknown - needs review',
        correct_approach: false
      };
    }
    
    console.log(`📋 Action Plan: ${actionPlan.action}`);
    console.log(`💡 Reason: ${actionPlan.reason}`);
    
    // Step 3: Execute the correct action
    let processingResult = null;
    
    if (actionPlan.action === 'CANCEL_ORDER') {
      console.log('❌ Cancelling order (COD payment never collected)...');
      
      // Method 1: Try to cancel the order
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
            email: false, // Don't email customer about cancellation
            refund: false // Don't create refund since no payment was collected
          })
        }
      );
      
      if (cancelResponse.ok) {
        const cancelData = await cancelResponse.json();
        processingResult = {
          success: true,
          method: 'Order cancelled',
          details: 'Order removed from revenue - no false accounting',
          status: 'cancelled'
        };
        console.log('✅ Order cancelled successfully');
      } else {
        // If cancellation fails, try closing the order
        console.log('⚠️ Cancellation failed, trying to close order...');
        
        const closeResponse = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/close.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (closeResponse.ok) {
          processingResult = {
            success: true,
            method: 'Order closed',
            details: 'Order marked as closed - reduces revenue impact',
            status: 'closed'
          };
        } else {
          // Last resort: Add comprehensive notes
          processingResult = {
            success: false,
            method: 'Manual action required',
            details: 'Could not cancel/close - needs manual intervention',
            status: 'needs_manual_action'
          };
        }
      }
      
    } else if (actionPlan.action === 'CREATE_REFUND') {
      console.log('💸 Creating refund (payment was actually collected)...');
      
      const refundResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/refunds.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            refund: {
              note: `COD order returned - payment was collected but product returned`,
              notify: true,
              refund_line_items: order.line_items.map(item => ({
                line_item_id: item.id,
                quantity: item.quantity,
                restock_type: 'return'
              }))
            }
          })
        }
      );
      
      if (refundResponse.ok) {
        const refundData = await refundResponse.json();
        processingResult = {
          success: true,
          method: 'Refund created',
          details: `Refunded ${refundData.refund.amount} ${order.currency}`,
          refund_id: refundData.refund.id,
          status: 'refunded'
        };
        console.log(`✅ Refund created: ${refundData.refund.amount} ${order.currency}`);
      } else {
        processingResult = {
          success: false,
          method: 'Refund failed',
          details: 'Could not create refund - manual intervention needed',
          status: 'refund_failed'
        };
      }
    }
    
    // Step 4: Add comprehensive tracking note
    const trackingNote = [
      `🔄 COD RETURN/REFUSAL PROCESSED - ${new Date().toISOString()}`,
      `📦 Order #${orderNumber}: ${actionPlan.action}`,
      `💰 Original Status: ${order.financial_status}`,
      `🎯 Action Taken: ${processingResult.method}`,
      `💡 Reason: ${actionPlan.reason}`,
      `📊 Financial Impact: ${actionPlan.financial_impact}`,
      `✅ Result: ${processingResult.success ? 'SUCCESS' : 'NEEDS MANUAL REVIEW'}`,
      `🏷️ Tagged for tracking and reporting`
    ].join('\n');
    
    // Add appropriate tags
    const returnTags = order.financial_status === 'pending' ? 
      ['cod-refused', 'cod-not-collected', 'cancelled'] :
      ['cod-returned', 'cod-refunded', 'returned'];
    
    const existingTags = order.tags ? order.tags.split(', ') : [];
    const allTags = [...new Set([...existingTags, ...returnTags])];
    
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
            note: (order.note || '') + '\n\n' + trackingNote,
            tags: allTags.join(', ')
          }
        })
      }
    );
    
    // Step 5: Get final order status
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
      success: processingResult.success,
      message: `🔄 COD Return processed correctly for Order #${orderNumber}`,
      
      problem_explained: {
        issue: "Shopify shows revenue for COD orders even when payment never collected",
        consequence: "False revenue reporting and incorrect financial statements",
        solution: "Cancel unpaid orders instead of refunding them"
      },
      
      action_taken: {
        order_status: order.financial_status,
        action: actionPlan.action,
        method: processingResult.method,
        success: processingResult.success,
        financial_impact: actionPlan.financial_impact
      },
      
      order_status: {
        before: {
          financial: order.financial_status,
          fulfillment: order.fulfillment_status,
          closed_at: order.closed_at
        },
        after: {
          financial: finalOrder.financial_status,
          fulfillment: finalOrder.fulfillment_status,
          closed_at: finalOrder.closed_at,
          cancelled_at: finalOrder.cancelled_at
        }
      },
      
      accounting_impact: {
        before: `Revenue shown: ${order.total_price} ${order.currency}`,
        after: processingResult.success ? 
          (actionPlan.action === 'CANCEL_ORDER' ? 
            'Revenue removed from books (correct)' : 
            'Refund issued (correct)') :
          'No change - manual action needed',
        recommendation: 'This is the correct accounting treatment for COD returns'
      },
      
      automation_rules: {
        pending_orders: "CANCEL order (payment never collected)",
        paid_orders: "CREATE REFUND (payment was collected)",
        other_statuses: "MANUAL REVIEW required"
      },
      
      production_implementation: {
        status: "Ready to implement in sync-orders.js",
        logic: "Check order.financial_status before processing returns",
        tags: {
          refused: ['cod-refused', 'cod-not-collected', 'cancelled'],
          returned: ['cod-returned', 'cod-refunded', 'returned']
        }
      },
      
      next_steps: [
        processingResult.success ? "✅ Order processed correctly" : "❌ Requires manual intervention",
        "📊 Check Shopify financial reports for accurate revenue",
        "🔄 Implement this logic in automated sync",
        "📋 Train team on COD return vs refusal difference"
      ]
    });
    
  } catch (error) {
    console.error('❌ COD return processing error:', error.message);
    res.status(500).json({ 
      error: error.message,
      order_number: orderNumber
    });
  }
}

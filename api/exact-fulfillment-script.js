// api/test-paid-fulfill.js
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const testOrderId = 6431141593339; // Order #1266
  
  try {
    console.log('🔍 Testing: Mark as Paid → Then Fulfill');
    
    // Step 1: Mark as paid first (this is what manual UI does differently!)
    console.log('Step 1: Marking order as paid...');
    const markPaidResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${testOrderId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            financial_status: 'paid'
          }
        })
      }
    );
    
    const markPaidText = await markPaidResponse.text();
    let markPaidData;
    try {
      markPaidData = markPaidText ? JSON.parse(markPaidText) : null;
    } catch (e) {
      markPaidData = { raw: markPaidText };
    }
    
    // Wait a moment for the update to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 2: Now try fulfillment on the PAID order
    console.log('Step 2: Fulfilling the now-paid order...');
    
    // Get updated order details
    const orderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${testOrderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
        }
      }
    );
    
    const orderData = await orderResponse.json();
    const order = orderData.order;
    
    const fulfillmentData = {
      fulfillment: {
        location_id: 79055454459,
        tracking_number: '523000014357350092305576',
        tracking_company: 'PrimeCOD',
        notify_customer: true,
        line_items: order.line_items.map(item => ({
          id: item.id,
          quantity: item.quantity
        }))
      }
    };
    
    const fulfillmentResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${testOrderId}/fulfillments.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fulfillmentData)
      }
    );
    
    const fulfillmentText = await fulfillmentResponse.text();
    let fulfillmentData_response;
    try {
      fulfillmentData_response = fulfillmentText ? JSON.parse(fulfillmentText) : null;
    } catch (e) {
      fulfillmentData_response = { raw: fulfillmentText };
    }
    
    res.json({
      test_sequence: "Mark as Paid → Then Fulfill",
      step1_mark_paid: {
        success: markPaidResponse.ok,
        status: markPaidResponse.status,
        response: markPaidData
      },
      step2_order_status_after_payment: {
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status
      },
      step3_fulfillment: {
        success: fulfillmentResponse.ok,
        status: fulfillmentResponse.status,
        response: fulfillmentData_response
      },
      final_result: fulfillmentResponse.ok ? 
        "🎉 SUCCESS! Paid orders CAN be fulfilled via API!" : 
        "❌ Still failed - deeper issue",
      theory_confirmed: fulfillmentResponse.ok ? 
        "API requires payment before fulfillment, but UI doesn't!" : 
        "Need to investigate further"
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = 6433894957307; // Order #1284
  
  try {
    // Step 1: Unarchive the order (reopen it)
    const reopenResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/open.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const reopenText = await reopenResponse.text();
    let reopenData;
    try {
      reopenData = reopenText ? JSON.parse(reopenText) : { status: 'empty response' };
    } catch (e) {
      reopenData = { raw: reopenText };
    }
    
    // Step 2: Get current order status
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
    
    // Step 3: Create a successful payment transaction
    const paymentResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction: {
            kind: 'sale',
            status: 'success',
            amount: '225.98',
            currency: 'PLN',
            gateway: 'manual',
            message: 'COD payment received on delivery via PrimeCOD - Manual entry'
          }
        })
      }
    );
    
    const paymentText = await paymentResponse.text();
    let paymentData;
    try {
      paymentData = JSON.parse(paymentText);
    } catch (e) {
      paymentData = { raw: paymentText };
    }
    
    // Step 4: Get final order status
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
      step1_reopen: {
        success: reopenResponse.ok,
        status: reopenResponse.status,
        response: reopenData
      },
      step2_order_before: {
        financial_status: order.financial_status,
        total_outstanding: order.total_outstanding
      },
      step3_payment: {
        success: paymentResponse.ok,
        status: paymentResponse.status,
        response: paymentData
      },
      step4_final_status: {
        financial_status: finalOrder.financial_status,
        total_outstanding: finalOrder.total_outstanding
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

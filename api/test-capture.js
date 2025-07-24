export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = 6433894957307;
  
  try {
    // Get order details
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
    
    // Try creating a manual payment transaction
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
            amount: order.total_outstanding,
            currency: order.currency,
            gateway: 'Cash on Delivery',
            message: 'COD payment received on delivery via PrimeCOD',
            source_name: 'PrimeCOD Integration'
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
    
    // Alternative approach: Try void + new transaction
    let voidResult = null;
    let newPaymentResult = null;
    
    if (!paymentResponse.ok) {
      // Try to void the pending transaction first
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
              kind: 'void',
              parent_id: 7665699586299 // The pending transaction ID
            }
          })
        }
      );
      
      const voidText = await voidResponse.text();
      try {
        voidResult = { success: voidResponse.ok, response: JSON.parse(voidText) };
      } catch (e) {
        voidResult = { success: voidResponse.ok, response: { raw: voidText } };
      }
      
      // If void worked, try creating new payment
      if (voidResponse.ok) {
        const newPaymentResponse = await fetch(
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
                amount: order.total_outstanding,
                currency: order.currency,
                gateway: 'manual',
                message: 'COD payment received on delivery'
              }
            })
          }
        );
        
        const newPaymentText = await newPaymentResponse.text();
        try {
          newPaymentResult = { success: newPaymentResponse.ok, response: JSON.parse(newPaymentText) };
        } catch (e) {
          newPaymentResult = { success: newPaymentResponse.ok, response: { raw: newPaymentText } };
        }
      }
    }
    
    res.json({
      order_info: {
        financial_status: order.financial_status,
        total_outstanding: order.total_outstanding,
        currency: order.currency
      },
      direct_payment_attempt: {
        success: paymentResponse.ok,
        status: paymentResponse.status,
        response: paymentData
      },
      void_attempt: voidResult,
      new_payment_attempt: newPaymentResult
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

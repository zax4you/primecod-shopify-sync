export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = 6433894957307;
  const refundId = 940332155131; // From the response above
  
  try {
    // We can't actually reverse a refund via API, but we can create a new order or adjustment
    // Let's create a manual payment to offset the refund
    
    // First, get the order to see current state
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
    
    // Try to create a payment transaction for the refunded amount
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
            message: 'COD payment received - reversing accidental refund'
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
    
    res.json({
      current_order_status: {
        financial_status: orderData.order.financial_status,
        total_outstanding: orderData.order.total_outstanding
      },
      payment_attempt: {
        success: paymentResponse.ok,
        status: paymentResponse.status,
        response: paymentData
      },
      note: "Order was accidentally refunded instead of payment captured. Customer received product but also got refund."
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

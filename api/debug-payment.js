export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  // Order #1284 (PCOD-4663491) that should be delivered
  const orderId = 6437174640891; // You might need to adjust this ID
  
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
    
    // Get existing transactions
    const transactionsResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const transactionsData = await transactionsResponse.json();
    
    // Try to create a COD payment transaction
    const paymentResult = await fetch(
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
            amount: order.total_price,
            currency: order.currency,
            gateway: 'Cash on Delivery',
            source_name: 'PrimeCOD',
            message: 'COD payment received on delivery'
          }
        })
      }
    );
    
    const paymentData = await paymentResult.json();
    
    res.status(200).json({
      order_info: {
        id: order.id,
        order_number: order.order_number,
        financial_status: order.financial_status,
        total_price: order.total_price,
        currency: order.currency
      },
      existing_transactions: transactionsData.transactions,
      payment_attempt: {
        success: paymentResult.ok,
        status: paymentResult.status,
        response: paymentData
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

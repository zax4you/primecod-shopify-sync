export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  try {
    // Let's search for orders with the email from PCOD-4663491
    const ordersResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=50`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const ordersData = await ordersResponse.json();
    
    // Find order #1284 (the one that shows delivered-and-paid)
    const order = ordersData.orders.find(o => o.order_number === 1284);
    
    if (!order) {
      return res.status(200).json({
        error: 'Order #1284 not found',
        available_orders: ordersData.orders.map(o => ({
          id: o.id,
          order_number: o.order_number,
          email: o.email,
          financial_status: o.financial_status,
          total_price: o.total_price
        }))
      });
    }
    
    // Get existing transactions
    const transactionsResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${order.id}/transactions.json`,
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
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${order.id}/transactions.json`,
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
            currency: order.currency || 'PLN',
            gateway: 'manual',
            source_name: 'PrimeCOD COD Payment',
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
        currency: order.currency,
        email: order.email
      },
      existing_transactions: transactionsData.transactions,
      payment_attempt: {
        success: paymentResult.ok,
        status: paymentResult.status,
        response: paymentData
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
}

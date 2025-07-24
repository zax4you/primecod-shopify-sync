export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = 6433894957307;
  
  try {
    // Get current order status
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
      return res.status(500).json({ error: 'Could not fetch order' });
    }
    
    const orderData = await orderResponse.json();
    const order = orderData.order;
    
    // Try to mark as paid (simplest approach)
    const markPaidResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
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
    let markPaidData = null;
    try {
      markPaidData = markPaidText ? JSON.parse(markPaidText) : { empty: true };
    } catch (e) {
      markPaidData = { raw: markPaidText };
    }
    
    res.json({
      current_status: order.financial_status,
      current_outstanding: order.total_outstanding,
      mark_paid_attempt: {
        success: markPaidResponse.ok,
        status: markPaidResponse.status,
        response: markPaidData
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

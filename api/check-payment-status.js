export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = 6433894957307; // Order #1284
  
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
    
    const orderData = await orderResponse.json();
    const order = orderData.order;
    
    // Get all transactions
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
    
    // Try to manually mark as paid using direct order update
    const updateResponse = await fetch(
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
            financial_status: 'paid'
          }
        })
      }
    );
    
    const updateText = await updateResponse.text();
    let updateData = null;
    try {
      updateData = updateText ? JSON.parse(updateText) : { raw: updateText };
    } catch (e) {
      updateData = { error: 'JSON parse failed', raw: updateText };
    }
    
    // Get order status after update attempt
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
    
    res.status(200).json({
      before_update: {
        financial_status: order.financial_status,
        total_price: order.total_price,
        currency: order.currency
      },
      transactions: transactionsData.transactions.map(t => ({
        id: t.id,
        kind: t.kind,
        status: t.status,
        amount: t.amount,
        gateway: t.gateway,
        created_at: t.created_at
      })),
      update_attempt: {
        success: updateResponse.ok,
        status: updateResponse.status,
        response: updateData
      },
      after_update: {
        financial_status: finalOrderData.order.financial_status,
        total_price: finalOrderData.order.total_price
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

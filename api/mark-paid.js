export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  // Test with the delivered order
  const orderId = 6437174640891; // Adjust this ID
  
  try {
    // Method 1: Mark order as paid directly
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
            id: orderId,
            financial_status: 'paid'
          }
        })
      }
    );
    
    const result1 = await markPaidResponse.json();
    
    res.status(200).json({
      method1_mark_as_paid: {
        success: markPaidResponse.ok,
        status: markPaidResponse.status,
        response: result1
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

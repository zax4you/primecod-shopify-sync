// api/quick-test.js
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  // Use order #1266 for testing
  const testOrderId = 6431141593339; // Order #1266
  
  try {
    // Get order details first
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
    
    // Try fulfillment with location_id (key difference!)
    const fulfillmentData = {
      fulfillment: {
        location_id: 79055454459,  // ← This might be the missing piece!
        tracking_number: '523000014357350092305576', // Real PrimeCOD tracking
        tracking_company: 'PrimeCOD',
        notify_customer: true,
        line_items: order.line_items.map(item => ({
          id: item.id,
          quantity: item.quantity
        }))
      }
    };
    
    console.log('Testing fulfillment with location_id...');
    
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
    
    const responseText = await fulfillmentResponse.text();
    let responseData;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch (e) {
      responseData = { raw: responseText };
    }
    
    res.json({
      order_status: {
        id: order.id,
        name: order.name,
        fulfillment_status: order.fulfillment_status,
        financial_status: order.financial_status
      },
      fulfillment_test: {
        success: fulfillmentResponse.ok,
        status: fulfillmentResponse.status,
        headers: Object.fromEntries(fulfillmentResponse.headers.entries()),
        request_data: fulfillmentData,
        response: responseData
      },
      note: fulfillmentResponse.ok ? 
        "SUCCESS! API fulfillment worked with location_id" : 
        "Failed - check response for clues"
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

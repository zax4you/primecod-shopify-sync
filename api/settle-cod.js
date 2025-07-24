export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const orderId = 6433894957307; // Order #1284
  const transactionId = 7665699586299; // The pending COD transaction
  
  try {
    // Method 1: Try to capture/settle the existing pending transaction
    const captureResult = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction: {
            kind: 'capture',
            parent_id: transactionId,
            amount: '225.98',
            currency: 'PLN'
          }
        })
      }
    );
    
    const captureData = await captureResult.json();
    
    // Method 2: If capture fails, try updating the transaction directly
    let updateResult = null;
    let updateData = null;
    
    if (!captureResult.ok) {
      updateResult = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${orderId}/transactions/${transactionId}.json`,
        {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            transaction: {
              id: transactionId,
              status: 'success',
              message: 'COD payment received on delivery'
            }
          })
        }
      );
      
      updateData = await updateResult.json();
    }
    
    // Method 3: Mark entire order as paid
    const markOrderPaidResult = await fetch(
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
    
    const orderUpdateData = await markOrderPaidResult.json();
    
    res.status(200).json({
      method1_capture: {
        success: captureResult.ok,
        status: captureResult.status,
        response: captureData
      },
      method2_update_transaction: updateResult ? {
        success: updateResult.ok,
        status: updateResult.status,
        response: updateData
      } : 'Not attempted',
      method3_mark_order_paid: {
        success: markOrderPaidResult.ok,
        status: markOrderPaidResult.status,
        response: orderUpdateData
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

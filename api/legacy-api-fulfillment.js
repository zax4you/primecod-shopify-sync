// api/legacy-api-fulfillment.js
// Using legacy fulfillment API with EXACT parameters that work manually
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  
  const testOrderId = 6431141593339; // Order #1266
  const testOrderNumber = 1266;
  
  try {
    console.log('🎯 Using legacy API with exact manual fulfillment parameters...');
    
    // Step 1: Get order details
    const orderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${testOrderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const orderData = await orderResponse.json();
    const order = orderData.order;
    
    console.log(`📊 Order: ${order.name}`);
    console.log(`💰 Financial Status: ${order.financial_status}`);
    console.log(`📦 Fulfillment Status: ${order.fulfillment_status}`);
    console.log(`🏷️ Tags: ${order.tags}`);
    
    // Step 2: Try MULTIPLE approaches systematically
    const approaches = [
      {
        name: "Method 1: Exact Manual Parameters",
        data: {
          fulfillment: {
            location_id: 79055454459, // From successful manual fulfillment
            tracking_number: "LEGACY-API-TEST-001",
            tracking_company: "Other", // Exact same as manual
            notify_customer: false
          }
        }
      },
      {
        name: "Method 2: With Line Items",
        data: {
          fulfillment: {
            location_id: 79055454459,
            line_items: order.line_items.map(item => ({
              id: item.id,
              quantity: item.quantity
            })),
            tracking_number: "LEGACY-API-TEST-002",
            tracking_company: "Other",
            notify_customer: false
          }
        }
      },
      {
        name: "Method 3: Without Location ID",
        data: {
          fulfillment: {
            tracking_number: "LEGACY-API-TEST-003",
            tracking_company: "Other",
            notify_customer: false
          }
        }
      },
      {
        name: "Method 4: Minimal (no tracking)",
        data: {
          fulfillment: {
            location_id: 79055454459,
            notify_customer: false
          }
        }
      },
      {
        name: "Method 5: Different API Version",
        data: {
          fulfillment: {
            location_id: 79055454459,
            tracking_number: "LEGACY-API-TEST-005",
            tracking_company: "Other",
            notify_customer: false
          }
        },
        apiVersion: "2023-01"
      }
    ];
    
    const results = [];
    
    for (const approach of approaches) {
      console.log(`🔄 Trying ${approach.name}...`);
      
      const apiVersion = approach.apiVersion || "2024-01";
      const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/${apiVersion}/orders/${testOrderId}/fulfillments.json`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(approach.data)
      });
      
      const responseText = await response.text();
      let responseData;
      
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        responseData = { raw: responseText };
      }
      
      const result = {
        method: approach.name,
        api_version: apiVersion,
        success: response.ok,
        status: response.status,
        request_data: approach.data,
        response: responseData
      };
      
      results.push(result);
      
      console.log(`📊 ${approach.name}: ${response.ok ? 'SUCCESS' : 'FAILED'} (${response.status})`);
      
      // If this method succeeded, break and use it
      if (response.ok) {
        console.log('✅ Found working method!');
        break;
      }
      
      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 3: Try one more approach if all failed - using different headers
    const lastAttemptSuccess = results.some(r => r.success);
    
    if (!lastAttemptSuccess) {
      console.log('🔄 Final attempt: Different headers...');
      
      const finalAttemptResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${testOrderId}/fulfillments.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'PrimeCOD-Integration/1.0'
          },
          body: JSON.stringify({
            fulfillment: {
              location_id: 79055454459,
              tracking_number: "LEGACY-FINAL-TEST",
              tracking_company: "Other",
              notify_customer: false
            }
          })
        }
      );
      
      const finalText = await finalAttemptResponse.text();
      let finalData;
      try {
        finalData = finalText ? JSON.parse(finalText) : {};
      } catch (e) {
        finalData = { raw: finalText };
      }
      
      results.push({
        method: "Final Attempt: Different Headers",
        api_version: "2024-01",
        success: finalAttemptResponse.ok,
        status: finalAttemptResponse.status,
        response: finalData
      });
    }
    
    // Step 4: Get final order status
    const finalOrderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders/${testOrderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const finalOrder = await finalOrderResponse.json();
    
    const overallSuccess = results.some(result => result.success) || 
                          finalOrder.order.fulfillment_status === 'fulfilled';
    
    const successfulMethod = results.find(result => result.success);
    
    res.json({
      success: overallSuccess,
      message: overallSuccess 
        ? `Order #${testOrderNumber} fulfilled using legacy API!`
        : `All legacy API methods failed for order #${testOrderNumber}`,
      
      approach: "Legacy Fulfillment API (systematic testing)",
      
      order_info: {
        id: testOrderId,
        number: testOrderNumber,
        initial_status: {
          financial: order.financial_status,
          fulfillment: order.fulfillment_status
        }
      },
      
      methods_tested: results.length,
      successful_method: successfulMethod || null,
      
      all_results: results,
      
      final_status: {
        financial_status: finalOrder.order.financial_status,
        fulfillment_status: finalOrder.order.fulfillment_status,
        tags: finalOrder.order.tags
      },
      
      next_steps: overallSuccess ? 
        "Success! Use the working method in main integration" :
        "Consider updating app scopes to use modern FulfillmentOrders API",
      
      scope_solution: {
        required_scopes: [
          "read_merchant_managed_fulfillment_orders",
          "write_merchant_managed_fulfillment_orders"
        ],
        how_to_add: "Update Shopify app configuration in Partner Dashboard"
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      test_order: testOrderNumber
    });
  }
}

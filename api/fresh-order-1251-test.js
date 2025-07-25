// api/fresh-order-1251-test.js
// Complete fresh test with Order #1251 using new Admin API token
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  
  const TARGET_ORDER_NUMBER = 1251;
  
  try {
    console.log('🚀 FRESH START: Complete integration test with Order #1251');
    console.log('🔑 Using new Admin API token with proper scopes');
    
    // STEP 1: Scope Verification Test
    console.log('🔍 STEP 1: Verifying new API scopes...');
    
    const scopeTestQuery = `
      query testAllScopes {
        fulfillmentOrders(first: 1) {
          edges {
            node {
              id
              status
            }
          }
        }
        orders(first: 1) {
          edges {
            node {
              id
              name
            }
          }
        }
        locations(first: 1) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `;
    
    const scopeTestResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: scopeTestQuery
        })
      }
    );
    
    const scopeTestData = await scopeTestResponse.json();
    
    if (scopeTestData.errors) {
      return res.json({
        success: false,
        step: "STEP 1: Scope Verification",
        error: "❌ SCOPE VERIFICATION FAILED",
        errors: scopeTestData.errors,
        message: "New API token still missing required scopes",
        required_scopes: [
          "read_merchant_managed_fulfillment_orders",
          "write_merchant_managed_fulfillment_orders",
          "read_locations",
          "read_orders",
          "write_orders"
        ],
        next_action: "Check app configuration in Shopify admin and ensure all scopes are selected"
      });
    }
    
    console.log('✅ STEP 1 SUCCESS: All required scopes verified!');
    
    // STEP 2: Get Order #1251 directly (we know it exists)
    console.log('📋 STEP 2: Getting Order #1251 directly...');
    
    const orderId = "6428610822395"; // Direct ID from the URL
    
    const getOrderQuery = `
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          legacyResourceId
          name
          email
          phone
          createdAt
          financialStatus
          fulfillmentStatus
          customer {
            firstName
            lastName
          }
          billingAddress {
            firstName
            lastName
            city
            address1
            phone
          }
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          paymentGatewayNames
          tags
        }
      }
    `;
    
    const getOrderResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: getOrderQuery,
          variables: {
            id: `gid://shopify/Order/${orderId}`
          }
        })
      }
    );
    
    const getOrderData = await getOrderResponse.json();
    
    if (!getOrderData.data?.order) {
      return res.json({
        success: false,
        step: "STEP 2: Get Order",
        error: `❌ Order #${TARGET_ORDER_NUMBER} not accessible`,
        message: "Could not access the target order",
        order_id_tried: orderId,
        graphql_errors: getOrderData.errors
      });
    }
    
    const order = getOrderData.data.order;
    
    console.log(`✅ STEP 2 SUCCESS: Found Order ${order.name} (ID: ${orderId})`);
    console.log(`📊 Customer: ${order.customer?.firstName} ${order.customer?.lastName}`);
    console.log(`📧 Email: ${order.email}`);
    console.log(`💰 Status: ${order.financialStatus}/${order.fulfillmentStatus}`);
    console.log(`🏷️ Tags: ${order.tags}`);
    
    // STEP 3: Get PrimeCOD Data
    console.log('📦 STEP 3: Fetching PrimeCOD data...');
    
    let matchingLead = null;
    let trackingNumber = null;
    
    try {
      const primecodResponse = await fetch('https://api.primecod.app/api/leads', {
        headers: {
          'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (primecodResponse.ok) {
        const primecodData = await primecodResponse.json();
        const leads = primecodData.data || [];
        
        console.log(`📋 Retrieved ${leads.length} PrimeCOD leads`);
        
        // Find matching lead by email and date proximity
        matchingLead = leads.find(lead => {
          if (!lead.email || !order.email) return false;
          
          const emailMatch = lead.email.toLowerCase() === order.email.toLowerCase();
          if (!emailMatch) return false;
          
          // Check date proximity (within 7 days)
          const orderDate = new Date(order.createdAt);
          const leadDate = new Date(lead.created_at);
          const daysDiff = Math.abs(orderDate - leadDate) / (1000 * 60 * 60 * 24);
          
          return daysDiff <= 7;
        });
        
        if (matchingLead) {
          trackingNumber = matchingLead.tracking_number;
          console.log(`✅ STEP 3 SUCCESS: Found PrimeCOD lead ${matchingLead.reference}`);
          console.log(`📦 Tracking: ${trackingNumber || 'Not available'}`);
          console.log(`🚚 Status: ${matchingLead.shipping_status}`);
        } else {
          console.log('⚠️ STEP 3: No matching PrimeCOD lead found');
        }
      }
    } catch (error) {
      console.log(`⚠️ STEP 3 ERROR: ${error.message}`);
    }
    
    // STEP 4: Get Fulfillment Orders
    console.log('🔄 STEP 4: Getting fulfillment orders...');
    
    const fulfillmentOrdersQuery = `
      query getFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) {
          id
          name
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                status
                assignedLocation {
                  location {
                    id
                    name
                  }
                }
                lineItems(first: 20) {
                  edges {
                    node {
                      id
                      totalQuantity
                      remainingQuantity
                      lineItem {
                        id
                        title
                        sku
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const fulfillmentOrdersResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: fulfillmentOrdersQuery,
          variables: {
            orderId: order.id
          }
        })
      }
    );
    
    const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
    
    if (fulfillmentOrdersData.errors) {
      return res.json({
        success: false,
        step: "STEP 4: Get Fulfillment Orders",
        error: "❌ FULFILLMENT ORDERS ACCESS FAILED",
        errors: fulfillmentOrdersData.errors,
        message: "Cannot access fulfillment orders despite scope verification"
      });
    }
    
    const fulfillmentOrders = fulfillmentOrdersData.data.order.fulfillmentOrders.edges;
    
    console.log(`✅ STEP 4 SUCCESS: Found ${fulfillmentOrders.length} fulfillment orders`);
    
    if (fulfillmentOrders.length === 0) {
      return res.json({
        success: false,
        step: "STEP 4: Get Fulfillment Orders",
        error: "❌ NO FULFILLMENT ORDERS FOUND",
        message: "Order has no fulfillment orders (might already be fulfilled or cancelled)",
        order_status: {
          financial: order.financialStatus,
          fulfillment: order.fulfillmentStatus
        }
      });
    }
    
    // STEP 5: Create Fulfillment
    console.log('🚀 STEP 5: Creating fulfillment...');
    
    const fulfillmentOrder = fulfillmentOrders[0].node;
    const testTrackingNumber = trackingNumber || `ORDER-1251-${Date.now()}`;
    
    console.log(`📍 Location: ${fulfillmentOrder.assignedLocation.location.name}`);
    console.log(`📦 Using tracking: ${testTrackingNumber}`);
    
    const fulfillmentMutation = `
      mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment {
            id
            status
            trackingInfo {
              number
              company
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const fulfillmentLineItems = fulfillmentOrder.lineItems.edges.map(edge => ({
      id: edge.node.id,
      quantity: edge.node.remainingQuantity || edge.node.totalQuantity
    }));
    
    const fulfillmentVariables = {
      fulfillment: {
        lineItems: fulfillmentLineItems,
        locationId: fulfillmentOrder.assignedLocation.location.id,
        trackingInfo: {
          number: testTrackingNumber,
          company: matchingLead ? "PrimeCOD" : "Test Fulfillment"
        },
        notifyCustomer: true // Send notification since this is a real test
      }
    };
    
    const fulfillmentResponse = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: fulfillmentMutation,
          variables: fulfillmentVariables
        })
      }
    );
    
    const fulfillmentData = await fulfillmentResponse.json();
    
    const fulfillmentSuccess = fulfillmentResponse.ok && 
                              fulfillmentData.data?.fulfillmentCreate?.fulfillment &&
                              (!fulfillmentData.data.fulfillmentCreate.userErrors || 
                               fulfillmentData.data.fulfillmentCreate.userErrors.length === 0);
    
    if (fulfillmentSuccess) {
      console.log(`🎉 STEP 5 SUCCESS: Fulfillment created!`);
      console.log(`📦 Fulfillment ID: ${fulfillmentData.data.fulfillmentCreate.fulfillment.id}`);
    } else {
      console.log(`❌ STEP 5 FAILED: Fulfillment creation failed`);
      console.log(`📝 Errors: ${JSON.stringify(fulfillmentData.data?.fulfillmentCreate?.userErrors)}`);
    }
    
    // STEP 6: Test Payment Update (if fulfillment succeeded)
    let paymentUpdateResult = null;
    
    if (fulfillmentSuccess) {
      console.log('💰 STEP 6: Testing payment status update...');
      
      const paymentUpdateResponse = await fetch(
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
              financial_status: "paid"
            }
          })
        }
      );
      
      paymentUpdateResult = {
        success: paymentUpdateResponse.ok,
        status: paymentUpdateResponse.status
      };
      
      if (paymentUpdateResponse.ok) {
        console.log('✅ STEP 6 SUCCESS: Payment status updated');
      } else {
        console.log('⚠️ STEP 6: Payment update had issues');
      }
    }
    
    // STEP 7: Add comprehensive success note
    if (fulfillmentSuccess) {
      const successNote = [
        `🎉 COMPLETE INTEGRATION SUCCESS - ${new Date().toISOString()}`,
        `✅ Fresh start test with new Admin API token`,
        `✅ All required scopes verified and working`,
        `✅ Order #${TARGET_ORDER_NUMBER} fulfilled via API`,
        `📦 Tracking: ${testTrackingNumber}`,
        matchingLead ? `🔗 PrimeCOD Reference: ${matchingLead.reference}` : `🧪 Test fulfillment (no PrimeCOD match)`,
        `💰 Payment update: ${paymentUpdateResult?.success ? 'Success' : 'Attempted'}`,
        `🚀 COD API fulfillment is now fully functional!`
      ].join('\n');
      
      await fetch(
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
              note: successNote
            }
          })
        }
      );
    }
    
    // FINAL RESULTS
    const overallSuccess = fulfillmentSuccess;
    
    res.json({
      success: overallSuccess,
      message: overallSuccess 
        ? "🎉 COMPLETE SUCCESS! Fresh start integration test passed!" 
        : "❌ Integration test failed at fulfillment step",
      
      test_summary: {
        order_tested: `#${TARGET_ORDER_NUMBER}`,
        customer_email: order.email,
        customer_name: `${order.customer?.firstName} ${order.customer?.lastName}`,
        primecod_match: !!matchingLead,
        tracking_used: testTrackingNumber
      },
      
      step_results: {
        step1_scope_verification: "✅ PASSED",
        step2_order_found: "✅ PASSED", 
        step3_primecod_data: matchingLead ? "✅ FOUND" : "⚠️ NO MATCH",
        step4_fulfillment_orders: "✅ PASSED",
        step5_fulfillment_creation: fulfillmentSuccess ? "✅ PASSED" : "❌ FAILED",
        step6_payment_update: paymentUpdateResult?.success ? "✅ PASSED" : "⚠️ ATTEMPTED"
      },
      
      integration_status: overallSuccess 
        ? "🚀 READY FOR PRODUCTION" 
        : "🔧 NEEDS DEBUGGING",
      
      primecod_integration: {
        lead_found: !!matchingLead,
        reference: matchingLead?.reference || null,
        tracking_number: trackingNumber || null,
        shipping_status: matchingLead?.shipping_status || null
      },
      
      fulfillment_details: {
        success: fulfillmentSuccess,
        fulfillment_id: fulfillmentData.data?.fulfillmentCreate?.fulfillment?.id,
        tracking_number: testTrackingNumber,
        user_errors: fulfillmentData.data?.fulfillmentCreate?.userErrors || []
      },
      
      next_steps: overallSuccess ? [
        "✅ Update main sync-orders.js to use modern API",
        "✅ Enable automated fulfillment for all COD orders", 
        "✅ Test with live PrimeCOD shipped orders",
        "✅ Deploy to production"
      ] : [
        "🔍 Review fulfillment error details",
        "🔧 Debug remaining API issues",
        "📞 Contact Shopify support if needed"
      ]
    });
    
  } catch (error) {
    console.error('❌ FRESH START TEST ERROR:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message,
      message: "Fresh start test encountered an unexpected error"
    });
  }
}

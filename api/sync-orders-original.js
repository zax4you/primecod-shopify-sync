// api/sync-orders.js - PRODUCTION READY with proven fulfillment logic
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🚀 Starting PrimeCOD → Shopify daily sync…');
    const startTime = new Date();

    const syncResults = {
      total_leads_processed: 0,
      orders_updated: 0,
      fulfilled_orders: 0,
      paid_orders: 0,
      refunded_orders: 0,
      processing_orders: 0,
      errors: [],
      successful_updates: [],
      pages_processed: 3
    };

    // Process first 3 pages for daily sync (covers ~30 recent orders)
    for (let page = 1; page <= 3; page++) {
      console.log(`📄 Processing page ${page}/3...`);
      
      const primecodResponse = await fetch(`https://api.primecod.app/api/leads?page=${page}`, {
        headers: {
          'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!primecodResponse.ok) {
        throw new Error(`PrimeCOD API error on page ${page}: ${primecodResponse.status}`);
      }

      const primecodData = await primecodResponse.json();
      const leads = primecodData.data;
      
      syncResults.total_leads_processed += leads.length;
      console.log(`📦 Processing ${leads.length} leads from page ${page}`);

      // Process each lead
      for (const lead of leads) {
        try {
          const updateResult = await processLead(lead, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
          if (updateResult) {
            syncResults.orders_updated++;
            syncResults.successful_updates.push(updateResult);
            
            // Count update types
            if (updateResult.updates.includes('fulfilled-with-tracking')) {
              syncResults.fulfilled_orders++;
            }
            if (updateResult.updates.includes('cod-payment-recorded')) {
              syncResults.paid_orders++;
            }
            if (updateResult.updates.includes('refunded')) {
              syncResults.refunded_orders++;
            }
            if (updateResult.updates.includes('status-updated')) {
              syncResults.processing_orders++;
            }
          }
        } catch (error) {
          const errorInfo = {
            primecod_reference: lead.reference,
            error: error.message,
            status: lead.shipping_status
          };
          syncResults.errors.push(errorInfo);
          console.error(`❌ Error processing lead ${lead.reference}:`, error.message);
        }
      }
    }

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`✅ DAILY SYNC COMPLETE in ${duration}s`);
    console.log(`📊 Results: ${syncResults.orders_updated} orders updated, ${syncResults.errors.length} errors`);

    res.status(200).json({
      success: true,
      message: `Daily sync completed in ${duration}s`,
      summary: {
        duration_seconds: parseFloat(duration),
        total_leads_processed: syncResults.total_leads_processed,
        orders_updated: syncResults.orders_updated,
        fulfilled_orders: syncResults.fulfilled_orders,
        paid_orders: syncResults.paid_orders,
        refunded_orders: syncResults.refunded_orders,
        processing_orders: syncResults.processing_orders,
        error_count: syncResults.errors.length
      },
      detailed_updates: syncResults.successful_updates,
      errors: syncResults.errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Daily sync failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

async function processLead(lead, shopifyStore, shopifyAccessToken) {
  // Find corresponding Shopify order
  const shopifyOrder = await findShopifyOrder(lead, shopifyStore, shopifyAccessToken);

  if (!shopifyOrder) {
    console.log(`🔍 No Shopify order found for PrimeCOD ${lead.reference}`);
    return null;
  }

  const updates = [];
  console.log(`🔄 Processing PrimeCOD ${lead.reference} → Shopify order ${shopifyOrder.order_number}`);

  // ✅ HANDLE DELIVERED ORDERS (proven working - 8 orders in your data)
  if (lead.shipping_status === 'delivered' && lead.tracking_number) {
    
    // Fulfill with tracking if not already fulfilled
    if (shopifyOrder.fulfillment_status !== 'fulfilled') {
      console.log(`📦 Fulfilling delivered order with tracking: ${lead.tracking_number}`);
      
      const fulfillmentResult = await fulfillOrderWithTracking(
        shopifyOrder.id, 
        lead.tracking_number,
        shopifyStore, 
        shopifyAccessToken
      );
      
      if (fulfillmentResult.success) {
        console.log(`✅ Fulfilled order ${shopifyOrder.order_number} with tracking: ${lead.tracking_number}`);
        updates.push('fulfilled-with-tracking');
        
        await addOrderNote(
          shopifyOrder.id, 
          `PrimeCOD: Package delivered ${lead.delivered_at} with tracking ${lead.tracking_number}`, 
          shopifyStore, 
          shopifyAccessToken
        );
        await updateOrderTags(shopifyOrder.id, ['primecod-delivered', 'cod-fulfilled'], shopifyStore, shopifyAccessToken);
      } else {
        console.error(`❌ Fulfillment failed for ${shopifyOrder.order_number}:`, fulfillmentResult.error);
      }
    }

    // Mark as paid (COD payment collected on delivery)
    if (shopifyOrder.financial_status === 'pending') {
      const paidSuccess = await markOrderAsPaid(shopifyOrder.id, shopifyStore, shopifyAccessToken);
      if (paidSuccess) {
        console.log(`💰 Marked delivered order ${shopifyOrder.order_number} as paid (COD collected)`);
        updates.push('cod-payment-recorded');
      }
    }
  }

  // ✅ HANDLE RETURNED ORDERS (3 in your data)
  if (lead.shipping_status === 'returned') {
    console.log(`❌ Processing returned order: ${lead.reference}`);
    
    // Step 1: Mark as paid first (for TrueProfit accounting - money in)
    const paidSuccess = await markOrderAsPaid(shopifyOrder.id, shopifyStore, shopifyAccessToken);
    if (paidSuccess) {
      console.log(`💰 Marked returned order ${shopifyOrder.order_number} as paid`);
      updates.push('marked-as-paid');
    }
    
    // Step 2: Create full refund (for TrueProfit accounting - money out)
    const refundSuccess = await createFullRefund(shopifyOrder.id, shopifyStore, shopifyAccessToken);
    if (refundSuccess) {
      console.log(`💸 Refunded returned order ${shopifyOrder.order_number}`);
      updates.push('refunded');
    }

    await addOrderNote(shopifyOrder.id, `PrimeCOD: Order returned - Paid and refunded for accounting`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-returned'], shopifyStore, shopifyAccessToken);
  }

  // ✅ HANDLE PROCESSING ORDERS (16 "order placed" in your data)
  if (lead.shipping_status === 'order placed') {
    console.log(`⏳ Order still processing: ${lead.reference}`);
    await addOrderNote(shopifyOrder.id, `PrimeCOD: Order placed with supplier - awaiting shipment`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-processing'], shopifyStore, shopifyAccessToken);
    updates.push('status-updated');
  }

  if (updates.length > 0) {
    console.log(`📝 Updated Shopify order ${shopifyOrder.order_number} for PrimeCOD ${lead.reference} (${updates.join(', ')})`);
    return {
      primecod_reference: lead.reference,
      shopify_order: shopifyOrder.order_number,
      updates: updates,
      tracking_number: lead.tracking_number || null,
      status: lead.shipping_status
    };
  }

  return null;
}

// ✅ PROVEN WORKING fulfillment function (tested successfully)
async function fulfillOrderWithTracking(orderId, trackingNumber, shopifyStore, shopifyAccessToken) {
  try {
    console.log(`🚚 Fulfilling order ${orderId} with tracking: ${trackingNumber}`);

    // Step 1: Get fulfillment orders
    const fulfillmentOrdersQuery = `
      query GetFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) {
          id
          name
          fulfillmentOrders(first: 10) {
            edges {
              node {
                id
                status
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      remainingQuantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const fulfillmentOrdersResponse = await fetch(`https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: fulfillmentOrdersQuery,
        variables: { orderId: `gid://shopify/Order/${orderId}` }
      })
    });

    const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
    
    if (fulfillmentOrdersData.errors) {
      return { success: false, error: 'GraphQL query failed', details: fulfillmentOrdersData.errors };
    }

    const order = fulfillmentOrdersData.data?.order;
    if (!order) {
      return { success: false, error: 'Order not found', orderId };
    }

    const fulfillmentOrders = order.fulfillmentOrders?.edges || [];
    if (fulfillmentOrders.length === 0) {
      return { success: false, error: 'No fulfillment orders found', orderName: order.name };
    }

    const fulfillmentOrder = fulfillmentOrders[0].node;
    
    // Step 2: Create fulfillment with your proven tracking format
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

    const fulfillmentVariables = {
      fulfillment: {
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: fulfillmentOrder.id,
            fulfillmentOrderLineItems: fulfillmentOrder.lineItems.edges.map(edge => ({
              id: edge.node.id,
              quantity: edge.node.remainingQuantity
            }))
          }
        ],
        notifyCustomer: false, // ✅ No customer emails
        trackingInfo: {
          number: trackingNumber.toString(), // Your 24-digit format
          company: "PrimeCOD" // ✅ Mapped from "Unknown"
        }
      }
    };

    const fulfillmentResponse = await fetch(`https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: fulfillmentMutation,
        variables: fulfillmentVariables
      })
    });

    const fulfillmentData = await fulfillmentResponse.json();
    
    if (fulfillmentData.errors) {
      return { success: false, error: 'GraphQL fulfillment failed', details: fulfillmentData.errors };
    }

    if (fulfillmentData.data?.fulfillmentCreate?.userErrors?.length > 0) {
      return { 
        success: false, 
        error: 'Fulfillment user errors', 
        details: fulfillmentData.data.fulfillmentCreate.userErrors 
      };
    }

    if (fulfillmentData.data?.fulfillmentCreate?.fulfillment?.id) {
      const fulfillmentId = fulfillmentData.data.fulfillmentCreate.fulfillment.id;
      console.log(`✅ Fulfillment created: ${fulfillmentId}`);
      return { success: true, fulfillmentId, trackingNumber };
    }

    return { success: false, error: 'Unexpected fulfillment response', details: fulfillmentData };

  } catch (error) {
    console.error('❌ Error creating fulfillment:', error.message);
    return { success: false, error: error.message };
  }
}

// ✅ WORKING mark as paid function using GraphQL
async function markOrderAsPaid(orderId, shopifyStore, shopifyAccessToken) {
  try {
    const markAsPaidMutation = `
      mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          order {
            id
            displayFinancialStatus
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await fetch(`https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: markAsPaidMutation,
        variables: { input: { id: `gid://shopify/Order/${orderId}` } }
      })
    });

    const data = await response.json();
    
    if (data.data?.orderMarkAsPaid?.userErrors?.length > 0) {
      console.error('❌ Mark as paid errors:', data.data.orderMarkAsPaid.userErrors);
      return false;
    }

    return data.data?.orderMarkAsPaid?.order?.id ? true : false;

  } catch (error) {
    console.error('❌ Error marking order as paid:', error.message);
    return false;
  }
}

// ✅ WORKING full refund function using GraphQL
async function createFullRefund(orderId, shopifyStore, shopifyAccessToken) {
  try {
    // Get order details first
    const orderQuery = `
      query GetOrder($orderId: ID!) {
        order(id: $orderId) {
          id
          lineItems(first: 50) {
            edges {
              node {
                id
                quantity
                refundableQuantity
              }
            }
          }
          shippingLine {
            id
          }
        }
      }
    `;

    const orderResponse = await fetch(`https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: orderQuery,
        variables: { orderId: `gid://shopify/Order/${orderId}` }
      })
    });

    const orderData = await orderResponse.json();
    const order = orderData.data?.order;

    if (!order) {
      console.error('❌ Could not fetch order for refund');
      return false;
    }

    // Create full refund
    const refundMutation = `
      mutation refundCreate($input: RefundInput!) {
        refundCreate(input: $input) {
          refund {
            id
            totalRefundedSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const refundVariables = {
      input: {
        orderId: `gid://shopify/Order/${orderId}`,
        note: "COD order returned - automatic refund by PrimeCOD integration",
        notify: false, // ✅ No customer notification
        refundLineItems: order.lineItems.edges.map(edge => ({
          lineItemId: edge.node.id,
          quantity: edge.node.refundableQuantity,
          restockType: "NO_RESTOCK"
        })),
        shipping: order.shippingLine ? { fullRefund: true } : undefined,
        transactions: [] // Let Shopify determine refund method
      }
    };

    const refundResponse = await fetch(`https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: refundMutation,
        variables: refundVariables
      })
    });

    const refundData = await refundResponse.json();
    
    if (refundData.data?.refundCreate?.userErrors?.length > 0) {
      console.error('❌ Refund errors:', refundData.data.refundCreate.userErrors);
      return false;
    }

    if (refundData.data?.refundCreate?.refund?.id) {
      console.log(`✅ Refund created: ${refundData.data.refundCreate.refund.id}`);
      return true;
    }

    return false;

  } catch (error) {
    console.error('❌ Error creating refund:', error.message);
    return false;
  }
}

// Helper functions (unchanged)
async function findShopifyOrder(lead, shopifyStore, shopifyAccessToken) {
  if (lead.email) {
    const emailSearch = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json?email=${encodeURIComponent(lead.email)}&status=any&limit=50`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (emailSearch.ok) {
      const emailResults = await emailSearch.json();
      
      if (emailResults.orders && emailResults.orders.length >= 1) {
        return emailResults.orders[0];
      }
    }
  }
  return null;
}

async function updateOrderTags(orderId, newTags, shopifyStore, shopifyAccessToken) {
  const orderResponse = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      }
    }
  );

  if (orderResponse.ok) {
    const orderData = await orderResponse.json();
    const existingTags = orderData.order.tags ? orderData.order.tags.split(', ') : [];
    const allTags = [...new Set([...existingTags, ...newTags])];

    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            id: orderId,
            tags: allTags.join(', ')
          }
        })
      }
    );

    return response.ok;
  }
}

async function addOrderNote(orderId, note, shopifyStore, shopifyAccessToken) {
  const orderResponse = await fetch(
    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json'
      }
    }
  );

  if (orderResponse.ok) {
    const orderData = await orderResponse.json();
    const existingNote = orderData.order.note || '';
    const newNote = existingNote ? `${existingNote}\n\n${note}` : note;

    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders/${orderId}.json`,
      {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            id: orderId,
            note: newNote
          }
        })
      }
    );

    return response.ok;
  }
}

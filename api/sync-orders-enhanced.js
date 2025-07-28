// api/sync-orders-enhanced.js - Enhanced version with better recent order handling
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🚀 Starting ENHANCED PrimeCOD → Shopify sync...');
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
      pages_processed: 0,
      recent_leads_count: 0,
      date_range_processed: '',
      debug_info: {
        first_lead_date: null,
        last_lead_date: null,
        emails_found: 0,
        emails_missing: 0,
        shopify_matches: 0,
        shopify_misses: 0
      }
    };

    // Process more pages to catch recent orders (first 5 pages = 50 recent leads)
    const maxPages = 5;
    let oldestProcessedDate = null;
    let newestProcessedDate = null;

    for (let page = 1; page <= maxPages; page++) {
      console.log(`📄 Processing page ${page}/${maxPages}...`);
      
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
      
      if (leads.length === 0) {
        console.log(`📄 Page ${page} is empty, stopping pagination`);
        break;
      }
      
      syncResults.total_leads_processed += leads.length;
      syncResults.pages_processed = page;
      console.log(`📦 Processing ${leads.length} leads from page ${page}`);

      // Track date range
      for (const lead of leads) {
        const leadDate = new Date(lead.created_at);
        if (!oldestProcessedDate || leadDate < oldestProcessedDate) {
          oldestProcessedDate = leadDate;
        }
        if (!newestProcessedDate || leadDate > newestProcessedDate) {
          newestProcessedDate = leadDate;
        }
      }

      // Count recent leads (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentLeads = leads.filter(lead => new Date(lead.created_at) >= sevenDaysAgo);
      syncResults.recent_leads_count += recentLeads.length;

      // Process each lead with enhanced logging
      for (const lead of leads) {
        try {
          console.log(`🔍 Processing lead ${lead.reference} (${lead.shipping_status}, created: ${lead.created_at})`);
          
          // Track email availability
          if (lead.email && lead.email.trim()) {
            syncResults.debug_info.emails_found++;
            console.log(`📧 Email found: ${lead.email}`);
          } else {
            syncResults.debug_info.emails_missing++;
            console.log(`❌ No email for ${lead.reference}`);
            continue; // Skip orders without email
          }

          const updateResult = await processLeadEnhanced(lead, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
          
          if (updateResult) {
            syncResults.orders_updated++;
            syncResults.successful_updates.push(updateResult);
            syncResults.debug_info.shopify_matches++;
            
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
            
            console.log(`✅ Updated ${lead.reference} → Shopify order ${updateResult.shopify_order} (${updateResult.updates.join(', ')})`);
          } else {
            syncResults.debug_info.shopify_misses++;
            console.log(`❌ No Shopify match found for ${lead.reference} (${lead.email})`);
          }
        } catch (error) {
          const errorInfo = {
            primecod_reference: lead.reference,
            error: error.message,
            status: lead.shipping_status,
            email: lead.email || 'NO_EMAIL'
          };
          syncResults.errors.push(errorInfo);
          console.error(`❌ Error processing lead ${lead.reference}:`, error.message);
        }
      }
    }

    // Set debug info
    syncResults.debug_info.first_lead_date = newestProcessedDate?.toISOString();
    syncResults.debug_info.last_lead_date = oldestProcessedDate?.toISOString();
    syncResults.date_range_processed = `${oldestProcessedDate?.toISOString().split('T')[0]} to ${newestProcessedDate?.toISOString().split('T')[0]}`;

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`✅ ENHANCED SYNC COMPLETE in ${duration}s`);
    console.log(`📊 Results: ${syncResults.orders_updated} orders updated, ${syncResults.errors.length} errors`);
    console.log(`📅 Date range: ${syncResults.date_range_processed}`);
    console.log(`📧 Email status: ${syncResults.debug_info.emails_found} found, ${syncResults.debug_info.emails_missing} missing`);
    console.log(`🎯 Match rate: ${syncResults.debug_info.shopify_matches}/${syncResults.debug_info.emails_found} (${Math.round((syncResults.debug_info.shopify_matches / Math.max(syncResults.debug_info.emails_found, 1)) * 100)}%)`);

    res.status(200).json({
      success: true,
      message: `Enhanced sync completed in ${duration}s`,
      summary: {
        duration_seconds: parseFloat(duration),
        total_leads_processed: syncResults.total_leads_processed,
        recent_leads_last_7_days: syncResults.recent_leads_count,
        pages_processed: syncResults.pages_processed,
        date_range_processed: syncResults.date_range_processed,
        orders_updated: syncResults.orders_updated,
        fulfilled_orders: syncResults.fulfilled_orders,
        paid_orders: syncResults.paid_orders,
        refunded_orders: syncResults.refunded_orders,
        processing_orders: syncResults.processing_orders,
        error_count: syncResults.errors.length,
        match_rate_percentage: Math.round((syncResults.debug_info.shopify_matches / Math.max(syncResults.debug_info.emails_found, 1)) * 100)
      },
      debug_info: syncResults.debug_info,
      detailed_updates: syncResults.successful_updates,
      errors: syncResults.errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Enhanced sync failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

async function processLeadEnhanced(lead, shopifyStore, shopifyAccessToken) {
  // Find corresponding Shopify order with enhanced logging
  console.log(`🔍 Searching for Shopify order matching ${lead.reference} (${lead.email})`);
  const shopifyOrder = await findShopifyOrderEnhanced(lead, shopifyStore, shopifyAccessToken);

  if (!shopifyOrder) {
    console.log(`❌ No Shopify order found for PrimeCOD ${lead.reference} with email ${lead.email}`);
    return null;
  }

  const updates = [];
  console.log(`🔄 Processing PrimeCOD ${lead.reference} → Shopify order ${shopifyOrder.order_number} (Financial: ${shopifyOrder.financial_status}, Fulfillment: ${shopifyOrder.fulfillment_status || 'none'})`);

  // ✅ HANDLE DELIVERED ORDERS
  if (lead.shipping_status === 'delivered' && lead.tracking_number) {
    console.log(`📦 Order delivered with tracking: ${lead.tracking_number}`);
    
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
          `PrimeCOD: Package delivered ${lead.delivered_at || 'today'} with tracking ${lead.tracking_number}`, 
          shopifyStore, 
          shopifyAccessToken
        );
        await updateOrderTags(shopifyOrder.id, ['primecod-delivered', 'cod-fulfilled'], shopifyStore, shopifyAccessToken);
      } else {
        console.error(`❌ Fulfillment failed for ${shopifyOrder.order_number}:`, fulfillmentResult.error);
      }
    } else {
      console.log(`ℹ️ Order ${shopifyOrder.order_number} already fulfilled`);
    }

    // Mark as paid (COD payment collected on delivery)
    if (shopifyOrder.financial_status === 'pending') {
      console.log(`💰 Marking delivered order as paid (COD collected)`);
      const paidSuccess = await markOrderAsPaid(shopifyOrder.id, shopifyStore, shopifyAccessToken);
      if (paidSuccess) {
        console.log(`✅ Marked delivered order ${shopifyOrder.order_number} as paid (COD collected)`);
        updates.push('cod-payment-recorded');
      }
    } else {
      console.log(`ℹ️ Order ${shopifyOrder.order_number} already marked as ${shopifyOrder.financial_status}`);
    }
  }

  // ✅ HANDLE RETURNED ORDERS
  if (lead.shipping_status === 'returned') {
    console.log(`🔄 Processing returned order: ${lead.reference}`);
    
    // Step 1: Mark as paid first (for TrueProfit accounting)
    if (shopifyOrder.financial_status === 'pending') {
      const paidSuccess = await markOrderAsPaid(shopifyOrder.id, shopifyStore, shopifyAccessToken);
      if (paidSuccess) {
        console.log(`💰 Marked returned order ${shopifyOrder.order_number} as paid`);
        updates.push('marked-as-paid');
      }
    }
    
    // Step 2: Create full refund
    const refundSuccess = await createFullRefund(shopifyOrder.id, shopifyStore, shopifyAccessToken);
    if (refundSuccess) {
      console.log(`💸 Refunded returned order ${shopifyOrder.order_number}`);
      updates.push('refunded');
    }

    await addOrderNote(shopifyOrder.id, `PrimeCOD: Order returned - Paid and refunded for accounting`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-returned'], shopifyStore, shopifyAccessToken);
  }

  // ✅ HANDLE PROCESSING ORDERS
  if (lead.shipping_status === 'order placed' || lead.shipping_status === 'shipped') {
    console.log(`⏳ Order in progress: ${lead.reference} (${lead.shipping_status})`);
    
    const statusNote = lead.shipping_status === 'shipped' 
      ? `PrimeCOD: Order shipped${lead.tracking_number ? ` with tracking ${lead.tracking_number}` : ''}`
      : `PrimeCOD: Order placed with supplier - awaiting shipment`;
    
    await addOrderNote(shopifyOrder.id, statusNote, shopifyStore, shopifyAccessToken);
    
    const statusTag = lead.shipping_status === 'shipped' ? 'primecod-shipped' : 'primecod-processing';
    await updateOrderTags(shopifyOrder.id, [statusTag], shopifyStore, shopifyAccessToken);
    updates.push('status-updated');
  }

  if (updates.length > 0) {
    console.log(`📝 Updated Shopify order ${shopifyOrder.order_number} for PrimeCOD ${lead.reference} (${updates.join(', ')})`);
    return {
      primecod_reference: lead.reference,
      shopify_order: shopifyOrder.order_number,
      shopify_order_id: shopifyOrder.id,
      updates: updates,
      tracking_number: lead.tracking_number || null,
      status: lead.shipping_status,
      email_matched: lead.email
    };
  }

  console.log(`ℹ️ No updates needed for ${lead.reference} → ${shopifyOrder.order_number}`);
  return null;
}

// Enhanced order finding with better error handling
async function findShopifyOrderEnhanced(lead, shopifyStore, shopifyAccessToken) {
  if (!lead.email || !lead.email.trim()) {
    console.log(`❌ No email provided for ${lead.reference}`);
    return null;
  }

  try {
    console.log(`🔍 Searching Shopify for email: ${lead.email}`);
    
    const emailSearch = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json?email=${encodeURIComponent(lead.email)}&status=any&limit=50`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!emailSearch.ok) {
      console.error(`❌ Shopify API error for ${lead.email}: ${emailSearch.status}`);
      return null;
    }

    const emailResults = await emailSearch.json();
    
    if (emailResults.orders && emailResults.orders.length > 0) {
      console.log(`✅ Found ${emailResults.orders.length} orders for email ${lead.email}`);
      
      // Find the best match (most recent order within reasonable time frame)
      const leadDate = new Date(lead.created_at);
      const bestMatch = emailResults.orders.find(order => {
        const orderDate = new Date(order.created_at);
        const hoursDiff = Math.abs((orderDate - leadDate) / (1000 * 60 * 60));
        return hoursDiff <= 48; // Within 48 hours
      });
      
      if (bestMatch) {
        console.log(`✅ Best match: Order ${bestMatch.order_number} (created ${bestMatch.created_at})`);
        return bestMatch;
      } else {
        console.log(`⚠️ Orders found but none within 48h of PrimeCOD creation date`);
        return emailResults.orders[0]; // Return most recent as fallback
      }
    } else {
      console.log(`❌ No orders found for email ${lead.email}`);
    }
  } catch (error) {
    console.error(`❌ Error searching for order with email ${lead.email}:`, error.message);
  }
  
  return null;
}

// Copy all the existing helper functions here (fulfillOrderWithTracking, markOrderAsPaid, etc.)
// [Include all the working functions from sync-orders.js]

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
    
    // Step 2: Create fulfillment
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

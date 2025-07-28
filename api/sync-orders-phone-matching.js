// api/sync-orders-phone-matching.js - Alternative sync using phone numbers
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🚀 Starting Phone Number Matching Sync...');
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
      phone_matches: 0,
      email_matches: 0,
      no_matches: 0,
      debug_info: {
        phone_numbers_found: 0,
        phone_numbers_missing: 0,
        emails_found: 0,
        emails_missing: 0
      }
    };

    // Process first 5 pages for recent orders
    for (let page = 1; page <= 5; page++) {
      console.log(`📄 Processing page ${page}/5...`);
      
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
      
      if (leads.length === 0) break;
      
      syncResults.total_leads_processed += leads.length;
      syncResults.pages_processed = page;
      console.log(`📦 Processing ${leads.length} leads from page ${page}`);

      // Process each lead with phone number matching
      for (const lead of leads) {
        try {
          console.log(`🔍 Processing lead ${lead.reference} (${lead.shipping_status})`);
          
          // Track phone and email availability
          if (lead.phone && lead.phone.trim()) {
            syncResults.debug_info.phone_numbers_found++;
          } else {
            syncResults.debug_info.phone_numbers_missing++;
          }
          
          if (lead.email && lead.email.trim()) {
            syncResults.debug_info.emails_found++;
          } else {
            syncResults.debug_info.emails_missing++;
          }

          const updateResult = await processLeadWithPhoneMatching(lead, SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
          
          if (updateResult) {
            syncResults.orders_updated++;
            syncResults.successful_updates.push(updateResult);
            
            // Track matching method
            if (updateResult.match_method === 'phone') {
              syncResults.phone_matches++;
            } else if (updateResult.match_method === 'email') {
              syncResults.email_matches++;
            }
            
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
            
            console.log(`✅ Updated ${lead.reference} → Shopify order ${updateResult.shopify_order} (${updateResult.match_method} match)`);
          } else {
            syncResults.no_matches++;
            console.log(`❌ No Shopify match found for ${lead.reference}`);
          }
        } catch (error) {
          const errorInfo = {
            primecod_reference: lead.reference,
            error: error.message,
            status: lead.shipping_status,
            email: lead.email || 'NO_EMAIL',
            phone: lead.phone || 'NO_PHONE'
          };
          syncResults.errors.push(errorInfo);
          console.error(`❌ Error processing lead ${lead.reference}:`, error.message);
        }
      }
    }

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`✅ PHONE MATCHING SYNC COMPLETE in ${duration}s`);
    console.log(`📊 Results: ${syncResults.orders_updated} orders updated, ${syncResults.errors.length} errors`);
    console.log(`📞 Phone matches: ${syncResults.phone_matches}, Email matches: ${syncResults.email_matches}`);

    res.status(200).json({
      success: true,
      message: `Phone matching sync completed in ${duration}s`,
      summary: {
        duration_seconds: parseFloat(duration),
        total_leads_processed: syncResults.total_leads_processed,
        orders_updated: syncResults.orders_updated,
        phone_matches: syncResults.phone_matches,
        email_matches: syncResults.email_matches,
        no_matches: syncResults.no_matches,
        fulfilled_orders: syncResults.fulfilled_orders,
        paid_orders: syncResults.paid_orders,
        refunded_orders: syncResults.refunded_orders,
        processing_orders: syncResults.processing_orders,
        error_count: syncResults.errors.length,
        match_rate_percentage: Math.round((syncResults.orders_updated / syncResults.total_leads_processed) * 100)
      },
      debug_info: syncResults.debug_info,
      detailed_updates: syncResults.successful_updates,
      errors: syncResults.errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Phone matching sync failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

async function processLeadWithPhoneMatching(lead, shopifyStore, shopifyAccessToken) {
  // Try to find Shopify order using multiple matching methods
  console.log(`🔍 Searching for Shopify order matching ${lead.reference}`);
  
  let shopifyOrder = null;
  let matchMethod = null;

  // Method 1: Try email matching first (if available)
  if (lead.email && lead.email.trim()) {
    shopifyOrder = await findShopifyOrderByEmail(lead.email, shopifyStore, shopifyAccessToken);
    if (shopifyOrder) {
      matchMethod = 'email';
      console.log(`✅ Email match found: ${lead.email} → Order ${shopifyOrder.order_number}`);
    }
  }

  // Method 2: Try phone number matching (if email failed)
  if (!shopifyOrder && lead.phone && lead.phone.trim()) {
    shopifyOrder = await findShopifyOrderByPhone(lead.phone, shopifyStore, shopifyAccessToken);
    if (shopifyOrder) {
      matchMethod = 'phone';
      console.log(`✅ Phone match found: ${lead.phone} → Order ${shopifyOrder.order_number}`);
    }
  }

  // Method 3: Try partial email matching (domain variations)
  if (!shopifyOrder && lead.email && lead.email.includes('@')) {
    const emailParts = lead.email.split('@');
    const username = emailParts[0];
    shopifyOrder = await findShopifyOrderByPartialEmail(username, shopifyStore, shopifyAccessToken);
    if (shopifyOrder) {
      matchMethod = 'partial_email';
      console.log(`✅ Partial email match found: ${username} → Order ${shopifyOrder.order_number}`);
    }
  }

  if (!shopifyOrder) {
    console.log(`❌ No Shopify order found for PrimeCOD ${lead.reference}`);
    return null;
  }

  // Process the order using existing logic
  const updates = [];
  console.log(`🔄 Processing PrimeCOD ${lead.reference} → Shopify order ${shopifyOrder.order_number}`);

  // Handle delivered orders
  if (lead.shipping_status === 'delivered' && lead.tracking_number) {
    if (shopifyOrder.fulfillment_status !== 'fulfilled') {
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
          `PrimeCOD: Package delivered with tracking ${lead.tracking_number} (matched by ${matchMethod})`, 
          shopifyStore, 
          shopifyAccessToken
        );
        await updateOrderTags(shopifyOrder.id, ['primecod-delivered', 'cod-fulfilled'], shopifyStore, shopifyAccessToken);
      }
    }

    if (shopifyOrder.financial_status === 'pending') {
      const paidSuccess = await markOrderAsPaid(shopifyOrder.id, shopifyStore, shopifyAccessToken);
      if (paidSuccess) {
        console.log(`💰 Marked delivered order ${shopifyOrder.order_number} as paid (COD collected)`);
        updates.push('cod-payment-recorded');
      }
    }
  }

  // Handle returned orders
  if (lead.shipping_status === 'returned') {
    console.log(`❌ Processing returned order: ${lead.reference}`);
    
    if (shopifyOrder.financial_status === 'pending') {
      const paidSuccess = await markOrderAsPaid(shopifyOrder.id, shopifyStore, shopifyAccessToken);
      if (paidSuccess) {
        updates.push('marked-as-paid');
      }
    }
    
    const refundSuccess = await createFullRefund(shopifyOrder.id, shopifyStore, shopifyAccessToken);
    if (refundSuccess) {
      updates.push('refunded');
    }

    await addOrderNote(shopifyOrder.id, `PrimeCOD: Order returned - Paid and refunded (matched by ${matchMethod})`, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-returned'], shopifyStore, shopifyAccessToken);
  }

  // Handle processing orders
  if (lead.shipping_status === 'order placed' || lead.shipping_status === 'shipped') {
    const statusNote = lead.shipping_status === 'shipped' 
      ? `PrimeCOD: Order shipped (matched by ${matchMethod})`
      : `PrimeCOD: Order placed with supplier (matched by ${matchMethod})`;
    
    await addOrderNote(shopifyOrder.id, statusNote, shopifyStore, shopifyAccessToken);
    await updateOrderTags(shopifyOrder.id, ['primecod-processing'], shopifyStore, shopifyAccessToken);
    updates.push('status-updated');
  }

  if (updates.length > 0) {
    return {
      primecod_reference: lead.reference,
      shopify_order: shopifyOrder.order_number,
      shopify_order_id: shopifyOrder.id,
      updates: updates,
      tracking_number: lead.tracking_number || null,
      status: lead.shipping_status,
      match_method: matchMethod,
      match_details: {
        primecod_email: lead.email,
        primecod_phone: lead.phone,
        shopify_email: shopifyOrder.email,
        shopify_phone: shopifyOrder.phone
      }
    };
  }

  return null;
}

async function findShopifyOrderByEmail(email, shopifyStore, shopifyAccessToken) {
  try {
    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json?email=${encodeURIComponent(email)}&status=any&limit=10`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.orders && data.orders.length > 0 ? data.orders[0] : null;
    }
  } catch (error) {
    console.error(`❌ Error searching by email ${email}:`, error.message);
  }
  return null;
}

async function findShopifyOrderByPhone(phone, shopifyStore, shopifyAccessToken) {
  try {
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Search by phone in customer data
    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/customers/search.json?query=phone:${encodeURIComponent(normalizedPhone)}`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.customers && data.customers.length > 0) {
        const customer = data.customers[0];
        
        // Get orders for this customer
        const ordersResponse = await fetch(
          `https://${shopifyStore}.myshopify.com/admin/api/2024-01/customers/${customer.id}/orders.json?status=any&limit=10`,
          {
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken,
              'Content-Type': 'application/json'
            }
          }
        );

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          return ordersData.orders && ordersData.orders.length > 0 ? ordersData.orders[0] : null;
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error searching by phone ${phone}:`, error.message);
  }
  return null;
}

async function findShopifyOrderByPartialEmail(username, shopifyStore, shopifyAccessToken) {
  try {
    // Search for customers with similar usernames
    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/customers/search.json?query=email:*${encodeURIComponent(username)}*`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.customers && data.customers.length > 0) {
        const customer = data.customers[0];
        
        // Get orders for this customer
        const ordersResponse = await fetch(
          `https://${shopifyStore}.myshopify.com/admin/api/2024-01/customers/${customer.id}/orders.json?status=any&limit=10`,
          {
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken,
              'Content-Type': 'application/json'
            }
          }
        );

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          return ordersData.orders && ordersData.orders.length > 0 ? ordersData.orders[0] : null;
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error searching by partial email ${username}:`, error.message);
  }
  return null;
}

// Include all the existing helper functions (fulfillOrderWithTracking, markOrderAsPaid, etc.)
// [Copy from previous sync-orders.js]

async function fulfillOrderWithTracking(orderId, trackingNumber, shopifyStore, shopifyAccessToken) {
  try {
    console.log(`🚚 Fulfilling order ${orderId} with tracking: ${trackingNumber}`);

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
        notifyCustomer: false,
        trackingInfo: {
          number: trackingNumber.toString(),
          company: "PrimeCOD"
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
        notify: false,
        refundLineItems: order.lineItems.edges.map(edge => ({
          lineItemId: edge.node.id,
          quantity: edge.node.refundableQuantity,
          restockType: "NO_RESTOCK"
        })),
        shipping: order.shippingLine ? { fullRefund: true } : undefined,
        transactions: []
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

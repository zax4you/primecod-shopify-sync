// api/sync-orders-enhanced-matching.js - Multi-method order matching for higher success rate
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🚀 Starting ENHANCED Multi-Method Matching Sync...');
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
      matching_stats: {
        email_matches: 0,
        phone_matches: 0,
        partial_email_matches: 0,
        no_matches: 0,
        total_attempts: 0
      },
      debug_info: {
        emails_found: 0,
        phones_found: 0,
        shopify_orders_cache: null
      }
    };

    // Pre-load recent Shopify orders for faster matching
    console.log('📦 Pre-loading recent Shopify orders...');
    const shopifyOrdersCache = await preloadShopifyOrders(SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN);
    syncResults.debug_info.shopify_orders_cache = {
      total_orders: shopifyOrdersCache.length,
      date_range: shopifyOrdersCache.length > 0 ? 
        `${shopifyOrdersCache[shopifyOrdersCache.length - 1].created_at.split('T')[0]} to ${shopifyOrdersCache[0].created_at.split('T')[0]}` : 
        'No orders'
    };

    // Process first 3 pages of PrimeCOD leads
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
      
      if (leads.length === 0) break;
      
      syncResults.total_leads_processed += leads.length;
      syncResults.pages_processed = page;
      console.log(`📦 Processing ${leads.length} leads from page ${page}`);

      // Process each lead with enhanced matching
      for (const lead of leads) {
        try {
          console.log(`🔍 Processing lead ${lead.reference} (${lead.shipping_status})`);
          
          // Track data availability
          if (lead.email && lead.email.trim()) {
            syncResults.debug_info.emails_found++;
          }
          if (lead.phone && lead.phone.trim()) {
            syncResults.debug_info.phones_found++;
          }

          syncResults.matching_stats.total_attempts++;
          const updateResult = await processLeadWithEnhancedMatching(
            lead, 
            shopifyOrdersCache, 
            SHOPIFY_STORE, 
            SHOPIFY_ACCESS_TOKEN
          );
          
          if (updateResult) {
            syncResults.orders_updated++;
            syncResults.successful_updates.push(updateResult);
            
            // Track matching method
            if (updateResult.match_method === 'email') {
              syncResults.matching_stats.email_matches++;
            } else if (updateResult.match_method === 'phone') {
              syncResults.matching_stats.phone_matches++;
            } else if (updateResult.match_method === 'partial_email') {
              syncResults.matching_stats.partial_email_matches++;
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
            syncResults.matching_stats.no_matches++;
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

    // Calculate enhanced statistics
    const matchRate = Math.round((syncResults.orders_updated / syncResults.matching_stats.total_attempts) * 100);
    const improvementFromEmail = syncResults.matching_stats.phone_matches + syncResults.matching_stats.partial_email_matches;

    console.log(`✅ ENHANCED MATCHING SYNC COMPLETE in ${duration}s`);
    console.log(`📊 Results: ${syncResults.orders_updated} orders updated, ${syncResults.errors.length} errors`);
    console.log(`🎯 Match Rate: ${matchRate}% (Email: ${syncResults.matching_stats.email_matches}, Phone: ${syncResults.matching_stats.phone_matches}, Partial: ${syncResults.matching_stats.partial_email_matches})`);
    console.log(`📈 Improvement: +${improvementFromEmail} orders via fallback methods`);

    res.status(200).json({
      success: true,
      message: `Enhanced matching sync completed in ${duration}s`,
      summary: {
        duration_seconds: parseFloat(duration),
        total_leads_processed: syncResults.total_leads_processed,
        orders_updated: syncResults.orders_updated,
        fulfilled_orders: syncResults.fulfilled_orders,
        paid_orders: syncResults.paid_orders,
        refunded_orders: syncResults.refunded_orders,
        processing_orders: syncResults.processing_orders,
        error_count: syncResults.errors.length,
        match_rate_percentage: matchRate,
        improvement_from_fallbacks: improvementFromEmail
      },
      matching_breakdown: syncResults.matching_stats,
      debug_info: syncResults.debug_info,
      detailed_updates: syncResults.successful_updates,
      errors: syncResults.errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Enhanced matching sync failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

async function preloadShopifyOrders(shopifyStore, shopifyAccessToken) {
  console.log('📦 Loading recent Shopify orders for matching...');
  
  try {
    // Get last 60 days of orders
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateFilter = sixtyDaysAgo.toISOString();

    const response = await fetch(
      `https://${shopifyStore}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${dateFilter}`,
      {
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`📦 Loaded ${data.orders.length} recent Shopify orders for matching`);
      return data.orders || [];
    } else {
      console.error('❌ Failed to load Shopify orders for caching');
      return [];
    }
  } catch (error) {
    console.error('❌ Error loading Shopify orders:', error.message);
    return [];
  }
}

async function processLeadWithEnhancedMatching(lead, shopifyOrdersCache, shopifyStore, shopifyAccessToken) {
  console.log(`🔍 Enhanced matching for ${lead.reference}`);
  
  let shopifyOrder = null;
  let matchMethod = null;

  // Method 1: Direct email matching
  if (lead.email && lead.email.trim()) {
    shopifyOrder = findOrderByEmail(lead.email, shopifyOrdersCache);
    if (shopifyOrder) {
      matchMethod = 'email';
      console.log(`✅ Email match: ${lead.email} → Order ${shopifyOrder.order_number}`);
    }
  }

  // Method 2: Phone number matching (NEW!)
  if (!shopifyOrder && lead.phone && lead.phone.trim()) {
    shopifyOrder = findOrderByPhone(lead.phone, shopifyOrdersCache);
    if (shopifyOrder) {
      matchMethod = 'phone';
      console.log(`✅ Phone match: ${lead.phone} → Order ${shopifyOrder.order_number}`);
    }
  }

  // Method 3: Partial email matching (username only)
  if (!shopifyOrder && lead.email && lead.email.includes('@')) {
    const username = lead.email.split('@')[0].toLowerCase();
    shopifyOrder = findOrderByPartialEmail(username, shopifyOrdersCache);
    if (shopifyOrder) {
      matchMethod = 'partial_email';
      console.log(`✅ Partial email match: ${username} → Order ${shopifyOrder.order_number}`);
    }
  }

  // Method 4: Fuzzy email matching (domain variations)
  if (!shopifyOrder && lead.email) {
    shopifyOrder = findOrderByFuzzyEmail(lead.email, shopifyOrdersCache);
    if (shopifyOrder) {
      matchMethod = 'fuzzy_email';
      console.log(`✅ Fuzzy email match: ${lead.email} → Order ${shopifyOrder.order_number}`);
    }
  }

  if (!shopifyOrder) {
    console.log(`❌ No match found for ${lead.reference} (tried email, phone, partial, fuzzy)`);
    return null;
  }

  // Process the matched order using existing logic
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
        updates.push('cod-payment-recorded');
      }
    }
  }

  // Handle returned orders
  if (lead.shipping_status === 'returned') {
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
        shopify_phone: shopifyOrder.phone || shopifyOrder.billing_address?.phone
      }
    };
  }

  return null;
}

function findOrderByEmail(email, orders) {
  const normalizedEmail = email.toLowerCase().trim();
  return orders.find(order => 
    order.email && order.email.toLowerCase().trim() === normalizedEmail
  );
}

function findOrderByPhone(phone, orders) {
  const normalizedPhone = normalizePhoneNumber(phone);
  
  return orders.find(order => {
    // Check main phone field
    if (order.phone && normalizePhoneNumber(order.phone) === normalizedPhone) {
      return true;
    }
    
    // Check billing address phone
    if (order.billing_address?.phone && normalizePhoneNumber(order.billing_address.phone) === normalizedPhone) {
      return true;
    }
    
    // Check shipping address phone
    if (order.shipping_address?.phone && normalizePhoneNumber(order.shipping_address.phone) === normalizedPhone) {
      return true;
    }
    
    return false;
  });
}

function findOrderByPartialEmail(username, orders) {
  const normalizedUsername = username.toLowerCase().trim();
  
  return orders.find(order => {
    if (!order.email) return false;
    const orderUsername = order.email.split('@')[0].toLowerCase().trim();
    return orderUsername === normalizedUsername;
  });
}

function findOrderByFuzzyEmail(email, orders) {
  const emailParts = email.toLowerCase().split('@');
  if (emailParts.length !== 2) return null;
  
  const [username, domain] = emailParts;
  
  // Common domain variations
  const domainVariations = [
    domain,
    domain.replace('.pl', '.com'),
    domain.replace('.com', '.pl'),
    domain.replace('gmail.com', 'gmail.pl'),
    domain.replace('gmail.pl', 'gmail.com'),
    domain.replace('wp.pl', 'o2.pl'),
    domain.replace('o2.pl', 'wp.pl')
  ];
  
  for (const variation of domainVariations) {
    const testEmail = `${username}@${variation}`;
    const match = findOrderByEmail(testEmail, orders);
    if (match) return match;
  }
  
  return null;
}

function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Handle Polish numbers
  if (normalized.startsWith('+48')) {
    normalized = normalized.substring(3); // Remove +48
  } else if (normalized.startsWith('48') && normalized.length === 11) {
    normalized = normalized.substring(2); // Remove 48
  } else if (normalized.startsWith('0') && normalized.length === 10) {
    normalized = normalized.substring(1); // Remove leading 0
  }
  
  return normalized;
}

// Include all the existing helper functions (fulfillOrderWithTracking, markOrderAsPaid, etc.)
// [Copy from the working sync-orders.js]

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

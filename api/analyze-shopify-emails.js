// api/analyze-shopify-emails.js - Check what emails exist in recent Shopify orders
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🔍 Analyzing recent Shopify orders and emails...');
    const startTime = new Date();

    const analysis = {
      total_orders: 0,
      orders_with_email: 0,
      orders_without_email: 0,
      unique_emails: new Set(),
      email_domains: {},
      recent_orders: [],
      date_range: '',
      sample_emails: []
    };

    // Get recent orders (last 30 days to be thorough)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFilter = thirtyDaysAgo.toISOString();

    console.log(`📅 Fetching Shopify orders created after: ${dateFilter}`);

    // Fetch recent orders
    let page = 1;
    let hasMore = true;
    
    while (hasMore && page <= 10) { // Max 10 pages = 2500 orders
      console.log(`📄 Fetching Shopify orders page ${page}...`);
      
      const ordersResponse = await fetch(
        `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${dateFilter}&page=${page}`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!ordersResponse.ok) {
        throw new Error(`Shopify API error: ${ordersResponse.status}`);
      }

      const ordersData = await ordersResponse.json();
      const orders = ordersData.orders || [];
      
      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      analysis.total_orders += orders.length;
      console.log(`📦 Processing ${orders.length} orders from page ${page}`);

      // Analyze each order
      for (const order of orders) {
        const orderDate = new Date(order.created_at);
        
        if (order.email && order.email.trim()) {
          analysis.orders_with_email++;
          const email = order.email.toLowerCase().trim();
          analysis.unique_emails.add(email);
          
          // Extract domain
          const domain = email.split('@')[1];
          if (domain) {
            analysis.email_domains[domain] = (analysis.email_domains[domain] || 0) + 1;
          }
          
          // Collect sample of recent orders
          if (analysis.recent_orders.length < 20) {
            analysis.recent_orders.push({
              order_number: order.order_number,
              created_at: order.created_at,
              email: email,
              financial_status: order.financial_status,
              fulfillment_status: order.fulfillment_status || 'unfulfilled',
              total_price: order.total_price,
              customer_name: `${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''}`.trim()
            });
          }
          
          // Collect sample emails
          if (analysis.sample_emails.length < 50) {
            analysis.sample_emails.push(email);
          }
        } else {
          analysis.orders_without_email++;
        }
      }
      
      page++;
    }

    // Convert Set to Array for JSON serialization
    const uniqueEmailsArray = Array.from(analysis.unique_emails);
    
    // Find date range
    if (analysis.recent_orders.length > 0) {
      const dates = analysis.recent_orders.map(o => new Date(o.created_at));
      const earliest = new Date(Math.min(...dates));
      const latest = new Date(Math.max(...dates));
      analysis.date_range = `${earliest.toISOString().split('T')[0]} to ${latest.toISOString().split('T')[0]}`;
    }

    // Sort domains by frequency
    const sortedDomains = Object.entries(analysis.email_domains)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    const duration = ((new Date() - startTime) / 1000).toFixed(2);

    console.log(`✅ Shopify email analysis complete in ${duration}s`);
    console.log(`📊 Found ${analysis.total_orders} orders, ${analysis.orders_with_email} with emails`);
    console.log(`📧 ${uniqueEmailsArray.length} unique emails found`);

    // Now check for matches with your PrimeCOD sample emails
    const primecodSampleEmails = [
      'marzannamikoda@gmail.com',
      'warzecharenata0@gmail.pl',
      'marigol40@wp.pl',
      'janinajaworska@o2.pl',
      'marokko21@wp.pl',
      'pomozinnym@poczta.onet.pl',
      'aleksandra5.10.55@gmail.com',
      'rozitacichocka@gmail.com',
      'gtpiskozub@gmail.com',
      'dorisw2@op.pl'
    ];

    const emailMatches = [];
    const emailMisses = [];
    
    for (const primecodEmail of primecodSampleEmails) {
      const normalizedEmail = primecodEmail.toLowerCase().trim();
      if (uniqueEmailsArray.includes(normalizedEmail)) {
        emailMatches.push(primecodEmail);
      } else {
        emailMisses.push(primecodEmail);
      }
    }

    res.status(200).json({
      success: true,
      message: `Shopify email analysis completed in ${duration}s`,
      shopify_analysis: {
        total_orders: analysis.total_orders,
        orders_with_email: analysis.orders_with_email,
        orders_without_email: analysis.orders_without_email,
        unique_emails_count: uniqueEmailsArray.length,
        date_range: analysis.date_range,
        email_percentage: Math.round((analysis.orders_with_email / analysis.total_orders) * 100)
      },
      top_email_domains: sortedDomains,
      sample_shopify_orders: analysis.recent_orders,
      sample_shopify_emails: analysis.sample_emails.slice(0, 20),
      primecod_email_matching: {
        tested_primecod_emails: primecodSampleEmails.length,
        matches_found: emailMatches.length,
        matches: emailMatches,
        misses: emailMisses,
        match_percentage: Math.round((emailMatches.length / primecodSampleEmails.length) * 100)
      },
      recommendations: generateEmailRecommendations(emailMatches.length, primecodSampleEmails.length, analysis)
    });

  } catch (error) {
    console.error('💥 Shopify email analysis failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

function generateEmailRecommendations(matchCount, totalCount, analysis) {
  const recommendations = [];
  
  if (matchCount === 0) {
    recommendations.push("🚨 CRITICAL: Zero email matches found between PrimeCOD and Shopify");
    recommendations.push("📧 Check if customers are using different emails when placing orders");
    recommendations.push("🔍 Investigate if email collection happens at different stages");
    recommendations.push("💡 Consider phone number matching as alternative");
  } else if (matchCount < totalCount * 0.5) {
    recommendations.push("⚠️ Low email match rate - investigate email collection process");
    recommendations.push("📝 Check if customers change emails between systems");
  } else {
    recommendations.push("✅ Good email match rate - sync should work");
  }
  
  if (analysis.orders_without_email > analysis.orders_with_email * 0.1) {
    recommendations.push("📧 Consider making email mandatory in checkout");
  }
  
  if (analysis.unique_emails_count < analysis.orders_with_email * 0.8) {
    recommendations.push("👥 Many repeat customers detected");
  }
  
  return recommendations;
}

// api/validate-token-detailed.js - Detailed token validation and diagnosis
export default async function handler(req, res) {
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  try {
    console.log('🔍 Performing detailed token validation...');
    
    const validation = {
      environment_check: {
        store_exists: !!SHOPIFY_STORE,
        token_exists: !!SHOPIFY_ACCESS_TOKEN,
        store_value: SHOPIFY_STORE,
        token_format: SHOPIFY_ACCESS_TOKEN ? analyzeTokenFormat(SHOPIFY_ACCESS_TOKEN) : null
      },
      connection_tests: {},
      token_analysis: {},
      recommendations: []
    };

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'Missing environment variables',
        validation
      });
    }

    // Test 1: Basic connectivity (without auth)
    console.log('🌐 Testing basic connectivity...');
    try {
      const connectivityResponse = await fetch(`https://${SHOPIFY_STORE}.myshopify.com`, {
        method: 'HEAD',
        timeout: 10000
      });
      
      validation.connection_tests.basic_connectivity = {
        success: connectivityResponse.ok,
        status: connectivityResponse.status,
        store_reachable: connectivityResponse.ok
      };
    } catch (error) {
      validation.connection_tests.basic_connectivity = {
        success: false,
        error: error.message,
        store_reachable: false
      };
    }

    // Test 2: Token format validation
    validation.token_analysis = validateTokenFormat(SHOPIFY_ACCESS_TOKEN);

    // Test 3: Multiple API endpoint tests with detailed error analysis
    const apiTests = [
      {
        name: 'shop_info',
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/shop.json`,
        method: 'GET'
      },
      {
        name: 'orders_minimal',
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?limit=1`,
        method: 'GET'
      },
      {
        name: 'webhooks_check',
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/webhooks.json`,
        method: 'GET'
      },
      {
        name: 'applications_check',
        url: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/applications.json`,
        method: 'GET'
      }
    ];

    for (const test of apiTests) {
      console.log(`🧪 Testing ${test.name}...`);
      try {
        const response = await fetch(test.url, {
          method: test.method,
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
            'User-Agent': 'PrimeCOD-Integration/1.0'
          }
        });

        const responseText = await response.text();
        let responseData = null;
        
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          responseData = { raw_response: responseText };
        }

        validation.connection_tests[test.name] = {
          success: response.ok,
          status: response.status,
          url: test.url,
          response_preview: response.ok ? 
            (responseData && typeof responseData === 'object' ? Object.keys(responseData).slice(0, 3) : 'Non-JSON') :
            responseText.substring(0, 200),
          headers: {
            'x-shopify-shop-domain': response.headers.get('x-shopify-shop-domain'),
            'x-shopify-request-id': response.headers.get('x-shopify-request-id'),
            'content-type': response.headers.get('content-type')
          }
        };

        // Additional analysis for successful shop info
        if (test.name === 'shop_info' && response.ok && responseData?.shop) {
          validation.connection_tests[test.name].shop_details = {
            name: responseData.shop.name,
            domain: responseData.shop.domain,
            plan_name: responseData.shop.plan_name,
            country: responseData.shop.country,
            currency: responseData.shop.currency
          };
        }

      } catch (error) {
        validation.connection_tests[test.name] = {
          success: false,
          error: error.message,
          url: test.url
        };
      }
    }

    // Test 4: GraphQL introspection (checks token permissions)
    console.log('🔍 Testing GraphQL introspection...');
    try {
      const introspectionQuery = `
        query {
          __schema {
            queryType {
              name
            }
          }
        }
      `;

      const graphqlResponse = await fetch(`https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: introspectionQuery })
      });

      const graphqlData = await graphqlResponse.json();
      
      validation.connection_tests.graphql_introspection = {
        success: graphqlResponse.ok && !graphqlData.errors,
        status: graphqlResponse.status,
        has_errors: !!graphqlData.errors,
        errors: graphqlData.errors || null,
        schema_accessible: !!(graphqlData.data?.__schema)
      };

    } catch (error) {
      validation.connection_tests.graphql_introspection = {
        success: false,
        error: error.message
      };
    }

    // Generate detailed diagnosis
    const diagnosis = generateDetailedDiagnosis(validation);
    const actionPlan = generateActionPlan(validation);

    res.status(200).json({
      success: Object.values(validation.connection_tests).some(test => test.success),
      message: 'Detailed token validation completed',
      validation_results: validation,
      diagnosis: diagnosis,
      action_plan: actionPlan,
      next_steps: generateNextSteps(validation)
    });

  } catch (error) {
    console.error('💥 Token validation failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

function analyzeTokenFormat(token) {
  return {
    length: token.length,
    prefix: token.substring(0, 6),
    format: token.startsWith('shpat_') ? 'Admin API Token' : 
            token.startsWith('shppa_') ? 'Partner API Token' : 
            token.startsWith('shpss_') ? 'Storefront API Token' : 'Unknown Format',
    expected_length: token.startsWith('shpat_') ? 38 : 'Variable',
    is_valid_format: token.startsWith('shpat_') && token.length === 38
  };
}

function validateTokenFormat(token) {
  const analysis = {
    format_valid: false,
    type: 'unknown',
    issues: []
  };

  if (!token) {
    analysis.issues.push('Token is empty');
    return analysis;
  }

  if (token.startsWith('shpat_')) {
    analysis.type = 'Admin API Token';
    if (token.length === 38) {
      analysis.format_valid = true;
    } else {
      analysis.issues.push(`Invalid length: ${token.length}, expected 38`);
    }
  } else if (token.startsWith('shppa_')) {
    analysis.type = 'Partner API Token';
    analysis.issues.push('Partner token used instead of Admin API token');
  } else if (token.startsWith('shpss_')) {
    analysis.type = 'Storefront API Token';
    analysis.issues.push('Storefront token used instead of Admin API token');
  } else {
    analysis.issues.push('Token does not start with expected prefix (shpat_)');
  }

  return analysis;
}

function generateDetailedDiagnosis(validation) {
  const diagnosis = [];

  // Token format issues
  if (!validation.token_analysis.format_valid) {
    diagnosis.push(`🚨 TOKEN FORMAT: ${validation.token_analysis.issues.join(', ')}`);
  } else {
    diagnosis.push('✅ TOKEN FORMAT: Valid Admin API token format');
  }

  // Connectivity issues
  if (!validation.connection_tests.basic_connectivity?.success) {
    diagnosis.push('🚨 CONNECTIVITY: Cannot reach Shopify store');
  } else {
    diagnosis.push('✅ CONNECTIVITY: Store is reachable');
  }

  // API access analysis
  const apiTests = ['shop_info', 'orders_minimal', 'webhooks_check'];
  const successfulTests = apiTests.filter(test => validation.connection_tests[test]?.success).length;
  
  if (successfulTests === 0) {
    diagnosis.push('🚨 API ACCESS: Complete authentication failure - token likely revoked');
  } else if (successfulTests < apiTests.length) {
    diagnosis.push(`⚠️ API ACCESS: Partial access (${successfulTests}/${apiTests.length} endpoints working)`);
  } else {
    diagnosis.push('✅ API ACCESS: All endpoints accessible');
  }

  // Specific error analysis
  const shopInfoTest = validation.connection_tests.shop_info;
  if (shopInfoTest && !shopInfoTest.success) {
    if (shopInfoTest.status === 401) {
      diagnosis.push('🚨 AUTHENTICATION: Token is invalid, expired, or app was removed');
    } else if (shopInfoTest.status === 403) {
      diagnosis.push('🚨 PERMISSIONS: Token lacks required scopes');
    } else if (shopInfoTest.status === 429) {
      diagnosis.push('⚠️ RATE LIMIT: Too many requests - temporary issue');
    }
  }

  return diagnosis;
}

function generateActionPlan(validation) {
  const actions = [];

  if (!validation.token_analysis.format_valid) {
    actions.push({
      priority: 'CRITICAL',
      action: 'Fix token format',
      description: 'Current token has format issues',
      steps: validation.token_analysis.issues
    });
  }

  const shopInfoTest = validation.connection_tests.shop_info;
  if (shopInfoTest && shopInfoTest.status === 401) {
    actions.push({
      priority: 'CRITICAL',
      action: 'Regenerate access token',
      description: 'Current token is invalid or expired',
      steps: [
        'Go to Shopify Admin → Settings → Apps and sales channels → Develop apps',
        'Find "PrimeCOD Order Automation" app',
        'Go to API credentials tab',
        'Regenerate Admin API access token',
        'Copy new token and update Vercel environment variables'
      ]
    });
  }

  if (validation.connection_tests.graphql_introspection && !validation.connection_tests.graphql_introspection.success) {
    actions.push({
      priority: 'HIGH',
      action: 'Check GraphQL access',
      description: 'GraphQL API access required for fulfillments',
      steps: [
        'Verify app has proper GraphQL permissions',
        'Check if fulfillment scopes are enabled'
      ]
    });
  }

  return actions;
}

function generateNextSteps(validation) {
  const steps = [];

  if (validation.connection_tests.shop_info?.success) {
    steps.push('✅ Token is working - investigate specific endpoint issues');
    steps.push('Run sync with working token to identify other issues');
  } else {
    steps.push('1. Regenerate access token in Shopify admin');
    steps.push('2. Update SHOPIFY_ACCESS_TOKEN in Vercel');
    steps.push('3. Test with /api/test-shopify-auth');
    steps.push('4. Run full sync once token is working');
  }

  return steps;
}

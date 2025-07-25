// api/test-primecod-tracking.js - Test tracking codes from PrimeCOD
export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;

  try {
    console.log('🔍 Testing PrimeCOD tracking data...');

    const trackingResults = {
      summary: {
        total_leads: 0,
        shipped_with_tracking: 0,
        delivered_with_tracking: 0,
        shipped_no_tracking: 0,
        delivered_no_tracking: 0
      },
      tracking_samples: [],
      carrier_analysis: {},
      status_breakdown: {},
      pages_checked: 3
    };

    // Check first 3 pages for tracking data variety
    for (let page = 1; page <= 3; page++) {
      console.log(`📄 Checking page ${page}/3 for tracking data...`);
      
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
      
      trackingResults.summary.total_leads += leads.length;
      console.log(`📦 Processing ${leads.length} leads from page ${page}`);

      // Analyze each lead
      leads.forEach((lead, index) => {
        // Count status breakdown
        const status = lead.shipping_status || 'unknown';
        trackingResults.status_breakdown[status] = (trackingResults.status_breakdown[status] || 0) + 1;

        // Check tracking for shipped/delivered orders
        if (status === 'shipped' || status === 'delivered') {
          const hasTracking = !!(lead.tracking_number && lead.tracking_number.trim());
          const carrier = lead.carrier || lead.tracking_company || 'Unknown';
          
          if (hasTracking) {
            if (status === 'shipped') {
              trackingResults.summary.shipped_with_tracking++;
            } else {
              trackingResults.summary.delivered_with_tracking++;
            }

            // Count carriers
            trackingResults.carrier_analysis[carrier] = (trackingResults.carrier_analysis[carrier] || 0) + 1;

            // Collect samples (max 10 per page)
            if (trackingResults.tracking_samples.length < 30) {
              trackingResults.tracking_samples.push({
                page: page,
                index: index,
                reference: lead.reference,
                status: status,
                tracking_number: lead.tracking_number,
                carrier: carrier,
                email: lead.email,
                created_at: lead.created_at,
                delivered_at: lead.delivered_at || null,
                // Check all possible tracking-related fields
                raw_tracking_fields: {
                  tracking_number: lead.tracking_number,
                  carrier: lead.carrier,
                  tracking_company: lead.tracking_company,
                  tracking_url: lead.tracking_url,
                  courier: lead.courier,
                  shipping_company: lead.shipping_company
                }
              });
            }
          } else {
            if (status === 'shipped') {
              trackingResults.summary.shipped_no_tracking++;
            } else {
              trackingResults.summary.delivered_no_tracking++;
            }

            // Sample orders without tracking (max 5)
            if (trackingResults.tracking_samples.filter(s => !s.tracking_number).length < 5) {
              trackingResults.tracking_samples.push({
                page: page,
                index: index,
                reference: lead.reference,
                status: status,
                tracking_number: null,
                carrier: null,
                email: lead.email,
                created_at: lead.created_at,
                note: "NO_TRACKING_DATA",
                raw_tracking_fields: {
                  tracking_number: lead.tracking_number,
                  carrier: lead.carrier,
                  tracking_company: lead.tracking_company,
                  tracking_url: lead.tracking_url,
                  courier: lead.courier,
                  shipping_company: lead.shipping_company
                }
              });
            }
          }
        }
      });
    }

    // Calculate percentages
    const totalShippedDelivered = trackingResults.summary.shipped_with_tracking + 
                                 trackingResults.summary.delivered_with_tracking + 
                                 trackingResults.summary.shipped_no_tracking + 
                                 trackingResults.summary.delivered_no_tracking;

    const trackingCoverage = totalShippedDelivered > 0 ? 
      Math.round(((trackingResults.summary.shipped_with_tracking + trackingResults.summary.delivered_with_tracking) / totalShippedDelivered) * 100) : 0;

    // Analyze tracking number patterns
    const trackingPatterns = analyzeTrackingPatterns(trackingResults.tracking_samples);

    // Generate insights
    const insights = generateTrackingInsights(trackingResults, trackingCoverage);

    console.log(`✅ Tracking analysis complete!`);
    console.log(`📊 Tracking Coverage: ${trackingCoverage}% (${trackingResults.summary.shipped_with_tracking + trackingResults.summary.delivered_with_tracking}/${totalShippedDelivered})`);

    res.status(200).json({
      success: true,
      message: 'PrimeCOD tracking analysis completed',
      tracking_coverage_percentage: trackingCoverage,
      summary: trackingResults.summary,
      status_breakdown: trackingResults.status_breakdown,
      carrier_analysis: trackingResults.carrier_analysis,
      tracking_patterns: trackingPatterns,
      insights: insights,
      sample_tracking_data: trackingResults.tracking_samples,
      recommendations: generateRecommendations(trackingResults, trackingCoverage)
    });

  } catch (error) {
    console.error('💥 Tracking test failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

function analyzeTrackingPatterns(samples) {
  const patterns = {
    tracking_number_lengths: {},
    tracking_number_formats: {},
    common_prefixes: {},
    sample_tracking_numbers: []
  };

  samples.forEach(sample => {
    if (sample.tracking_number) {
      const trackingNum = sample.tracking_number.toString();
      
      // Length analysis
      const length = trackingNum.length;
      patterns.tracking_number_lengths[length] = (patterns.tracking_number_lengths[length] || 0) + 1;
      
      // Format analysis (numbers, letters, mixed)
      let format = 'unknown';
      if (/^\d+$/.test(trackingNum)) {
        format = 'numbers_only';
      } else if (/^[A-Za-z]+$/.test(trackingNum)) {
        format = 'letters_only';
      } else if (/^[A-Za-z0-9]+$/.test(trackingNum)) {
        format = 'alphanumeric';
      } else {
        format = 'special_chars';
      }
      patterns.tracking_number_formats[format] = (patterns.tracking_number_formats[format] || 0) + 1;
      
      // Prefix analysis (first 2-3 characters)
      if (trackingNum.length >= 3) {
        const prefix = trackingNum.substring(0, 3).toUpperCase();
        patterns.common_prefixes[prefix] = (patterns.common_prefixes[prefix] || 0) + 1;
      }
      
      // Collect samples
      if (patterns.sample_tracking_numbers.length < 10) {
        patterns.sample_tracking_numbers.push({
          tracking: trackingNum,
          carrier: sample.carrier,
          reference: sample.reference
        });
      }
    }
  });

  return patterns;
}

function generateTrackingInsights(results, coverage) {
  const insights = [];
  
  if (coverage >= 90) {
    insights.push("✅ EXCELLENT: Very high tracking coverage - fulfillment automation will work well");
  } else if (coverage >= 70) {
    insights.push("⚠️ GOOD: Most orders have tracking - some manual intervention may be needed");
  } else if (coverage >= 50) {
    insights.push("🔶 MODERATE: About half the orders have tracking - consider fallback strategies");
  } else {
    insights.push("❌ LOW: Limited tracking data - may need alternative fulfillment approach");
  }

  // Carrier insights
  const carriers = Object.keys(results.carrier_analysis);
  if (carriers.length === 1) {
    insights.push(`📦 Single carrier detected: ${carriers[0]} - consistent tracking format expected`);
  } else if (carriers.length > 1) {
    insights.push(`📦 Multiple carriers detected (${carriers.length}): ${carriers.join(', ')} - may need carrier-specific handling`);
  }

  // Status insights
  const statuses = Object.keys(results.status_breakdown);
  const shippedCount = results.status_breakdown['shipped'] || 0;
  const deliveredCount = results.status_breakdown['delivered'] || 0;
  
  if (shippedCount > 0 && deliveredCount > 0) {
    insights.push(`🚚 Active shipping pipeline: ${shippedCount} shipped, ${deliveredCount} delivered orders detected`);
  }

  return insights;
}

function generateRecommendations(results, coverage) {
  const recommendations = [];

  // Coverage recommendations
  if (coverage < 80) {
    recommendations.push({
      priority: "HIGH",
      action: "Add fallback fulfillment logic for orders without tracking",
      reason: `Only ${coverage}% of shipped/delivered orders have tracking numbers`
    });
  }

  // Carrier recommendations
  const carriers = Object.keys(results.carrier_analysis);
  if (carriers.includes('Unknown') || carriers.includes('')) {
    recommendations.push({
      priority: "MEDIUM", 
      action: "Map unknown carriers to 'PrimeCOD' as default",
      reason: "Some orders have empty or unknown carrier information"
    });
  }

  // Field recommendations
  const samplesWithAllFields = results.tracking_samples.filter(s => 
    s.raw_tracking_fields.tracking_number && 
    (s.raw_tracking_fields.carrier || s.raw_tracking_fields.tracking_company)
  );
  
  if (samplesWithAllFields.length < results.tracking_samples.filter(s => s.tracking_number).length) {
    recommendations.push({
      priority: "LOW",
      action: "Use 'PrimeCOD' as default carrier when carrier field is empty",
      reason: "Some tracking numbers exist but carrier field is missing"
    });
  }

  // Implementation recommendations
  if (coverage >= 70) {
    recommendations.push({
      priority: "READY",
      action: "Proceed with fulfillment automation implementation",
      reason: `${coverage}% tracking coverage is sufficient for automation`
    });
  }

  return recommendations;
}

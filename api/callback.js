// api/callback.js - Handle OAuth callback
export default async function callbackHandler(req, res) {
  const CLIENT_ID = 'fb3939015d86e6e4277e17c47bac5a1c';
  const CLIENT_SECRET = '47381df987323ea9085a618a377ff45a';
  const SHOP = '334c82-e3'; // Your actual store handle
  
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code not provided' });
  }
  
  try {
    // Step 2: Exchange code for access token
    const tokenResponse = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.access_token) {
      // SUCCESS! Display the access token
      res.status(200).json({
        success: true,
        message: 'OAuth successful! Add this access token to your Vercel environment variables:',
        access_token: tokenData.access_token,
        scope: tokenData.scope,
        instructions: {
          step1: 'Go to your Vercel dashboard',
          step2: 'Navigate to Settings → Environment Variables',
          step3: `Add: SHOPIFY_ACCESS_TOKEN = ${tokenData.access_token}`,
          step4: 'Redeploy your app'
        }
      });
    } else {
      res.status(400).json({
        error: 'Failed to get access token',
        details: tokenData
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'OAuth process failed',
      message: error.message
    });
  }
}

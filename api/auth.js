// api/auth.js - Shopify OAuth Flow
export default async function handler(req, res) {
  const CLIENT_ID = 'fb3939015d86e6e4277e17c47bac5a1c';
  const CLIENT_SECRET = '47381df987323ea9085a618a377ff45a';
  const SHOP = '334c82-e3'; // Your actual store handle
  const REDIRECT_URI = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/callback`;
  
  if (req.method === 'GET') {
    // Step 1: Redirect to Shopify for authorization
    const scopes = 'read_orders,write_orders,read_fulfillments,write_fulfillments,read_locations';
    const state = Math.random().toString(36).substring(7);
    
    const authUrl = `https://${SHOP}.myshopify.com/admin/oauth/authorize?` +
      `client_id=${CLIENT_ID}&` +
      `scope=${scopes}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `state=${state}`;
    
    res.writeHead(302, { Location: authUrl });
    res.end();
  }
}
// Updated Sat Jul 26 01:32:53 +05 2025

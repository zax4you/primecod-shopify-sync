export default async function handler(req, res) {
  const PRIMECOD_TOKEN = process.env.PRIMECOD_TOKEN;
  
  try {
    const response = await fetch('https://api.primecod.app/api/leads', {
      headers: {
        'Authorization': `Bearer ${PRIMECOD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    res.status(200).json({
      total_orders: data.total,
      recent_orders: data.data.slice(0, 3).map(lead => ({
        reference: lead.reference,
        email: lead.email,
        confirmation_status: lead.confirmation_status,
        shipping_status: lead.shipping_status,
        tracking_number: lead.tracking_number
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

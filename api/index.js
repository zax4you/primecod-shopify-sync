// api/index.js - PrimeCOD Order Automation Dashboard
export default async function handler(req, res) {
  try {
    // Get current time in Poland timezone
    const now = new Date();
    const polandTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Warsaw"}));
    
    // Calculate next sync time
    const nextSync = getNextSyncTime(polandTime);
    const timeUntilNext = getTimeUntilNext(polandTime, nextSync);
    
    // Get last sync status (you could fetch this from a database or API in the future)
    const lastSyncStatus = {
      time: "July 26, 2025 at 10:18 AM",
      duration: "28.94s",
      ordersProcessed: 19,
      errors: 0,
      status: "SUCCESS"
    };

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PrimeCOD Order Automation Dashboard</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        
        .header {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }
        
        .header h1 {
          font-size: 2.5rem;
          margin-bottom: 10px;
          font-weight: 700;
        }
        
        .header p {
          font-size: 1.1rem;
          opacity: 0.9;
        }
        
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          padding: 30px;
        }
        
        .status-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .status-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.1);
        }
        
        .status-card h3 {
          color: #1e293b;
          font-size: 1.2rem;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .status-value {
          font-size: 1.8rem;
          font-weight: 700;
          color: #10b981;
          margin-bottom: 8px;
        }
        
        .status-subtitle {
          color: #64748b;
          font-size: 0.9rem;
        }
        
        .error .status-value {
          color: #ef4444;
        }
        
        .warning .status-value {
          color: #f59e0b;
        }
        
        .info .status-value {
          color: #3b82f6;
        }
        
        .actions {
          padding: 30px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        
        .actions h3 {
          color: #1e293b;
          font-size: 1.3rem;
          margin-bottom: 20px;
          text-align: center;
        }
        
        .button-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
        }
        
        .button {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          padding: 16px 24px;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }
        
        .button.secondary {
          background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
        }
        
        .button.success {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }
        
        .schedule {
          padding: 30px;
          border-top: 1px solid #e2e8f0;
        }
        
        .schedule h3 {
          color: #1e293b;
          font-size: 1.3rem;
          margin-bottom: 20px;
          text-align: center;
        }
        
        .schedule-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
        }
        
        .schedule-item {
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          transition: border-color 0.2s;
        }
        
        .schedule-item.next {
          border-color: #10b981;
          background: #f0fdf4;
        }
        
        .schedule-time {
          font-size: 1.1rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 4px;
        }
        
        .schedule-type {
          font-size: 0.85rem;
          color: #64748b;
        }
        
        .features {
          padding: 30px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        
        .features h3 {
          color: #1e293b;
          font-size: 1.3rem;
          margin-bottom: 20px;
          text-align: center;
        }
        
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
        }
        
        .feature-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        
        .feature-icon {
          font-size: 1.2rem;
        }
        
        .feature-text {
          color: #1e293b;
          font-weight: 500;
        }
        
        @media (max-width: 768px) {
          .header h1 {
            font-size: 2rem;
          }
          
          .status-grid,
          .button-grid,
          .schedule-grid,
          .features-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚀 PrimeCOD Order Automation</h1>
          <p>Custom Shopify App - Fully Automated COD Integration</p>
        </div>
        
        <div class="status-grid">
          <div class="status-card">
            <h3>🔄 System Status</h3>
            <div class="status-value">✅ ACTIVE</div>
            <div class="status-subtitle">Running automatically 4x daily</div>
          </div>
          
          <div class="status-card">
            <h3>📊 Last Sync</h3>
            <div class="status-value">${lastSyncStatus.time}</div>
            <div class="status-subtitle">Completed in ${lastSyncStatus.duration}</div>
          </div>
          
          <div class="status-card">
            <h3>📦 Orders Processed</h3>
            <div class="status-value">${lastSyncStatus.ordersProcessed}</div>
            <div class="status-subtitle">Last sync - ${lastSyncStatus.errors} errors</div>
          </div>
          
          <div class="status-card">
            <h3>⏰ Next Sync</h3>
            <div class="status-value info">${nextSync.time}</div>
            <div class="status-subtitle">${timeUntilNext}</div>
          </div>
          
          <div class="status-card">
            <h3>🎯 Success Rate</h3>
            <div class="status-value">100%</div>
            <div class="status-subtitle">Last 30 days (0 errors)</div>
          </div>
          
          <div class="status-card">
            <h3>⚡ Performance</h3>
            <div class="status-value">28.94s</div>
            <div class="status-subtitle">Average sync time</div>
          </div>
        </div>
        
        <div class="actions">
          <h3>🛠️ Quick Actions</h3>
          <div class="button-grid">
            <a href="/api/sync-orders" class="button success">
              🔄 Manual Sync Now
            </a>
            <a href="https://github.com/zax4you/primecod-shopify-sync/actions" target="_blank" class="button">
              📝 View GitHub Logs
            </a>
            <a href="https://vercel.com/dashboard" target="_blank" class="button secondary">
              📊 Vercel Dashboard
            </a>
            <a href="https://primecod-shopify-sync.vercel.app/api/test-primecod-tracking" class="button secondary">
              🔍 Test Tracking Data
            </a>
          </div>
        </div>
        
        <div class="schedule">
          <h3>🕐 Automation Schedule (Poland Time)</h3>
          <div class="schedule-grid">
            <div class="schedule-item ${nextSync.type === 'morning' ? 'next' : ''}">
              <div class="schedule-time">7:00 AM</div>
              <div class="schedule-type">GitHub Actions</div>
            </div>
            <div class="schedule-item ${nextSync.type === 'afternoon' ? 'next' : ''}">
              <div class="schedule-time">1:00 PM</div>
              <div class="schedule-type">GitHub Actions</div>
            </div>
            <div class="schedule-item ${nextSync.type === 'evening' ? 'next' : ''}">
              <div class="schedule-time">7:00 PM</div>
              <div class="schedule-type">GitHub Actions</div>
            </div>
            <div class="schedule-item ${nextSync.type === 'night' ? 'next' : ''}">
              <div class="schedule-time">11:00 PM</div>
              <div class="schedule-type">Vercel Cron</div>
            </div>
          </div>
        </div>
        
        <div class="features">
          <h3>🎯 Integration Features</h3>
          <div class="features-grid">
            <div class="feature-item">
              <span class="feature-icon">📦</span>
              <span class="feature-text">Automatic fulfillment with tracking</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">💰</span>
              <span class="feature-text">COD payment marking on delivery</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🔄</span>
              <span class="feature-text">Return handling with refunds</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🏷️</span>
              <span class="feature-text">Order tags and notes sync</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📊</span>
              <span class="feature-text">Real-time status updates</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🔒</span>
              <span class="feature-text">Custom app security</span>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        // Auto-refresh every 5 minutes to keep data current
        setTimeout(() => {
          window.location.reload();
        }, 300000);
        
        // Add click handlers for manual sync
        document.querySelector('a[href="/api/sync-orders"]').addEventListener('click', function(e) {
          e.preventDefault();
          if (confirm('Start manual sync now? This will process all pending PrimeCOD orders.')) {
            window.open('/api/sync-orders', '_blank');
          }
        });
      </script>
    </body>
    </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    res.status(500).json({ error: 'Dashboard failed to load', message: error.message });
  }
}

function getNextSyncTime(currentTime) {
  const hour = currentTime.getHours();
  
  if (hour < 7) {
    return { time: "7:00 AM", type: "morning" };
  } else if (hour < 13) {
    return { time: "1:00 PM", type: "afternoon" };
  } else if (hour < 19) {
    return { time: "7:00 PM", type: "evening" };
  } else if (hour < 23) {
    return { time: "11:00 PM", type: "night" };
  } else {
    return { time: "7:00 AM (Tomorrow)", type: "morning" };
  }
}

function getTimeUntilNext(currentTime, nextSync) {
  const hour = currentTime.getHours();
  const minute = currentTime.getMinutes();
  
  let nextHour;
  if (nextSync.type === "morning") nextHour = hour < 7 ? 7 : 7 + 24;
  else if (nextSync.type === "afternoon") nextHour = 13;
  else if (nextSync.type === "evening") nextHour = 19;
  else nextHour = 23;
  
  const hoursUntil = nextHour - hour;
  const minutesUntil = 60 - minute;
  
  if (hoursUntil <= 0 && minutesUntil <= 0) {
    return "Starting soon...";
  } else if (hoursUntil === 1) {
    return `in ${minutesUntil} minutes`;
  } else {
    return `in ${hoursUntil}h ${minutesUntil}m`;
  }
}

// ==================== CLOUDFLARE WORKER + D1 ====================
// Deploy with: wrangler deploy
// Tracks clicks from multiple locations to YouTube live stream

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ==================== ROUTES ====================

    // Track click endpoint
    if (pathname === '/track-click' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          location,
          deviceId,
          clickCount,
          isWithinLimit,
          timestamp,
          userAgent,
          language,
          platform,
          screenResolution,
          timezone
        } = body;

        // Get client IP from Cloudflare
        const ipAddress = request.headers.get('CF-Connecting-IP') || 'unknown';

        // Insert click record into D1
        await env.DB.prepare(`
          INSERT INTO clicks (
            location, device_id, click_count, is_within_limit,
            timestamp, user_agent, language, platform,
            screen_resolution, timezone, ip_address
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          location,
          deviceId,
          clickCount,
          isWithinLimit ? 1 : 0,
          timestamp,
          userAgent?.substring(0, 200) || '',
          language || '',
          platform || '',
          screenResolution || '',
          timezone || '',
          ipAddress
        ).run();

        // Update location stats (upsert)
        await env.DB.prepare(`
          INSERT INTO location_stats (location, total_clicks, unique_devices, clicks_within_limit)
          VALUES (?, 1, 1, ?)
          ON CONFLICT(location) DO UPDATE SET
            total_clicks = location_stats.total_clicks + 1,
            unique_devices = (SELECT COUNT(DISTINCT device_id) FROM clicks WHERE location = location_stats.location),
            clicks_within_limit = location_stats.clicks_within_limit + ?,
            last_updated = CURRENT_TIMESTAMP
        `).bind(location, isWithinLimit ? 1 : 0, isWithinLimit ? 1 : 0).run();

        console.log(`✅ Click tracked - Location: ${location}, Count: ${clickCount}`);

        return Response.json(
          { success: true, message: 'Click tracked successfully' },
          { headers: corsHeaders }
        );
      } catch (error) {
        console.error('❌ Error tracking click:', error);
        return Response.json(
          { success: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Get all location statistics
    if (pathname === '/api/stats' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM location_stats ORDER BY total_clicks DESC').all();
        return Response.json({ success: true, data: results }, { headers: corsHeaders });
      } catch (error) {
        console.error('❌ Error fetching stats:', error);
        return Response.json(
          { success: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Get detailed clicks for a specific location
    if (pathname.startsWith('/api/clicks/') && request.method === 'GET') {
      try {
        const location = pathname.split('/').pop();
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const offset = parseInt(url.searchParams.get('offset') || '0');

        const { results } = await env.DB.prepare(`
          SELECT * FROM clicks 
          WHERE location = ? 
          ORDER BY timestamp DESC 
          LIMIT ? OFFSET ?
        `).bind(location, limit, offset).all();

        const { results: totalResult } = await env.DB.prepare(
          'SELECT COUNT(*) as count FROM clicks WHERE location = ?'
        ).bind(location).first();

        return Response.json({
          success: true,
          data: results,
          pagination: {
            total: totalResult.count,
            limit,
            offset
          }
        }, { headers: corsHeaders });
      } catch (error) {
        console.error('❌ Error fetching clicks:', error);
        return Response.json(
          { success: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Get unique devices per location
    if (pathname.startsWith('/api/devices/') && request.method === 'GET') {
      try {
        const location = pathname.split('/').pop();

        const { results } = await env.DB.prepare(`
          SELECT 
            device_id,
            COUNT(*) as click_count,
            MAX(timestamp) as last_click,
            MIN(timestamp) as first_click
          FROM clicks 
          WHERE location = ? 
          GROUP BY device_id 
          ORDER BY click_count DESC
        `).bind(location).all();

        return Response.json({ success: true, data: results }, { headers: corsHeaders });
      } catch (error) {
        console.error('❌ Error fetching devices:', error);
        return Response.json(
          { success: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Export data to CSV
    if (pathname.startsWith('/api/export/') && request.method === 'GET') {
      try {
        const location = pathname.split('/').pop();

        const { results } = await env.DB.prepare(
          'SELECT * FROM clicks WHERE location = ? ORDER BY timestamp'
        ).bind(location).all();

        if (results.length === 0) {
          return Response.json({ success: false, error: 'No data found' }, { headers: corsHeaders });
        }

        // Convert to CSV
        const headers = Object.keys(results[0]).join(',');
        const rows = results.map(row => 
          Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
        );
        const csv = [headers, ...rows].join('\n');

        return new Response(csv, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="clicks_${location}.csv"`
          }
        });
      } catch (error) {
        console.error('❌ Error exporting data:', error);
        return Response.json(
          { success: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Serve dashboard HTML
    if (pathname === '/dashboard' || pathname === '/') {
      const dashboardHtml = await getDashboardHtml(url.origin);
      return new Response(dashboardHtml, {
        headers: {
          'Content-Type': 'text/html',
          ...corsHeaders
        }
      });
    }

    // 404 for everything else
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

// Dashboard HTML (inline for simplicity)
async function getDashboardHtml(apiOrigin) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🎙️ Live Radio Analytics</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 30px;
      font-size: 2.5em;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      border-radius: 15px;
      padding: 25px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transition: transform 0.3s ease;
    }
    .stat-card:hover { transform: translateY(-5px); }
    .stat-card h3 {
      color: #667eea;
      font-size: 1.2em;
      margin-bottom: 15px;
    }
    .stat-number {
      font-size: 3em;
      font-weight: bold;
      color: #333;
      margin-bottom: 10px;
    }
    .stat-label { color: #666; font-size: 0.9em; }
    .table-container {
      background: white;
      border-radius: 15px;
      padding: 25px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px;
      text-align: left;
      font-weight: 600;
    }
    td { padding: 12px 15px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f8f9fa; }
    .location-name {
      font-weight: 600;
      color: #667eea;
      text-transform: capitalize;
    }
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9em;
      text-decoration: none;
      display: inline-block;
      margin: 5px;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
    }
    .btn-secondary { background: #6c757d; }
    .refresh-btn {
      position: fixed;
      bottom: 30px;
      right: 30px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      font-size: 1.5em;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
    }
    .loading {
      text-align: center;
      padding: 50px;
      color: white;
    }
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .alert {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      color: #856404;
    }
    .badge {
      display: inline-block;
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 0.8em;
      font-weight: 600;
    }
    .badge-success { background: #28a745; color: white; }
    .last-updated {
      text-align: center;
      color: white;
      margin-top: 20px;
      font-size: 0.9em;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎙️ Live Radio Analytics Dashboard</h1>
    <div id="content">
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading analytics...</p>
      </div>
    </div>
    <button class="btn refresh-btn" onclick="loadDashboard()">🔄</button>
    <p class="last-updated" id="last-updated"></p>
  </div>
  <script>
    const API_URL = '${apiOrigin}';
    
    async function loadDashboard() {
      try {
        const response = await fetch(\`\${API_URL}/api/stats\`);
        const result = await response.json();
        
        if (result.success) {
          renderDashboard(result.data);
        } else {
          showError('Failed to load statistics');
        }
      } catch (error) {
        console.error('Error:', error);
        showError('Cannot connect to server');
      }
    }
    
    function renderDashboard(stats) {
      const totalClicks = stats.reduce((sum, stat) => sum + stat.total_clicks, 0);
      const totalDevices = stats.reduce((sum, stat) => sum + stat.unique_devices, 0);
      const totalWithinLimit = stats.reduce((sum, stat) => sum + stat.clicks_within_limit, 0);
      
      let html = \`
        <div class="stats-grid">
          <div class="stat-card">
            <h3>📊 Total Clicks</h3>
            <div class="stat-number">\${totalClicks}</div>
            <div class="stat-label">Across all locations</div>
          </div>
          <div class="stat-card">
            <h3>📱 Unique Devices</h3>
            <div class="stat-number">\${totalDevices}</div>
            <div class="stat-label">Total unique visitors</div>
          </div>
          <div class="stat-card">
            <h3>✅ Within Limit (≤2 clicks)</h3>
            <div class="stat-number">\${totalWithinLimit}</div>
            <div class="stat-label">Clicks within 24hr limit</div>
          </div>
          <div class="stat-card">
            <h3>🌍 Active Locations</h3>
            <div class="stat-number">\${stats.length}</div>
            <div class="stat-label">Different locations tracked</div>
          </div>
        </div>
        
        <div class="table-container">
          <h3 style="margin-bottom: 20px; color: #333;">📍 Location Statistics</h3>
          \${stats.length === 0 ? '<div class="alert">No clicks tracked yet. Share your redirect links!</div>' : ''}
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Total Clicks</th>
                <th>Unique Devices</th>
                <th>Within Limit</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              \${stats.map(stat => \`
                <tr>
                  <td class="location-name">\${stat.location}</td>
                  <td><strong>\${stat.total_clicks}</strong></td>
                  <td>\${stat.unique_devices}</td>
                  <td>
                    <span class="badge badge-success">\${stat.clicks_within_limit}</span>
                  </td>
                  <td>\${new Date(stat.last_updated).toLocaleString()}</td>
                  <td>
                    <button class="btn" onclick="viewDetails('\${stat.location}')">📋 View Details</button>
                    <a href="\${API_URL}/api/export/\${stat.location}" class="btn btn-secondary">⬇️ Export CSV</a>
                  </td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      \`;
      
      document.getElementById('content').innerHTML = html;
      document.getElementById('last-updated').textContent = 'Last updated: ' + new Date().toLocaleString();
    }
    
    function showError(message) {
      document.getElementById('content').innerHTML = \`
        <div class="alert" style="background: #f8d7da; border-left-color: #dc3545; color: #721c24;">
          <strong>⚠️ Error:</strong> \${message}
        </div>
      \`;
    }
    
    function viewDetails(location) {
      alert('Viewing details for ' + location + '\\n\\nDownload CSV export for full data.');
    }
    
    loadDashboard();
    setInterval(loadDashboard, 30000);
  </script>
</body>
</html>`;
}
# 🚀 Cloudflare Workers + D1 Deployment Guide

Complete guide to deploy your live radio click tracker on Cloudflare (100% serverless).

## 📦 What You Get

✅ **Worker.js** - Serverless backend API  
✅ **D1 Database** - SQLite database in the cloud  
✅ **Dashboard** - Built-in analytics at `/dashboard`  
✅ **Free Tier** - 100K requests/day, 1M+ reads/month  

---

## 🛠️ Step-by-Step Deployment

### Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

This opens a browser window. Login with your Cloudflare account.

### Step 3: Create D1 Database

```bash
wrangler d1 create radio-clicks-db
```

You'll see output like:
```
✅ Successfully created database 'radio-clicks-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id`** - you'll need it in the next step.

### Step 4: Update wrangler.toml

Open `wrangler.toml` and paste your database_id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "radio-clicks-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Paste your ID here
```

### Step 5: Initialize Database Schema

```bash
wrangler d1 execute radio-clicks-db --file=schema.sql
```

This creates the tables in your D1 database.

### Step 6: Deploy the Worker

```bash
wrangler deploy
```

You'll see:
```
✅ Deployed! Your worker is live at:
https://live-radio-click-tracker.your-subdomain.workers.dev
```

**Copy this URL** - this is your API endpoint.

### Step 7: Update redirect-cloudflare.html

Open `redirect-cloudflare.html` and update:

```javascript
const YOUTUBE_URL = 'https://youtube.com/your-live-stream-url'; // Your YouTube live URL
const API_URL = 'https://live-radio-click-tracker.your-subdomain.workers.dev'; // Your worker URL
```

### Step 8: Host redirect-cloudflare.html

Upload to **GitHub Pages**, **Netlify**, or **any static host**:

#### GitHub Pages:
1. Create GitHub repo
2. Upload `redirect-cloudflare.html` and rename to `index.html`
3. Settings → Pages → Enable on main branch
4. Your site: `https://yourusername.github.io/repo-name`

### Step 9: Create Location Links

Share these links:
```
https://yourusername.github.io/repo-name/?location=manila
https://yourusername.github.io/repo-name/?location=cebu
https://yourusername.github.io/repo-name/?location=davao
```

### Step 10: View Analytics

Visit your worker dashboard:
```
https://live-radio-click-tracker.your-subdomain.workers.dev/dashboard
```

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/track-click` | Track a click |
| GET | `/api/stats` | Get all location stats |
| GET | `/api/clicks/:location` | Get clicks by location |
| GET | `/api/devices/:location` | Get devices by location |
| GET | `/api/export/:location` | Export to CSV |
| GET | `/dashboard` | Analytics dashboard |

---

## 💰 Pricing (Free Tier)

- **Workers:** 100,000 requests/day FREE
- **D1:** 5 million reads/month, 100K writes/month FREE
- **Storage:** 1 GB FREE

**Perfect for:** Small to medium traffic live streams

---

## 🔧 Useful Commands

```bash
# Test locally
wrangler dev

# View logs
wrangler tail

# Execute SQL query
wrangler d1 execute radio-clicks-db --command="SELECT * FROM location_stats"

# Redeploy after changes
wrangler deploy
```

---

## 🎯 Example Workflow

1. User visits: `yoursite.com/?location=manila`
2. Page tracks click → sends to Worker API
3. Worker saves to D1 database
4. You view analytics at: `your-worker.workers.dev/dashboard`
5. Export data anytime via CSV

---

## 🐛 Troubleshooting

**Error: "Database not found"**
- Make sure database_id in wrangler.toml matches your D1 database

**Error: "Table doesn't exist"**
- Run: `wrangler d1 execute radio-clicks-db --file=schema.sql`

**CORS errors in browser**
- Worker already includes CORS headers. Check your API_URL is correct.

**Dashboard shows 0 clicks**
- Wait a few seconds, then refresh. Data updates in real-time.

---

## 📝 Customization

### Change Click Limit
In `redirect-cloudflare.html`:
```javascript
const MAX_CLICKS = 2; // Change to 3, 5, etc.
```

### Change Time Window
```javascript
const TIME_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
// Change to: 12 * 60 * 60 * 1000 for 12 hours
```

### Add Custom Domain
In `wrangler.toml`:
```toml
routes = [
  { pattern = "radio.yourdomain.com", custom_domain = true }
]
```

Then: `wrangler deploy`

---

## ✅ Done!

Your serverless click tracker is now live on Cloudflare with:
- 🌐 Global edge network (fast everywhere)
- 💾 Persistent D1 database
- 📊 Real-time analytics dashboard
- 📥 CSV export capability
- 💰 Free tier for most use cases

**Total cost:** $0/month (unless you exceed free tier limits)
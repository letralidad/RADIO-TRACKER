-- Cloudflare D1 Database Schema
-- Run: wrangler d1 execute radio-clicks-db --file=schema.sql

-- Clicks table - stores individual click events
CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT NOT NULL,
    device_id TEXT NOT NULL,
    click_count INTEGER NOT NULL,
    is_within_limit INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    user_agent TEXT,
    language TEXT,
    platform TEXT,
    screen_resolution TEXT,
    timezone TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Location statistics table - aggregated stats per location
CREATE TABLE IF NOT EXISTS location_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT UNIQUE NOT NULL,
    total_clicks INTEGER DEFAULT 0,
    unique_devices INTEGER DEFAULT 0,
    clicks_within_limit INTEGER DEFAULT 0,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_location ON clicks(location);
CREATE INDEX IF NOT EXISTS idx_device ON clicks(device_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON clicks(timestamp);
CREATE INDEX IF NOT EXISTS idx_location_timestamp ON clicks(location, timestamp);
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_name TEXT,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed INTEGER DEFAULT 0,
  confirm_token TEXT,
  unsubscribe_token TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS preferences (
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  min_elevation INTEGER,
  PRIMARY KEY (subscriber_id, event_type)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  event_id TEXT,
  sent_at TEXT NOT NULL,
  email_id TEXT
);

CREATE TABLE IF NOT EXISTS event_queue (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_data TEXT NOT NULL,
  notify_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_notify ON event_queue(notify_at, status);
CREATE INDEX IF NOT EXISTS idx_queue_subscriber ON event_queue(subscriber_id, event_type);
CREATE INDEX IF NOT EXISTS idx_log_subscriber_event ON notification_log(subscriber_id, event_type, event_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers(active, confirmed);

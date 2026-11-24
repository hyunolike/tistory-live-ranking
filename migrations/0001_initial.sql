CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  verified_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES posts(id),
  viewed_at INTEGER NOT NULL
);
CREATE INDEX views_time_post ON views(viewed_at, post_id);
CREATE TABLE dedup (
  post_id TEXT NOT NULL REFERENCES posts(id),
  fingerprint TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY(post_id, fingerprint)
);
CREATE INDEX dedup_time ON dedup(last_seen);
CREATE TABLE rate_limits (
  fingerprint TEXT NOT NULL,
  minute INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY(fingerprint, minute)
);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);


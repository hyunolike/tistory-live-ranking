CREATE TABLE sites (
 id TEXT PRIMARY KEY,
 origin TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
 created_at INTEGER NOT NULL,
 verified_at INTEGER,
 checked_at INTEGER NOT NULL DEFAULT 0,
 sync_at INTEGER NOT NULL DEFAULT 0,
 collected_since INTEGER
);
INSERT INTO sites(id,origin,status,created_at,verified_at) VALUES('hyunolike','https://hyunolike.tistory.com','active',0,0);
CREATE TABLE site_posts (
 site_id TEXT NOT NULL REFERENCES sites(id),
 id TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT '',
 url TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 0,
 listed INTEGER NOT NULL DEFAULT 1,
 verified_at INTEGER NOT NULL DEFAULT 0,
 checked_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(site_id,id)
);
CREATE TABLE site_views (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 site_id TEXT NOT NULL,
 post_id TEXT NOT NULL,
 viewed_at INTEGER NOT NULL,
 FOREIGN KEY(site_id,post_id) REFERENCES site_posts(site_id,id)
);
CREATE INDEX site_views_window ON site_views(site_id,viewed_at,post_id);
CREATE TABLE site_dedup (
 site_id TEXT NOT NULL,
 post_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 last_seen INTEGER NOT NULL,
 PRIMARY KEY(site_id,post_id,fingerprint),
 FOREIGN KEY(site_id,post_id) REFERENCES site_posts(site_id,id)
);
CREATE INDEX site_dedup_time ON site_dedup(last_seen);
CREATE TABLE site_limits (
 fingerprint TEXT NOT NULL,
 bucket INTEGER NOT NULL,
 hits INTEGER NOT NULL,
 PRIMARY KEY(fingerprint,bucket)
);

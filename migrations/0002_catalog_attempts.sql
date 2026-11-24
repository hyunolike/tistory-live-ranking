ALTER TABLE posts ADD COLUMN checked_at INTEGER NOT NULL DEFAULT 0;
UPDATE posts SET checked_at=verified_at;
CREATE INDEX posts_checked ON posts(checked_at);

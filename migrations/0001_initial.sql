CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  publisher_url TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  default_category TEXT NOT NULL CHECK (default_category IN ('模型與研究', '產品與公司', '開源與開發者', '政策與安全', '投資與產業')),
  language TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_fetched_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingested_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  guid TEXT,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source_excerpt TEXT,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  title_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'selected', 'published', 'rejected', 'failed')),
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingested_item_id INTEGER NOT NULL UNIQUE REFERENCES ingested_items(id),
  slug TEXT NOT NULL UNIQUE,
  headline_zh_hk TEXT NOT NULL,
  summary_zh_hk TEXT NOT NULL,
  key_facts_json TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('模型與研究', '產品與公司', '開源與開發者', '政策與安全', '投資與產業')),
  named_entities_json TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_published_at TEXT,
  published_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('published', 'failed', 'hidden')),
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  digest_date TEXT NOT NULL UNIQUE,
  headline_zh_hk TEXT NOT NULL,
  intro_zh_hk TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'partial', 'failed')),
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS digest_stories (
  digest_id INTEGER NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (digest_id, story_id)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  feeds_attempted INTEGER NOT NULL DEFAULT 0,
  feeds_succeeded INTEGER NOT NULL DEFAULT 0,
  items_discovered INTEGER NOT NULL DEFAULT 0,
  stories_selected INTEGER NOT NULL DEFAULT 0,
  stories_published INTEGER NOT NULL DEFAULT 0,
  digest_id INTEGER REFERENCES digests(id),
  errors_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_ingested_items_status_published
  ON ingested_items (status, published_at);
CREATE INDEX IF NOT EXISTS idx_ingested_items_source
  ON ingested_items (source_id);
CREATE INDEX IF NOT EXISTS idx_ingested_items_title_hash
  ON ingested_items (title_hash);
CREATE INDEX IF NOT EXISTS idx_stories_published_category
  ON stories (status, published_at, category);
CREATE INDEX IF NOT EXISTS idx_digest_stories_position
  ON digest_stories (digest_id, position);

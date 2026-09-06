INSERT OR IGNORE INTO sources
  (name, publisher_url, feed_url, default_category, language, enabled, created_at, updated_at)
VALUES
  ('TechNews 科技新報 AI', 'https://technews.tw/category/ai/', 'https://technews.tw/category/ai/feed/', '產品與公司', 'zh', 1, datetime('now'), datetime('now'));

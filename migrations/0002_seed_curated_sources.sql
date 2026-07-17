INSERT OR IGNORE INTO sources
  (name, publisher_url, feed_url, default_category, language, enabled, created_at, updated_at)
VALUES
  ('Google AI', 'https://blog.google/technology/ai/', 'https://blog.google/technology/ai/rss/', '產品與公司', 'en', 1, datetime('now'), datetime('now')),
  ('Hugging Face Blog', 'https://huggingface.co/blog', 'https://huggingface.co/blog/feed.xml', '開源與開發者', 'en', 1, datetime('now'), datetime('now')),
  ('Google Research', 'https://research.google/blog/', 'https://research.google/blog/rss/', '模型與研究', 'en', 1, datetime('now'), datetime('now')),
  ('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/', 'https://techcrunch.com/category/artificial-intelligence/feed/', '產品與公司', 'en', 1, datetime('now'), datetime('now')),
  ('MIT Technology Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/', 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', '政策與安全', 'en', 1, datetime('now'), datetime('now')),
  ('arXiv cs.AI', 'https://arxiv.org/list/cs.AI/recent', 'https://export.arxiv.org/rss/cs.AI', '模型與研究', 'en', 1, datetime('now'), datetime('now')),
  ('arXiv cs.LG', 'https://arxiv.org/list/cs.LG/recent', 'https://export.arxiv.org/rss/cs.LG', '模型與研究', 'en', 1, datetime('now'), datetime('now')),
  ('WIRED AI', 'https://www.wired.com/tag/artificial-intelligence/', 'https://www.wired.com/feed/tag/ai/latest/rss', '政策與安全', 'en', 1, datetime('now'), datetime('now'));

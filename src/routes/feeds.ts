import { Hono } from "hono";

import { CATEGORIES } from "../render/layout";
import type { Category, StoryRecord } from "../db/types";
import {
  getPublishedDigests,
  getPublishedStoriesByCategory,
  getPublishedStoriesForSitemap,
} from "../db/repositories/public";
import type { Env } from "../env";

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absoluteUrl(env: Env, path: string): string {
  return new URL(path, env.PUBLIC_SITE_URL || "https://ainews.cchk.uk").toString();
}

function utcDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toUTCString();
}

function response(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300",
    },
  });
}

function rssItem(c: { env: Env }, story: StoryRecord): string {
  const published = utcDate(story.published_at ?? story.source_published_at);
  return `
      <item>
        <title>${xmlEscape(story.headline_zh_hk)}</title>
        <link>${xmlEscape(absoluteUrl(c.env, `/story/${encodeURIComponent(story.slug)}`))}</link>
        <guid isPermaLink="false">${story.id}</guid>
        <description>${xmlEscape(story.summary_zh_hk)}</description>
        <category>${xmlEscape(story.category)}</category>
        ${published ? `<pubDate>${xmlEscape(published)}</pubDate>` : ""}
        <source url="${xmlEscape(story.source_url)}">${xmlEscape(story.source_name)}</source>
      </item>`;
}

function rssChannel(c: { env: Env }, title: string, description: string, link: string, stories: StoryRecord[]): string {
  const items = stories.map((story) => rssItem(c, story)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>${xmlEscape(link)}</link>
    <description>${xmlEscape(description)}</description>
    <language>zh-HK</language>${items}
  </channel>
</rss>`;
}

const feeds = new Hono<{ Bindings: Env }>();

feeds.get("/rss.xml", async (c) => {
  const stories = await getPublishedStoriesForSitemap(c.env.DB, 50);
  const body = rssChannel(
    c,
    "AI 新聞．香港",
    "每日整理全球人工智能新聞的香港繁體中文摘要。",
    absoluteUrl(c.env, "/"),
    stories,
  );
  return response(body, "application/rss+xml; charset=UTF-8");
});

feeds.get("/category/:category/rss.xml", async (c) => {
  const category = decodeParam(c.req.param("category"));
  if (!isCategory(category)) return c.json({ error: "Not found" }, 404);
  const stories = await getPublishedStoriesByCategory(c.env.DB, category, 50);
  const body = rssChannel(
    c,
    `${category}｜AI 新聞．香港`,
    `「${category}」分類的香港繁體中文人工智能新聞摘要。`,
    absoluteUrl(c.env, `/category/${encodeURIComponent(category)}`),
    stories,
  );
  return response(body, "application/rss+xml; charset=UTF-8");
});

feeds.get("/sitemap.xml", async (c) => {
  const [stories, digests] = await Promise.all([
    getPublishedStoriesForSitemap(c.env.DB),
    getPublishedDigests(c.env.DB),
  ]);
  const storyUrls = stories.map((story) => {
    const lastmod = utcDate(story.updated_at ?? story.published_at);
    return `<url><loc>${xmlEscape(absoluteUrl(c.env, `/story/${encodeURIComponent(story.slug)}`))}</loc>${lastmod ? `<lastmod>${xmlEscape(new Date(story.updated_at ?? story.published_at ?? "").toISOString().slice(0, 10))}</lastmod>` : ""}</url>`;
  }).join("");
  const digestUrls = digests.map((digest) =>
    `<url><loc>${xmlEscape(absoluteUrl(c.env, `/digest/${digest.digest_date}`))}</loc><lastmod>${xmlEscape(digest.updated_at.slice(0, 10))}</lastmod></url>`,
  ).join("");
  return response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${storyUrls}${digestUrls}</urlset>`,
    "application/xml; charset=UTF-8",
  );
});

export default feeds;

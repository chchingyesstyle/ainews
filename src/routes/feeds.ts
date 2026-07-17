import { Hono } from "hono";

import {
  getPublishedDigests,
  getPublishedStoriesForSitemap,
} from "../db/repositories/public";
import type { Env } from "../env";

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

const feeds = new Hono<{ Bindings: Env }>();

feeds.get("/rss.xml", async (c) => {
  const stories = await getPublishedStoriesForSitemap(c.env.DB, 50);
  const items = stories.map((story) => {
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
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI 新聞．香港</title>
    <link>${xmlEscape(absoluteUrl(c.env, "/"))}</link>
    <description>每日整理全球人工智能新聞的香港繁體中文摘要。</description>
    <language>zh-HK</language>${items}
  </channel>
</rss>`;
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

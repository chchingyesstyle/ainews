import { Hono } from "hono";

import { CATEGORIES, renderLayout, SITE_NAME } from "../render/layout";
import { AboutPage } from "../render/pages/about";
import { CategoryPage } from "../render/pages/category";
import { DigestPage } from "../render/pages/digest";
import { HomePage } from "../render/pages/home";
import { SearchPage } from "../render/pages/search";
import { StoryPage } from "../render/pages/story";
import { TagPage } from "../render/pages/tag";
import { renderArticleJsonLd } from "../render/metadata";
import {
  getLatestPublishedDigest,
  getLatestPublishedStories,
  getPublishedDigestByDate,
  getPublishedStoriesByCategory,
  getPublishedStoriesByEntity,
  getPublishedStoryBySlug,
  getRelatedPublishedStories,
  getStoriesForDigest,
  searchPublishedStories,
} from "../db/repositories/public";
import type { Env } from "../env";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TAG_LENGTH = 120;

function siteUrl(env: Env, path: string): string {
  return new URL(path, env.PUBLIC_SITE_URL || "https://ainews.cchk.uk").toString();
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isCategory(value: string): value is (typeof CATEGORIES)[number] {
  return CATEGORIES.includes(value as (typeof CATEGORIES)[number]);
}

function isDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function notFoundPage(message: string) {
  return renderLayout({
    title: "找不到頁面",
    description: message,
    canonicalUrl: "https://ainews.cchk.uk/404",
    children: message,
  });
}

const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get("/", async (c) => {
  const digest = await getLatestPublishedDigest(c.env.DB);
  const digestStories = digest ? await getStoriesForDigest(c.env.DB, digest.id) : [];
  const stories = await getLatestPublishedStories(c.env.DB, 12);
  return c.html(
    renderLayout({
      title: SITE_NAME,
      canonicalUrl: siteUrl(c.env, "/"),
      activePath: "/",
      children: HomePage({ digest, digestStories, stories }),
    }),
  );
});

publicRoutes.get("/digest/:date", async (c) => {
  const requestedDate = decodeParam(c.req.param("date"));
  const digest = requestedDate === "latest"
    ? await getLatestPublishedDigest(c.env.DB)
    : isDate(requestedDate)
      ? await getPublishedDigestByDate(c.env.DB, requestedDate)
      : null;
  if (!digest) return c.html(notFoundPage("這一天沒有可顯示的每日摘要。"), 404);
  const stories = await getStoriesForDigest(c.env.DB, digest.id);
  return c.html(
    renderLayout({
      title: digest.headline_zh_hk,
      description: digest.intro_zh_hk,
      canonicalUrl: siteUrl(c.env, `/digest/${digest.digest_date}`),
      activePath: "/digest",
      children: DigestPage({ digest, stories }),
    }),
  );
});

publicRoutes.get("/story/:slug", async (c) => {
  const slug = decodeParam(c.req.param("slug"));
  const story = await getPublishedStoryBySlug(c.env.DB, slug);
  if (!story) return c.html(notFoundPage("這篇文章不存在或已被隱藏。"), 404);
  const related = await getRelatedPublishedStories(c.env.DB, story, 4);
  return c.html(
    renderLayout({
      title: story.headline_zh_hk,
      description: story.summary_zh_hk,
      canonicalUrl: siteUrl(c.env, `/story/${encodeURIComponent(story.slug)}`),
      activePath: "/story",
      children: StoryPage({ story, related }),      ogType: "article",
      publishedAt: story.published_at,
      articleJsonLd: renderArticleJsonLd(story, siteUrl(c.env, "/story/" + encodeURIComponent(story.slug))),
    }),
  );
});

publicRoutes.get("/category/:category", async (c) => {
  const category = decodeParam(c.req.param("category"));
  if (!isCategory(category)) return c.html(notFoundPage("這個新聞分類不存在。"), 404);
  const stories = await getPublishedStoriesByCategory(c.env.DB, category, 50);
  return c.html(
    renderLayout({
      title: category,
      canonicalUrl: siteUrl(c.env, `/category/${encodeURIComponent(category)}`),
      activePath: `/category/${category}`,
      children: CategoryPage({ category, stories }),
    }),
  );
});

publicRoutes.get("/about", async (c) => {
  return c.html(
    renderLayout({
      title: "關於",
      description: "AI 新聞．香港的編輯原則及更新頻率。",
      canonicalUrl: siteUrl(c.env, "/about"),
      activePath: "/about",
      children: AboutPage(),
    }),
  );
});

publicRoutes.get("/tag/:name", async (c) => {
  const name = decodeParam(c.req.param("name"));
  if (name.length === 0 || name.length > MAX_TAG_LENGTH) return c.html(notFoundPage("這個主題不存在。"), 404);
  const stories = await getPublishedStoriesByEntity(c.env.DB, name, 50);
  return c.html(
    renderLayout({
      title: name,
      description: `提及「${name}」的已發布人工智能新聞。`,
      canonicalUrl: siteUrl(c.env, `/tag/${encodeURIComponent(name)}`),
      children: TagPage({ name, stories }),
    }),
  );
});

publicRoutes.get("/search", async (c) => {
  const query = c.req.query("q")?.trim() ?? "";
  const stories = query ? await searchPublishedStories(c.env.DB, query, 50) : [];
  return c.html(
    renderLayout({
      title: query ? `搜尋：${query}` : "搜尋新聞",
      canonicalUrl: siteUrl(c.env, "/search"),
      activePath: "/search",
      children: SearchPage({ query, stories }),
    }),
  );
});

export default publicRoutes;

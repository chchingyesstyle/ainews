import { raw } from "hono/html";
import type { Child, PropsWithChildren } from "hono/jsx";

import type { Category } from "../db/types";

export const SITE_NAME = "AI 新聞．香港";
export const SITE_DESCRIPTION = "每日整理全球人工智能新聞，提供清晰來源連結與繁體中文摘要。";
export const CATEGORIES: readonly Category[] = [
  "模型與研究",
  "產品與公司",
  "開源與開發者",
  "政策與安全",
  "投資與產業",
];

export interface LayoutProps extends PropsWithChildren {
  title: string;
  description?: string;
  canonicalUrl?: string;
  activePath?: string;
  ogType?: "website" | "article";
  publishedAt?: string | null;
  articleJsonLd?: string;
}

function categoryHref(category: Category): string {
  return `/category/${encodeURIComponent(category)}`;
}

export function renderLayout({
  title,
  description = SITE_DESCRIPTION,
  canonicalUrl = "https://ainews.cchk.uk/",
  activePath = "/",
  children,
  ogType = "website",
  publishedAt = null,
  articleJsonLd,
}: LayoutProps) {
  const fullTitle = title === SITE_NAME ? title : `${title}｜${SITE_NAME}`;
  return (
    <html lang="zh-HK">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <meta name="theme-color" content="#f4f0e8" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1c1a16" media="(prefers-color-scheme: dark)" />
        <title>{fullTitle}</title>
        <link rel="canonical" href={canonicalUrl} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta property="og:locale" content="zh_HK" />
        <meta property="og:type" content={ogType} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="AI 新聞．香港" />
        <meta property="og:image" content="https://ainews.cchk.uk/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://ainews.cchk.uk/og-image.png" />
        {publishedAt ? <meta property="article:published_time" content={publishedAt} /> : null}
        {articleJsonLd ? <script type="application/ld+json">{raw(articleJsonLd)}</script> : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;600;700&family=Noto+Serif+TC:wght@600;700&display=swap"
        />
        <link rel="stylesheet" href="/styles.css" />
        <script src="/client.js" defer></script>
      </head>
      <body>
        <a class="skip-link" href="#main-content">跳至主要內容</a>
        <header class="site-header">
          <div class="site-header__inner">
            <a class="brand" href="/" aria-label="返回 AI 新聞首頁">
              <span class="brand__mark" aria-hidden="true">AI</span>
              <span>
                <span class="brand__title">AI 新聞</span>
                <span class="brand__sub">香港版</span>
              </span>
            </a>
            <nav class="primary-nav" aria-label="主要導覽">
              <a class={activePath === "/" ? "is-active" : ""} href="/">首頁</a>
              <a class={activePath.startsWith("/digest") ? "is-active" : ""} href="/digest/latest">每日摘要</a>
              <a class={activePath.startsWith("/search") ? "is-active" : ""} href="/search">搜尋</a>
              <a href="/rss.xml">RSS</a>
            </nav>
          </div>
          <div class="category-nav" aria-label="新聞分類">
            {CATEGORIES.map((category) => (
              <a class={activePath.includes(category) ? "is-active" : ""} href={categoryHref(category)} key={category}>
                {category}
              </a>
            ))}
          </div>
        </header>
        <main id="main-content" class="site-main">{children as Child}</main>
        <footer class="site-footer">
          <div>
            <p class="eyebrow">編輯方法</p>
            <p>內容由公開 RSS／Atom 來源及 GDELT 發現資料整理；AI 只作摘要，原文請以來源為準。</p>
          </div>
          <p class="site-footer__note">© {new Date().getUTCFullYear()} AI 新聞．香港</p>
        </footer>
      </body>
    </html>
  );
}

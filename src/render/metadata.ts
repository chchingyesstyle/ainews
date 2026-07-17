import type { StoryRecord } from "../db/types";

export function renderArticleJsonLd(story: StoryRecord, canonicalUrl: string): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: story.headline_zh_hk,
    description: story.summary_zh_hk,
    url: canonicalUrl,
    datePublished: story.source_published_at ?? story.published_at,
    dateModified: story.updated_at,
    inLanguage: "zh-HK",
    author: {
      "@type": "Organization",
      name: story.source_name,
    },
    publisher: {
      "@type": "Organization",
      name: "AI 新聞．香港",
      url: "https://ainews.cchk.uk/",
    },
    isAccessibleForFree: true,
  };

  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

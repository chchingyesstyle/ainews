import { describe, expect, it } from "vitest";

import { renderLayout } from "../../src/render/layout";
import { StoryPage } from "../../src/render/pages/story";
import { DigestPage } from "../../src/render/pages/digest";
import type { DigestRecord, StoryRecord } from "../../src/db/types";

function buildStory(overrides: Partial<StoryRecord> = {}): StoryRecord {
  return {
    id: 1,
    ingested_item_id: 1,
    slug: "test-story",
    headline_zh_hk: "測試標題",
    summary_zh_hk: "測試摘要",
    key_facts_json: JSON.stringify(["重點一", "重點二", "重點三"]),
    category: "模型與研究",
    named_entities_json: JSON.stringify([]),
    source_name: "測試來源",
    source_url: "https://publisher.example/test",
    source_published_at: "2026-07-17T05:00:00.000Z",
    published_at: "2026-07-17T05:10:00.000Z",
    status: "published",
    model_id: "@cf/test/model",
    prompt_version: "test-v1",
    created_at: "2026-07-17T05:10:00.000Z",
    updated_at: "2026-07-17T05:10:00.000Z",
    ...overrides,
  };
}

function renderDigest(overrides: Partial<DigestRecord> = {}, stories = [buildStory()]) {
  return String(DigestPage({
    digest: {
      id: 1, digest_date: "2026-09-07", headline_zh_hk: "今日人工智能摘要（資料有限）",
      intro_zh_hk: "舊版資料有限提示", status: "partial",
      sections_json: JSON.stringify([{ category: "模型與研究", summaryZhHk: "舊版重複標題串", storyIds: [1] }]),
      model_id: "test", prompt_version: "test", published_at: null, created_at: "", updated_at: "", ...overrides,
    },
    stories, calendarYear: 2026, calendarMonth: 9, availableDates: new Set(["2026-09-07"]),
  }));
}

describe("digest reading order", () => {
  it("shows a clear page title and count without a legacy fallback headline list", () => {
    const html = renderDigest();
    expect(html).toContain("每日 AI 新聞摘要");
    expect(html).toContain("1 篇新聞");
    expect(html).not.toContain("舊版重複標題串");
    expect(html).not.toContain("舊版資料有限提示");
    expect(html).not.toContain("（資料有限）");
    expect(html).not.toContain('>分類<');
    expect(html).toContain("未提供完整總覽");
    expect(html).toContain("內容由 AI 整理，原文請以來源為準。");
    expect(html.indexOf("測試標題")).toBeLessThan(html.indexOf("測試摘要"));
    expect(html.indexOf("測試摘要")).toBeLessThan(html.indexOf("測試來源"));
  });

  it("groups by the stored story category, preserving stories missing from a digest section", () => {
    const html = renderDigest({}, [buildStory(), buildStory({ id: 2, slug: "product", category: "產品與公司", headline_zh_hk: "產品消息" })]);
    expect(html).toContain("2 篇新聞");
    expect(html).toContain("產品消息");
    expect(html).toContain('href="/category/%E7%94%A2%E5%93%81%E8%88%87%E5%85%AC%E5%8F%B8"');
    expect(html).toContain('<h3>');
  });

  it("keeps a valid published overview and section summary", () => {
    const html = renderDigest({ status: "published", headline_zh_hk: "研究新進展", intro_zh_hk: "本期研究總覽", sections_json: JSON.stringify([{ category: "模型與研究", summaryZhHk: "可靠分組摘要", storyIds: [1] }]) });
    expect(html).toContain("研究新進展");
    expect(html).toContain("本期研究總覽");
    expect(html).toContain("可靠分組摘要");
    expect(html).not.toContain("未提供完整總覽");
  });

  it("handles malformed section data without losing the linked articles", () => {
    const html = renderDigest({ status: "published", sections_json: '[null,42,{"storyIds":"bad"}]' });
    expect(html).toContain("測試標題");
  });

  it("does not present a mismatched section summary as a product overview", () => {
    const html = renderDigest({ status: "published" }, [buildStory({ category: "產品與公司" })]);
    expect(html).not.toContain("舊版重複標題串");
    expect(html).toContain("測試標題");
  });
});

describe("editorial rendering shell", () => {
  it("renders the zh-HK document shell and escapes metadata", async () => {
    const output = await renderLayout({
      title: "測試 <標題>",
      description: "描述 & 來源",
      canonicalUrl: "https://ainews.cchk.uk/story/test?a=1&b=2",
      children: "正文 <不可當 HTML>",
    });
    const html = String(output);

    expect(html).toContain('lang="zh-HK"');
    expect(html).toContain("測試 &lt;標題&gt;");
    expect(html).toContain("描述 &amp; 來源");
    expect(html).toContain("/styles.css");
    expect(html).toContain("正文 &lt;不可當 HTML&gt;");
    expect(html).not.toContain("<不可當 HTML>");
  });

  it("supports light and dark theme colors, webfonts, and a favicon", async () => {
    const output = await renderLayout({
      title: "測試",
      children: "正文",
    });
    const html = String(output);

    expect(html).toContain('<meta name="theme-color" content="#f4f0e8" media="(prefers-color-scheme: light)"');
    expect(html).toContain('<meta name="theme-color" content="#1c1a16" media="(prefers-color-scheme: dark)"');
    expect(html).toContain(
      'href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;600;700&amp;family=Noto+Serif+TC:wght@600;700&amp;display=swap"',
    );
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg"');
  });
});

describe("story page entity tags", () => {
  it("renders a linked tag for each named entity", () => {
    const html = String(
      StoryPage({
        story: buildStory({ named_entities_json: JSON.stringify(["OpenAI", "Example Lab"]) }),
        related: [],
      }),
    );

    expect(html).toContain('href="/tag/OpenAI"');
    expect(html).toContain('href="/tag/Example%20Lab"');
  });

  it("omits the tags section when a story has no named entities", () => {
    const html = String(
      StoryPage({
        story: buildStory({ named_entities_json: JSON.stringify([]) }),
        related: [],
      }),
    );

    expect(html).not.toContain("entity-tags");
  });
});

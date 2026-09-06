import { describe, expect, it } from "vitest";

import { renderLayout } from "../../src/render/layout";
import { StoryPage } from "../../src/render/pages/story";
import type { StoryRecord } from "../../src/db/types";

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

import { describe, expect, it } from "vitest";

import { renderLayout } from "../../src/render/layout";

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
});

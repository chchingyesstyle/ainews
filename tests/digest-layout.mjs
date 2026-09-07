import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// First-time setup: npx playwright install chromium. Run with npm run test:layout.

test('digest keeps its calendar beside the desktop introduction and shows full summaries', async () => {
  const summary = '這是一段需要完整顯示的新聞摘要，包含研究方法、結果及資料限制。'.repeat(30);
  const bundle = await build({
    stdin: {
      contents: `import { DigestPage } from './src/render/pages/digest';
        export const render = (summary) => String(DigestPage({
          digest: { digest_date: '2026-09-07', headline_zh_hk: '今日人工智能摘要（資料有限）',
            intro_zh_hk: '今日可供整理的有效新聞資料有限，以下只列出已成功整理的內容。',
            sections_json: JSON.stringify([{ category: '模型與研究', summaryZhHk: summary, storyIds: [] }]) },
          stories: [], calendarYear: 2026, calendarMonth: 9, availableDates: new Set(['2026-09-07'])
        }));`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
  });
  const { render } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const css = await readFile('public/styles.css', 'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<style>${css}</style><main class="site-main">${render(summary)}</main>`);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('.page-header').getBoundingClientRect();
        const calendar = document.querySelector('.digest-calendar').getBoundingClientRect();
        const summary = document.querySelector('.section-heading__summary');
        return { header: header.toJSON(), calendar: calendar.toJSON(),
          summaryHeight: summary.clientHeight, summaryScrollHeight: summary.scrollHeight,
          pageWidth: document.documentElement.scrollWidth };
      });
      assert.ok(geometry.summaryScrollHeight <= geometry.summaryHeight + 1, `summary is clipped at ${width}px`);
      assert.ok(geometry.pageWidth <= width, `horizontal overflow at ${width}px`);
      if (width === 1440) {
        assert.ok(geometry.calendar.x >= geometry.header.right, 'desktop calendar should sit beside the introduction');
        assert.ok(Math.abs(geometry.calendar.y - geometry.header.y) < 2, 'desktop calendar should align with the introduction');
      } else {
        assert.ok(geometry.calendar.y >= geometry.header.bottom, 'narrow layout should stack the calendar');
      }
    }
  } finally {
    await browser.close();
  }
});

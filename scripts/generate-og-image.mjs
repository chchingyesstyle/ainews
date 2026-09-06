// Regenerate with: node scripts/generate-og-image.mjs
// Rasterizes the site's static social preview card (public/og-image.png).
// Requires a Traditional Chinese font available to the OS (e.g. Microsoft JhengHei on Windows).
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const OUTPUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "og-image.png");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f4f0e8"/>
  <rect x="24" y="24" width="${WIDTH - 48}" height="${HEIGHT - 48}" fill="none" stroke="#b64a3b" stroke-width="3"/>
  <rect x="90" y="96" width="88" height="88" fill="#f4f0e8" stroke="#b64a3b" stroke-width="3"/>
  <text x="134" y="152" text-anchor="middle" font-family="'Noto Sans TC','Microsoft JhengHei',sans-serif" font-size="34" font-weight="700" fill="#b64a3b">AI</text>
  <text x="90" y="300" font-family="'Noto Serif TC','Microsoft JhengHei',serif" font-size="88" font-weight="700" fill="#20252a">AI 新聞．香港</text>
  <text x="90" y="380" font-family="'Noto Sans TC','Microsoft JhengHei',sans-serif" font-size="32" fill="#6b6e6c">每日香港繁體中文 AI 新聞摘要</text>
  <text x="90" y="520" font-family="'Noto Sans TC','Microsoft JhengHei',sans-serif" font-size="24" fill="#b64a3b">ainews.cchk.uk</text>
</svg>
`;

await writeFile(OUTPUT_PATH, await sharp(Buffer.from(svg)).png().toBuffer());
console.log(`Wrote ${OUTPUT_PATH}`);

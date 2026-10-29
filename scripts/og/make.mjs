// `npm run og`: serves scripts/og/og.html with Vite, screenshots it headless, and writes
// public/og.png; then rasterises scripts/og/icon.svg into the app icons. Run by hand when the
// look changes; the PNGs are committed. Never headed.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = new URL('../../', import.meta.url).pathname;
const server = await createServer({ root, server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('http://localhost:5198/scripts/og/og.html');
  await page.waitForSelector('body[data-ready]', { timeout: 30_000 });
  await page.screenshot({ path: `${root}public/og.png`, clip: { x: 0, y: 0, width: 1200, height: 630 } });

  // Icons: the same SVG at each size, opaque (the background is in the drawing). The maskable
  // one is the same picture, full-bleed: the drawing already sits inside the central 80% circle
  // (the farthest ball edge is 38 of 40 units from the centre).
  const svg = await readFile(`${root}scripts/og/icon.svg`, 'utf8');
  const icons = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512 };
  for (const [name, size] of Object.entries(icons)) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await writeFile(`${root}public/${name}`, await p.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}

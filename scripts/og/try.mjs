import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const server = await createServer({ root: process.cwd(), server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
for (const lead of process.argv.slice(2)) {
  await p.goto(`http://localhost:5199/scripts/og/og.html?bpm=${process.env.BPM}&lead=${lead}`);
  await p.waitForSelector('body[data-ready]', { timeout: 15000 });
  await p.screenshot({ path: `${process.env.OUT}/try-${lead}.png`, clip: { x: 0, y: 0, width: 1200, height: process.env.FULL ? 630 : 310 } });
}
await b.close();
await server.close();

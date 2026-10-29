// Link preview, app icon and installability: the manifest parses and every icon it lists is
// served, og.png is the size the head says, and the head carries the sharing tags.
import { expect, test } from './fixtures';

interface Icon {
  src: string;
  sizes: string;
  purpose?: string;
}

test('the manifest loads and every icon it lists returns 200', async ({ page, request }) => {
  await page.goto('/#v1.e30');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const res = await request.get(href as string);
  expect(res.status()).toBe(200);
  const m = (await res.json()) as Record<string, unknown> & { icons: Icon[] };
  expect(m).toMatchObject({
    name: 'anomatom',
    short_name: 'anomatom',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0e1013',
    theme_color: '#0e1013',
  });
  expect(m.icons.map((i) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`)).toEqual([
    '192x192',
    '512x512',
    '512x512 maskable',
  ]);
  for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
});

test('the touch icon and the favicon are served', async ({ page, request }) => {
  await page.goto('/#v1.e30');
  for (const sel of ['link[rel="apple-touch-icon"]', 'link[rel="icon"]']) {
    const href = await page.locator(sel).getAttribute('href');
    expect((await request.get(href as string)).status()).toBe(200);
  }
});

test('og.png is served at 1200 by 630', async ({ request }) => {
  const res = await request.get('/og.png');
  expect(res.status()).toBe(200);
  const png = await res.body();
  // PNG signature, then the IHDR chunk: width and height as big-endian 32-bit ints at 16 and 20.
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});

test('the head carries the sharing tags', async ({ page }) => {
  await page.goto('/#v1.e30');
  const meta = (attr: 'name' | 'property', key: string) =>
    page.locator(`meta[${attr}="${key}"]`).getAttribute('content');
  const description = 'Type a juggling pattern. anomatom juggles it and plays it as a drum machine, from one clock.';
  expect(await meta('name', 'description')).toBe(description);
  expect(await meta('property', 'og:title')).toBe('anomatom');
  expect(await meta('property', 'og:description')).toBe(description);
  expect(await meta('property', 'og:url')).toBe('https://anomatom.com/');
  expect(await meta('property', 'og:type')).toBe('website');
  expect(await meta('property', 'og:image')).toBe('https://anomatom.com/og.png');
  expect(await meta('property', 'og:image:width')).toBe('1200');
  expect(await meta('property', 'og:image:height')).toBe('630');
  expect(await meta('property', 'og:image:alt')).toBeTruthy();
  expect(await meta('name', 'twitter:card')).toBe('summary_large_image');
  expect(await meta('name', 'theme-color')).toBe('#0e1013');
  expect(await meta('name', 'apple-mobile-web-app-capable')).toBe('yes');
});

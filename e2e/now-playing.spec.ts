// The now-playing strip and the way back (v3 stream C2, ruling 4): kit, sound and tempo on the card
// screen, "All sound settings", and the sheet's Patterns control.
import { expect, isCdnError, test } from './fixtures';
import type { Page } from './fixtures';

const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const bpmOf = async (page: Page) => Number((await page.locator('.fm-bpm').textContent())?.replace(/\D/g, ''));
const hashOf = (page: Page) => page.evaluate(() => location.hash);
/** The bpm the share hash carries (`#v2.` is base64url JSON), or null while the hash is not a v2 link. */
const hashBpm = (page: Page) =>
  page.evaluate(() => {
    const m = /^#v2\.(.+)$/.exec(location.hash);
    if (!m) return null;
    try {
      return (JSON.parse(atob((m[1] as string).replace(/-/g, '+').replace(/_/g, '/'))) as { t: number }).t;
    } catch {
      return null;
    }
  });

const SIZES = [
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1280x800', width: 1280, height: 800 },
];

for (const size of SIZES) {
  test(`kit, sound, tempo, all sound settings and Patterns at ${size.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await page.locator('.fm-card[data-id="classic"]').click();
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
    await expect(page.locator('.fm-card[data-id="classic"]')).toHaveClass(/fm-playing/);
    await page.screenshot({ path: `e2e/shots/strip-${size.name}.png` });

    // Kit: the hash carries it and the music keeps playing.
    const before = await hashOf(page);
    await page.locator('.fm-kit').selectOption('LM-2');
    await expect(page.locator('.fm-kit')).toHaveValue('LM-2');
    await expect.poll(() => hashOf(page)).not.toBe(before);
    await expect.poll(() => hashOf(page)).toContain('v2.');
    const afterKitHash = await hashOf(page);
    const afterKit = await scheduled(page);
    await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(afterKit);

    // Space still plays and pauses after a select change.
    await page.keyboard.press('Space');
    await expect(page.locator('.fm-card[data-id="classic"]')).not.toHaveClass(/fm-playing/);
    await page.keyboard.press('Space');
    await expect(page.locator('.fm-card[data-id="classic"]')).toHaveClass(/fm-playing/);

    await page.locator('.fm-sound').selectOption('height-pitch');
    await expect(page.locator('.fm-sound')).toHaveValue('height-pitch');
    await expect.poll(() => hashOf(page)).not.toBe(afterKitHash);
    const afterSound = await scheduled(page);
    await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(afterSound);

    // Tempo: two presses of + move the readout and the hash by one step each.
    const bpm = await bpmOf(page);
    await page.locator('.fm-faster').click();
    await page.locator('.fm-faster').click();
    await expect.poll(() => bpmOf(page)).toBe(bpm + 10);
    await expect.poll(() => hashBpm(page)).toBe(bpm + 10);

    // All sound settings: the Sound tab, same kit and preset.
    await page.locator('.fm-all-sound').click();
    await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
    await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#sp-kit')).toHaveValue('LM-2');
    await expect(page.locator('#sp-preset')).toHaveValue('height-pitch');
    await expect(page.locator('#bpm')).toHaveValue(String(bpm + 10));

    await page.screenshot({ path: `e2e/shots/sheet-patterns-${size.name}.png` });

    // Patterns: back to the cards, 531 (the `classic` card) still lit and still playing.
    await page.locator('#patterns').click();
    await expect(page.locator('#app')).toHaveClass(/is-first-minute/);
    await expect(page.locator('.fm-card[data-id="classic"]')).toHaveClass(/fm-playing/);
    await expect(page.locator('.fm-kit')).toHaveValue('LM-2');
    const playing = await scheduled(page);
    await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(playing);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);

    expect(errors).toEqual([]);
  });
}

test('a passing card reads Mixed; choosing a kit sets every part; a link skips the cards until Patterns', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('.fm-card[data-id="passing"]').click();
  await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
  await expect(page.locator('.fm-kit')).toHaveValue('mixed');

  await page.locator('.fm-kit').selectOption('LM-2');
  await expect(page.locator('.fm-kit')).toHaveValue('LM-2');
  await page.locator('.fm-all-sound').click();
  await expect(page.locator('#sp-kit-0')).toHaveValue('LM-2');
  await expect(page.locator('#sp-kit-1')).toHaveValue('LM-2');

  await expect.poll(() => hashOf(page)).toContain('v2.');
  await page.reload();
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
  await page.locator('#patterns').click();
  await expect(page.locator('#app')).toHaveClass(/is-first-minute/);
  await expect(page.locator('.fm-card[data-id="passing"]')).toBeVisible();
  expect(errors).toEqual([]);
});

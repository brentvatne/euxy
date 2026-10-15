import { expect } from 'e2e';
import { describe, test } from '@e2e-dev/web';

import { encodePattern, type SharedLane } from '@/core/share-codec';

// The website in web/, served from a production export: the landing page,
// shared-pattern links, channel links, and the API routes behind them.

const lane = (name: string, note: number, pulses: number): SharedLane => ({
  name,
  length: 16,
  genA: { pulses, rotation: 0 },
  genB: { pulses: 0, rotation: 0 },
  op: 'OR',
  trackRot: 0,
  note,
  channel: 0,
  velocity: 100,
  gateMs: 50,
  resolutionTicks: 6,
});

const payload = encodePattern({
  name: 'E2E Groove',
  bpm: 98,
  baseResolutionTicks: 6,
  icon: 'heart',
  lanes: [lane('Kick', 36, 4), lane('Snare', 38, 2), lane('Hat', 42, 7)],
});

// API routes are fetched directly; `baseUrl` ends in a slash.
const url = (base: string | undefined, path: string) => new URL(path, base).href;

describe('website', { platforms: ['web'] }, () => {
  test('the landing page plays presets', async ({ app, screen, browser }) => {
    await app.open('/');
    await expect(browser).toHaveTitle(/euxy/);
    await expect(screen.getByText('euxy', { exact: true }).first()).toBeVisible();
    await expect(screen.getByRole('link', 'Join the TestFlight beta')).toBeVisible();

    const play = screen.getByRole('button', 'Play');
    await play.click();
    await expect(screen.getByRole('button', 'Stop')).toBeVisible();
    await screen.getByRole('button', 'Stop').click();
    await expect(play).toBeVisible();
  });

  test('picking a preset selects it and lands in the URL', async ({ app, screen, browser }) => {
    await app.open('/');
    await screen.getByRole('button', /^See all \d+ presets$/).click();
    const fourOnTheFloor = screen.getByRole('button', 'Four on the Floor');
    await fourOnTheFloor.click();
    await expect(fourOnTheFloor).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.getByRole('button', 'Lo-Fi Bounce')).toHaveAttribute('aria-pressed', 'false');
    await expect(browser).toHaveURL(/[?&]preset=house\b/);
  });

  test('the example link opens a shared pattern', async ({ app, screen, browser }) => {
    await app.open('/');
    await screen.getByRole('link', 'Open an example shared link').click();
    await expect(screen.getByText(/\d+ LANES · \d+ BPM · \d+ STEPS/)).toBeVisible();
    // The page swaps ?d= for the canonical /p/<payload> form.
    await expect(browser).toHaveURL(/\/p\/[A-Za-z0-9_-]+$/);
  });

  test('a shared link shows and plays its pattern', async ({ app, screen, browser }) => {
    await app.open(`/p?d=${payload}`);
    await expect(screen.getByText('E2E Groove', { exact: true })).toBeVisible();
    await expect(screen.getByText('3 LANES · 98 BPM · 16 STEPS')).toBeVisible();
    await expect(browser).toHaveTitle('E2E Groove — euxy');
    await expect(browser).toHaveURL(new RegExp(`/p/${payload}$`));

    await screen.getByRole('button', 'Play').click();
    await expect(screen.getByRole('button', 'Stop')).toBeVisible();
  });

  test('a damaged shared link says so', async ({ app, screen }) => {
    await app.open('/p?d=not-a-pattern');
    await expect(screen.getByText('This link didn’t decode')).toBeVisible();
    await expect(screen.getByRole('link', 'euxy home')).toBeVisible();
  });

  test('an unknown path is a not-found page', async ({ app, screen }) => {
    await app.open('/no-such-page');
    await expect(screen.getByText('Page could not be found')).toBeVisible();
  });

  test('the privacy page renders', async ({ app, screen, browser }) => {
    await app.open('/privacy');
    await expect(browser).toHaveTitle('privacy — euxy');
    await expect(screen.getByText('What euxy collects: nothing personal')).toBeVisible();
  });

  test('a channel link explains itself', async ({ app, screen }) => {
    await app.open('/c/pr-157');
    await expect(screen.getByRole('heading', 'pr-157')).toBeVisible();
    await expect(screen.getByRole('link', 'Open in euxy')).toHaveAttribute('href', 'euxy://c/pr-157');
  });

  test('crawlers get per-pattern tags from /p/<payload>', async ({ app }) => {
    const res = await fetch(url(app.baseUrl, `/p/${payload}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta property="og:title" content="E2E Groove — a euxy pattern">');
    expect(html).toContain('3 lanes · 98 BPM · 16 steps');
    expect(html).toContain(`/og/${payload}.png`);
    // Humans move on to the interactive page.
    expect(html).toContain(`location.replace("${url(app.baseUrl, `/p?d=${payload}`)}")`);
  });

  test('API routes refuse what they would echo unsafely', async ({ app }) => {
    expect((await fetch(url(app.baseUrl, `/p/${encodeURIComponent('<script>')}`))).status).toBe(404);
    expect((await fetch(url(app.baseUrl, `/c/${encodeURIComponent('bad channel!')}`))).status).toBe(404);
    expect((await fetch(url(app.baseUrl, `/qr/${encodeURIComponent('bad channel!')}.png`))).status).toBe(404);
  });

  test('a channel QR code is a PNG', async ({ app }) => {
    const res = await fetch(url(app.baseUrl, '/qr/pr-157.png'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // "PNG"
  });
});

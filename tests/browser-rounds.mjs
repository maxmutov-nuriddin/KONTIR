// Real renderer + sockets: the last survivor, spectator camera and consecutive rounds.
// Run after npm run build: npm run test:browser:rounds
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createGameServer } from '../server/server.js';

const data = await mkdtemp(join(tmpdir(), 'kontir-rounds-'));
const server = await createGameServer({ port: 0, host: '127.0.0.1', quiet: true,
  accountsFile: join(data, 'accounts.json'), timing: { warmup: 60, freeze: 120, round: 60, post: 0.5 } });
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = []; let loads = 0;
  page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR:', e.message); });
  page.on('load', () => loads++);
  await page.addInitScript(() => {
    localStorage.setItem('kontir.quality', 'low'); localStorage.setItem('kontir.adaptive', '0');
    sessionStorage.setItem('kontir.guest', '1');
  });
  await page.goto(`http://127.0.0.1:${server.port}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#loader').waitFor({ state: 'detached', timeout: 120000 });
  await page.click('#play-nav'); await page.click('[data-mode="practice"]'); await page.click('#go');
  await page.waitForFunction(() => window.__KONTIR__?.playing, null, { timeout: 120000 });
  const id = await page.evaluate(() => window.__KONTIR__.id);
  const room = [...server.rooms.values()].find(r => r.players.has(id)), human = room.players.get(id);
  // Keep bots at spawn, outside visibility, so death exercises the anti-wallhack interpolation boundary.
  for (const p of room.players.values()) if (p.bot) p.brain.command = () => ({ ...p.cmd, fire: false, forward: 0, right: 0 });
  const rendered = async () => {
    const before = await page.evaluate(() => window.__KONTIR__.world.time);
    await page.waitForFunction(t => window.__KONTIR__.world.time > t + 0.1, before, { timeout: 15000 });
    assert.deepEqual(errors, [], 'game renders without uncaught errors');
  };
  for (let round = 1; round <= 4; round++) {
    await page.waitForFunction(n => window.__KONTIR__.state.round === n && window.__KONTIR__.state.phase === 'buy', round);
    room.beginLive();
    for (const p of room.players.values()) if (p !== human && p.team === human.team) room.damage(p, null, 1000, 0, 'world', false);
    await page.waitForFunction(() => {
      const s = window.__KONTIR__, me = s.state.players.find(p => p.id === s.id);
      return s.state.phase === 'live' && s.state.players.filter(p => p.team === me.team && p.alive).length === 1;
    });
    await rendered();
    if (round % 2) {
      assert.ok(room.snapshot(id).players.some(p => p.alive && p.team !== human.team && !p.char), 'enemies are hidden before death');
      room.damage(human, null, 1000, 0, 'world', false);
    } else {
      for (const p of room.players.values()) if (p.team !== human.team) room.damage(p, null, 1000, 0, 'world', false);
    }
    await page.waitForFunction(n => window.__KONTIR__.state.round > n, round);
    await rendered();
    console.log(`PASS: round ${round}, last survivor ${round % 2 ? 'dies and spectates' : 'wins'}`);
  }
  assert.equal(loads, 1, 'the page did not reload during the match');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close(); await server.close(); await rm(data, { recursive: true, force: true });
}

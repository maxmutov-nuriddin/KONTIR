// End-to-end friends check with two isolated browsers: register, search, request, accept, direct message and a
// WebRTC voice call (fake microphone). Starts its own server with a throwaway accounts file.
//   CHROME_PATH=/path/to/chrome node tests/browser-friends.mjs
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/server.js';

const server = await createGameServer({ port: 0, host: '127.0.0.1', quiet: true, accountsFile: join(await mkdtemp(join(tmpdir(), 'kontir-fr-')), 'accounts.json') });
const launch = { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] };
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launch);
const errors = [];
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('kontir.quality', 'low'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(e.message); console.error(name, 'PAGE ERROR', e.message); });
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.locator('#loader').waitFor({ state: 'detached', timeout: 120000 });
  await page.click('[data-am="register"]');
  await page.fill('#auth-user', name); await page.fill('#auth-pass', 'secret123'); await page.fill('#auth-pass2', 'secret123'); await page.click('#auth-submit');
  await page.waitForFunction(u => document.querySelector('#account-btn').textContent === u, name);
  return page;
}
try {
  const a = await player('Lochin'), b = await player('Burgut');
  // A finds B and sends a request
  await a.click('#friends-toggle'); await a.fill('#fr-q', 'burg'); await a.click('.fr-search button');
  await a.click('[data-add="Burgut"]');
  // B sees the badge, accepts
  await b.locator('#friends-toggle .badge').waitFor({ timeout: 10000 });
  await b.click('#friends-toggle'); await b.click('[data-accept="Lochin"]');
  await a.locator('.fr-row.lobby', { hasText: 'Burgut' }).waitFor({ timeout: 10000 });
  // direct message A -> B
  await a.click('#friends [data-chat="Burgut"]'); await a.fill('#fr-text', 'salom, o‘ynaymizmi?'); await a.press('#fr-text', 'Enter');
  await a.locator('.msg.me', { hasText: 'salom' }).waitFor({ timeout: 10000 });
  await b.click('#friends [data-chat="Lochin"]');
  await b.locator('.msg', { hasText: 'o‘ynaymizmi' }).waitFor({ timeout: 10000 });
  // voice call A -> B
  await a.click('#friends header [data-call="Burgut"]');
  await b.locator('#call-bar [data-acc]').waitFor({ timeout: 10000 }); await b.click('#call-bar [data-acc]');
  for (const p of [a, b]) await p.waitForFunction(() => document.querySelector('#call-bar')?.textContent.startsWith('🎙') && !document.querySelector('#call-bar').textContent.includes('…'), null, { timeout: 20000 });
  await a.click('#call-bar [data-end]');
  await b.waitForFunction(() => document.querySelector('#call-bar').hidden, null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log('PASS: friends search/request/accept, presence, direct messages, WebRTC voice call');
} finally { await browser.close(); await server.close(); }

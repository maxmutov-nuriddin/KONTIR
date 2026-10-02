// End-to-end browser check against a running server (npm start after npm run build, or npm run dev).
//   BASE_URL=http://localhost:3101 npm run test:browser
// Start the server with KONTIR_TIMING='{"freeze":45}' so the buy phase outlasts the software-GL frame rate.
// Uses software GL, so it is slow but exercises the real renderer, prediction, weapons and network.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3101';
await mkdir('test-results', { recursive: true });
const launch = { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] };
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH; else if (process.env.BROWSER_CHANNEL) launch.channel = process.env.BROWSER_CHANNEL;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(q => { try { localStorage.setItem('kontir.quality', q); localStorage.setItem('kontir.adaptive', '0'); } catch { /* ignore */ } }, process.env.QUALITY || 'low');
const errors = [];
const k = (page, fn, arg) => page.evaluate(fn, arg);
async function open() {
  const started = Date.now(), page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error' && /THREE|WebGL|shader/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR', e.message); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__KONTIR__, null, { timeout: 90000 });
  await page.locator('#loader').waitFor({ state: 'detached', timeout: 120000 });
  console.log(`Menu ready in ${Date.now() - started} ms (software GL)`);
  // first launch offers sign-in / register / demo (a saved account token skips it)
  if (await page.locator('#auth-demo').isVisible()) await page.click('#auth-demo');
  return page;
}
const me = page => k(page, () => { const s = window.__KONTIR__; return s.state.players.find(p => p.id === s.id); });
try {
  const page = await open();
  await page.screenshot({ path: 'test-results/menu.png' });
  assert.equal(await page.locator('[data-map]').count() >= 2, true, 'menu lists the manifest maps');
  // language switch (uz -> en -> uz) and account registration (server-side profile, name fixed to the username)
  await page.selectOption('#lang', 'en'); assert.equal((await page.locator('#play-nav').textContent()).trim(), 'PLAY'); await page.selectOption('#lang', 'uz');
  assert.equal((await page.locator('#play-nav').textContent()).trim(), 'O‘YNASH');
  const user = `smoke${Date.now().toString(36).slice(-8)}`;
  await page.click('#account-btn'); await page.click('[data-am="register"]');
  await page.fill('#auth-user', user); await page.fill('#auth-pass', 'secret123'); await page.fill('#auth-pass2', 'secret123'); await page.click('#auth-submit');
  await page.waitForFunction(u => document.querySelector('#account-btn').textContent === u, user);
  assert.equal(await page.locator('#lobby-name').isDisabled(), true);
  await page.click('#guide-nav'); assert.ok(await page.locator('.control-grid').isVisible()); await page.click('#close');

  await page.click('#settings');
  await page.click('[data-fps="120"]'); assert.equal(await k(page, () => window.__KONTIR__.fpsLimit), 120);
  await page.click('[data-fps="60"]'); assert.equal(await k(page, () => window.__KONTIR__.fpsLimit), 60);
  await page.click('[data-q="crisp"]'); assert.equal(await k(page, () => window.__KONTIR__.world.qualityName), 'crisp');
  await page.click('#close');
  await page.evaluate(async () => {
    const world = window.__KONTIR__.world;
    for (const quality of ['high', 'ultra', 'crisp', 'medium', 'low', 'high', 'crisp', 'medium', 'low']) {
      world.setQuality(quality);
      await world.renderer.compileAsync(world.scene, world.camera);
      world.render(1 / 60, false);
    }
  });
  assert.deepEqual(errors, [], 'quality switches compile and render without shader errors');
  await page.click('#play-nav'); await page.click('[data-mode="practice"]');
  await page.click('#go');
  await page.waitForFunction(() => window.__KONTIR__.playing, null, { timeout: 90000 });
  assert.equal((await k(page, () => window.__KONTIR__.state.players.length)), 10, 'practice fills 5v5 with bots');
  if (!(await k(page, () => window.__KONTIR__.controller.locked))) await page.mouse.click(640, 300);
  await page.waitForFunction(() => window.__KONTIR__.controller.locked);
  await page.waitForFunction(() => window.__KONTIR__.state.phase === 'buy');

  // --- buy menu (T starts with $800: kevlar is affordable)
  await page.keyboard.press('KeyB'); await page.locator('.buy-cols').waitFor();
  await page.click('[data-buy="kevlar"]');
  await page.waitForFunction(() => window.__KONTIR__.state.players.find(p => p.id === window.__KONTIR__.id).armor === 100);
  await page.keyboard.press('Escape');                                   // closes the buy menu; the game tries to re-capture the mouse
  await page.waitForFunction(() => !document.querySelector('dialog').open);
  // either the game re-captured the mouse or it shows the resume button (pointer lock can be refused without a gesture)
  for (let i = 0; i < 20 && !(await k(page, () => window.__KONTIR__.controller.locked)); i++) {
    if (await page.locator('#lock').isVisible()) await page.click('#lock', { timeout: 2000 }).catch(() => {}); else if (!(await k(page, () => window.__KONTIR__.controller.locked))) await page.mouse.click(640, 300);
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__KONTIR__.controller.locked);

  // --- weapon slots + 'Q' quick switch through the real input path
  const cur = () => k(page, () => [window.__KONTIR__.inventory.current, window.__KONTIR__.inventory.previous]);
  await page.keyboard.press('Digit3'); await page.waitForFunction(() => window.__KONTIR__.inventory.current === 3);
  await page.keyboard.press('Digit2'); await page.waitForFunction(() => window.__KONTIR__.inventory.current === 2);
  assert.deepEqual(await cur(), [2, 3]);
  await page.keyboard.press('KeyQ'); await page.waitForFunction(() => window.__KONTIR__.inventory.current === 3);
  await page.keyboard.press('KeyQ'); await page.waitForFunction(() => window.__KONTIR__.inventory.current === 2);
  // the C4 goes to a random terrorist each round: only the carrier can select slot 5
  if (await k(page, () => !!window.__KONTIR__.weapons.inventory.weaponId(5))) {
    await page.keyboard.press('Digit5'); await page.waitForFunction(() => window.__KONTIR__.inventory.current === 5);
    assert.deepEqual(await k(page, () => window.__KONTIR__.visibleRigs), ['c4'], 'only the active weapon mesh is visible');
    await page.keyboard.press('KeyQ'); await page.waitForFunction(() => window.__KONTIR__.inventory.current === 2);
  }
  assert.deepEqual(await k(page, () => window.__KONTIR__.visibleRigs), ['glock']);
  await page.screenshot({ path: 'test-results/buy-phase.png' });

  // --- live round: movement speeds & crouch camera
  await page.waitForFunction(() => window.__KONTIR__.state.phase === 'live', null, { timeout: 40000 });
  // software GL runs at a few FPS, so wait on conditions instead of fixed sleeps
  const untilSpeed = (target, tol) => page.waitForFunction(([t, e]) => { const p = window.__KONTIR__.predicted, v = Math.hypot(p.vx, p.vz) / 0.0254; return Math.abs(v - t) < e; }, [target, tol], { timeout: 45000 });
  const untilEye = (target) => page.waitForFunction(t => { const s = window.__KONTIR__; return Math.abs(s.eye[1] - s.predicted.y - t) < 0.025; }, target, { timeout: 45000 });
  await page.keyboard.press('Digit3'); // knife: full 250 u/s (guns slow you down)
  await page.keyboard.down('KeyW'); await untilSpeed(250, 8);
  await page.keyboard.down('ShiftLeft'); await untilSpeed(130, 6);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.down('ControlLeft'); await untilSpeed(85, 6);   // realistic crouch-walk
  await page.keyboard.up('KeyW');
  await untilEye(1.05);
  await page.keyboard.up('ControlLeft'); await untilEye(1.65);
  await page.waitForFunction(() => window.__KONTIR__.crouchFactor < 0.05, null, { timeout: 15000 });

  // --- firing: ammo, recoil pattern
  await page.keyboard.press('Digit2'); await page.waitForFunction(() => window.__KONTIR__.inventory.current === 2 && !window.__KONTIR__.weapons.inventory.drawing);
  const ammo0 = (await k(page, () => window.__KONTIR__.inventory.ammo.glock.mag));
  await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
  await page.waitForFunction(a => window.__KONTIR__.inventory.ammo.glock.mag < a, ammo0);
  await page.screenshot({ path: 'test-results/game.png' });
  await page.keyboard.down('Tab'); assert.ok(await page.locator('#scoreboard').isVisible()); await page.keyboard.up('Tab');
  // --- comms: Y opens all-chat (server echoes it back), Z + digit sends a radio call
  await page.keyboard.press('KeyY'); await page.locator('#chat-input').waitFor({ state: 'visible' });
  await page.keyboard.type('salom jamoa'); await page.keyboard.press('Enter');
  await page.locator('#chat-log', { hasText: 'salom jamoa' }).waitFor({ timeout: 10000 });
  if (!(await k(page, () => window.__KONTIR__.controller.locked))) { await page.mouse.click(640, 300); }
  if (await k(page, () => window.__KONTIR__.controller.locked)) {
    await page.keyboard.press('KeyZ'); await page.locator('#radio-menu').waitFor({ state: 'visible' });
    await page.keyboard.press('Digit1'); await page.locator('#chat-log .cl', { hasText: '(radio)' }).waitFor({ timeout: 10000 });
  }
  console.log('PASS: menu, practice 5v5, buy, slots + Q quick-switch, speeds 250/130/85, crouch eye 1.65 -> 1.05, firing, scoreboard, chat/radio');

  // --- two humans: strict team allocation over real sockets
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__KONTIR__.controller.locked);
  await page.click('#leave');
  const other = await open(); const code = `K${Date.now().toString(36).slice(-6)}`.toUpperCase();
  for (const [tab, name] of [[page, 'HOST'], [other, 'GUEST']]) {
    if (!(await tab.locator('#online').isVisible())) await tab.click('#play-nav');
    await tab.click('#online'); await tab.fill('#operator-name', name); await tab.fill('#room-input', code); await tab.click('#join-submit');
    await tab.waitForFunction(() => window.__KONTIR__.playing, null, { timeout: 60000 });
  }
  await page.waitForFunction(() => window.__KONTIR__.state.players.length === 2);
  assert.equal(await k(page, () => new Set(window.__KONTIR__.state.players.map(p => p.team)).size), 2, 'teams balanced');
  await page.locator('#leave-lobby:visible, #leave:visible').first().click(); await other.waitForFunction(() => window.__KONTIR__.state.players.length === 1);
  console.log('PASS: two-client lobby with balanced T/CT');
  assert.deepEqual(errors, []);
} catch (error) {
  const page = context.pages().at(-1); if (page) { await page.screenshot({ path: 'test-results/error.png' }).catch(() => {}); console.error(await page.evaluate(() => { const s = window.__KONTIR__; return JSON.stringify({ playing: s?.playing, locked: s?.controller.locked, modal: document.querySelector('#modal')?.open, resumeHidden: document.querySelector('#resume')?.className, phase: s?.state?.phase, inv: s?.inventory && [s.inventory.current, s.inventory.previous] }); }).catch(() => '')); }
  throw error;
} finally { await browser.close(); }

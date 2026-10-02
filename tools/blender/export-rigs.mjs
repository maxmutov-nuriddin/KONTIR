// Exports the game's procedural weapon rigs to tools/blender/rigs/<id>.glb (input for weapons_bake.py).
// Usage: npx vite (dev server on :5190) in another shell, then: node tools/blender/export-rigs.mjs [id ...]
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), out = resolve(here, 'rigs');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
const page = await browser.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto(process.env.VITE_URL || 'http://localhost:5190/viewer.html?w=knife');
const helper = '/@fs' + resolve(here, 'rigexport.js');
// first import makes Vite pre-bundle GLTFExporter and reload the page; wait it out
await page.evaluate(h => import(h).catch(() => null), helper).catch(() => null);
await page.waitForTimeout(4000); await page.goto(page.url()); await page.waitForTimeout(1500);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : await page.evaluate(async h => (await import(h)).ids, helper);
for (const id of ids) {
  const b64 = await page.evaluate(async ([h, id]) => (await import(h)).exportRig(id), [helper, id]);
  await writeFile(resolve(out, `${id}.glb`), Buffer.from(b64, 'base64'));
  console.log('rig', id);
}
await browser.close();

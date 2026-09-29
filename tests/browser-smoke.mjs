import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),errors=[];
async function open(){const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR',error.message);});await page.goto('http://localhost:5190',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__KONTIR__);await page.locator('#loader').waitFor({state:'detached'});return page;}
async function unlock(page){await page.evaluate(()=>document.exitPointerLock());}
try{
  const page=await open();await page.screenshot({path:'test-results/menu.png'});
  await page.click('[data-map="harbor"]');await page.click('[data-map="sahara"]');
  await page.click('#guide-nav');assert.ok(await page.locator('.control-grid').isVisible());await page.click('#close');
  await page.click('#practice');await page.waitForFunction(()=>window.__KONTIR__.playing);
  await page.click('#lock');await page.waitForFunction(()=>document.pointerLockElement!==null);
  await page.keyboard.press('KeyB');assert.ok(await page.locator('.buy-list').isVisible());await page.click('[data-buy="armor"]');
  await page.waitForFunction(()=>window.__KONTIR__.state.players.find(p=>p.id===window.__KONTIR__.id).armor===100);
  await page.click('#lock');await page.waitForFunction(()=>window.__KONTIR__.state?.phase==='live',{},{timeout:20000});
  const z=await page.evaluate(()=>window.__KONTIR__.predicted.z);
  await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
  assert.ok(await page.evaluate(old=>window.__KONTIR__.predicted.z<old-1,z));
  const ammo=await page.evaluate(()=>window.__KONTIR__.state.players.find(p=>p.id===window.__KONTIR__.id).ammo);
  await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
  await page.waitForFunction(old=>window.__KONTIR__.state.players.find(p=>p.id===window.__KONTIR__.id).ammo<old,ammo);
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>window.__KONTIR__.state.players.find(p=>p.id===window.__KONTIR__.id).reload>0);
  await page.screenshot({path:'test-results/game.png'});
  await page.keyboard.down('Tab');assert.ok(await page.locator('#scoreboard').isVisible());await page.keyboard.up('Tab');
  await unlock(page);await page.click('#leave');assert.equal(await page.evaluate(()=>window.__KONTIR__.playing),false);
  console.log('PASS: menu, map selection, buy, pointer lock, movement prediction, firing, reload, scoreboard, exit');

  const other=await open(),code=`K${Date.now().toString(36).slice(-6)}`.toUpperCase();
  for(const [tab,name]of[[page,'HOST'],[other,'GUEST']]){
    await tab.click('#online');await tab.fill('#operator-name',name);await tab.fill('#room-input',code);await tab.click('#join-submit');await tab.waitForFunction(()=>window.__KONTIR__.playing);
  }
  await page.waitForFunction(()=>window.__KONTIR__.state.players.length===2);
  assert.equal(await other.locator('#start-match').isDisabled(),true);
  assert.equal(await page.evaluate(()=>new Set(window.__KONTIR__.state.players.map(p=>p.team)).size),2);
  await page.screenshot({path:'test-results/lobby.png'});await page.click('#start-match');
  await page.waitForFunction(()=>window.__KONTIR__.state.phase==='buy');await page.click('#lock');
  await page.waitForFunction(()=>window.__KONTIR__.state.phase==='live',{},{timeout:20000});
  await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
  await other.waitForFunction(()=>window.__KONTIR__.state.players.find(p=>p.name==='HOST').char.z<66);
  await unlock(page);await page.click('#leave');await other.waitForFunction(()=>window.__KONTIR__.state.players.length===1);
  await other.close();console.log('PASS: two-client lobby, balanced teams, host start, authoritative remote motion, leave cleanup');

  await page.click('[data-mode="deathmatch"]');await page.click('[data-map="harbor"]');await page.click('#practice');await page.waitForFunction(()=>window.__KONTIR__.playing);
  const dm=await page.evaluate(()=>window.__KONTIR__.state);assert.equal(dm.mode,'deathmatch');assert.equal(dm.mapId,'harbor');
  await page.click('#leave');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:'test-results/mobile-menu.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS: alternate map/mode, responsive menu, no JavaScript errors');
}catch(error){const page=context.pages()[0];if(page){await page.screenshot({path:'test-results/error.png'});console.error(await page.evaluate(()=>window.__KONTIR__));}throw error;}
finally{await browser.close();}

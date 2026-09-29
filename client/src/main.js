import './style.css';
import { FramePacer } from './frame-pacer.js';
import * as THREE from 'three';
import { UI } from './ui.js';
import { WorldEngine } from '../WorldEngine.js';
import { PlayerController } from '../PlayerController.js';
import { WeaponManager } from '../WeaponManager.js';
import { Network } from './network.js';
import { Prediction } from './prediction.js';
import { AudioEngine } from './audio.js';
import { loadProfile, saveProfile, recordMatch, rankOf, levelOf } from './profile.js';
import { FINISHES, applyFinish } from './finishes.js';
import { weaponIcon } from './icons.js';
import { weaponMaterials } from './viewmodels.js';
import { buildWeaponRig } from './viewmodels.js';
import { DT, TICK_RATE } from '../../shared/constants.js';
import { WEAPONS, inaccuracy } from '../../shared/weapons.js';

const store = { get: (k, d) => { try { return localStorage.getItem(`kontir.${k}`) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(`kontir.${k}`, v); } catch { /* private mode */ } } };
const ui = new UI(), audio = new AudioEngine();
const profile = loadProfile(); saveProfile(profile);
let fireList = [], scopeK = 0;
const promptEl = document.createElement('div'); promptEl.id = 'use-prompt'; document.body.appendChild(promptEl); let promptKey = '';
const scopeEl = document.createElement('div'); scopeEl.id = 'scope'; scopeEl.innerHTML = '<i></i><i></i>'; document.body.appendChild(scopeEl);
const pacer = new FramePacer(store.get('fpsLimit', 30)); // 30 FPS default for battery/heat
let world;
try { world = new WorldEngine(document.querySelector('#scene'), { quality: store.get('quality', 'medium') }); }
catch (error) { document.querySelector('#loader').innerHTML = '<b>WebGL2 talab qilinadi.</b><span>Brauzerda grafik tezlashtirishni yoqing.</span>'; throw error; }
const controller = new PlayerController(world.camera, document.body);
const weapons = new WeaponManager(world.viewScene);
weapons.finishFor = id => profile.finishes[id];
controller.setSensitivity(Number(store.get('sens', 0.6))); audio.setVolume(Number(store.get('volume', 0.8)));

let maps = [], selectedMap = 'sahara', team = 'TERRORIST', loadedMap = null;
let playing = false, joining = false, generation = 0;
let state = null, id = null, prediction = null, acc = 0, sendAcc = 0, lastEvent = 0, lastHud = 0, lastRadar = 0, resultShown = false, fps = 60, wallPush = 0, crossGap = 6, lastBeep = 0;
const network = new Network(receive, reason => { if (playing) { leave(); ui.toast(reason === 'AFK' ? 'Harakatsizlik uchun chetlatildingiz.' : 'Server bilan aloqa uzildi. Qayta kiring.'); } });

// ---- hero weapon shown behind the menu
const hero = buildWeaponRig('ak47'); hero.group.scale.setScalar(1.7); hero.group.traverse(o => { o.frustumCulled = false; });
const heroHolder = new THREE.Group(); heroHolder.add(hero.group); heroHolder.position.set(0.5, -0.16, -1.05); world.viewScene.add(heroHolder);

// ---------------------------------------------------------------------------------------------- maps
let mapLoading = Promise.resolve();
function loadMapById(mapId, silent = false) {
  const loading = mapLoading.catch(() => {}).then(() => loadMapNow(mapId, silent));
  mapLoading = loading;
  return loading;
}
async function loadMapNow(mapId, silent = false) {
  const meta = maps.find(m => m.id === mapId); if (!meta) throw new Error('Xarita topilmadi');
  if (loadedMap === mapId && world.map) return;
  if (!silent) ui.showBusy('XARITA YUKLANMOQDA…');
  loadedMap = null;
  try { await world.loadMap(meta, (f, label) => ui.setLoading(f, label)); loadedMap = mapId; updateShowcase(); }
  catch (error) { world.disposeMap(); throw error; }
  finally { ui.hideBusy(); }
}

// ---------------------------------------------------------------------------------------------- network events
function receive(next) {
  if (!playing) return;
  state = next;
  const reset = prediction.reconcile(state, id);
  if (reset) controller.setAim(prediction.char.yaw, 0);
  if (!['buy', 'warmup'].includes(state.phase) && ui.modal.querySelector('.buy-cols')) ui.modal.close();
  const me = state.players.find(p => p.id === id);
  for (const event of state.events) if (event.id > lastEvent) { lastEvent = event.id; handleEvent(event, me); ui.event(event, id, state.players); }
  world.effects.syncSmokes?.(state.smokes);
  if (state.fires) fireList = state.fires;
  for (const s of state.smokes) world.effects.smoke(s.id, s.x, s.y, s.z, s.radius, s.age, s.left);
  if (state.phase === 'warmup') { ui.resume(false); ui.lobby(state, id, async () => { try { await network.request('start', {}); } catch (e) { ui.toast(e.message); } }, leave); }
  else if (ui.modal.querySelector('.room-code')) { ui.modal.close(); ui.resume(!controller.locked); }
  if (state.phase === 'matchEnd' && !resultShown) {
    resultShown = true; controller.unlock(); ui.resume(false);
    const me = state.players.find(p => p.id === id), won = !!(me && state.result?.winner === me.team), draw = !state.result?.winner;
    const gains = me ? recordMatch(profile, { won, draw, kills: me.kills, deaths: me.deaths, assists: me.assists, rounds: (state.scores?.TERRORIST || 0) + (state.scores?.COUNTER_TERRORIST || 0) }) : null;
    ui.results(state, leave, gains); refreshLobby();
  }
  if (state.phase !== 'matchEnd') resultShown = false;
}

const V = new THREE.Vector3(), V2 = new THREE.Vector3();
function playerPos(pid) { const p = state?.players.find(q => q.id === pid); return p ? { x: p.char.x, y: p.char.y + 1.4, z: p.char.z } : null; }
function handleEvent(e, me) {
  switch (e.type) {
    case 'shot': {
      const mine = e.shooter === id;
      if (!mine) {
        const muzzle = world.actorMuzzleWorld(e.shooter, V) ? V.clone() : new THREE.Vector3(e.from.x, e.from.y - 0.1, e.from.z);
        world.effects.tracer(muzzle, e.to); world.effects.remoteMuzzle(muzzle); audio.gunshot(e.weapon, e.from, false);
      } else {
        const muzzle = weapons.activeRig?.muzzle?.getWorldPosition(V2) ? V2.clone() : new THREE.Vector3(e.from.x, e.from.y - 0.1, e.from.z);
        // the view scene has its own camera space: project the muzzle straight ahead of the eye for the tracer origin
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(world.camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(world.camera.quaternion);
        muzzle.copy(world.camera.position).addScaledVector(fwd, 0.9).addScaledVector(right, 0.14).addScaledVector(new THREE.Vector3(0, -1, 0), 0.1);
        world.effects.tracer(muzzle, e.to, true);
      }
      if (e.hit) world.effects.impact(e.to, {}, 'flesh'); else if (e.wall) world.effects.impact(e.to, e.wall, 'wall');
      break;
    }
    case 'hit':
      if (e.attacker === id) { ui.hitmarker(e.part === 'head', e.killed); audio.hitmarker(e.part === 'head'); }
      if (e.target === id) {
        audio.hurt();
        const dx = e.from.x - prediction.char.x, dz = e.from.z - prediction.char.z;
        ui.damageIndicator(controller.yaw - Math.atan2(-dx, -dz));
        world.shake += 0.6;
      }
      break;
    case 'footstep': audio.footstep({ x: e.x, y: e.y + 0.1, z: e.z }, false, 1); break;
    case 'jump': audio.jump({ x: e.x, y: e.y, z: e.z }); break;
    case 'land': audio.land({ x: e.x, y: e.y, z: e.z }, false, e.speed); break;
    case 'weaponSound': { const pos = { x: e.x, y: e.y + 1.2, z: e.z }; if (e.kind === 'reloadStart') audio.reload(pos, false, e.weapon); else if (e.kind === 'select' || e.kind === 'quick') audio.draw(pos); break; }
    case 'melee': audio.swish(e.from, e.shooter === id); break;
    case 'pellet': world.effects.tracer(V.set(e.from.x, e.from.y - 0.1, e.from.z), e.to); if (e.wall) world.effects.impact(e.to, e.wall, 'wall'); break;
    case 'decoy': audio.gunshot(e.weapon, e, false); break;
    case 'dropped': audio.throwSound({ x: e.x, y: e.y, z: e.z }, e.who === id); break;
    case 'pickup': audio.draw({ x: e.x, y: e.y + 1, z: e.z }, e.who === id); if (e.who === id) ui.toast(`${WEAPONS[e.weapon]?.name || e.weapon} olindi.`); break;
    case 'throw': { if (e.who !== id) { const p = playerPos(e.who); if (p) audio.throwSound(p); } break; }
    case 'bounce': audio.bounce(e); break;
    case 'detonate': {
      const d = V.set(e.x - world.camera.position.x, e.y - world.camera.position.y, e.z - world.camera.position.z).length();
      if (e.grenadeType === 'he') { world.effects.explosion(e.x, e.y, e.z, 'he'); audio.explosion(e); world.shake += Math.max(0, 3 - d * 0.12); }
      else if (e.grenadeType === 'flash') { world.effects.flashPop(new THREE.Vector3(e.x, e.y + 0.3, e.z)); audio.flashbang(e); }
      else if (e.grenadeType === 'smoke') audio.smokePop(e);
      else if (e.grenadeType === 'molotov' || e.grenadeType === 'incendiary') audio.glassBreak(e);
      else if (e.grenadeType === 'decoy') audio.click();
      break;
    }
    case 'flash': if (e.target === id) { ui.flash(e.duration, e.full); audio.ring(Math.min(6, e.duration + 1)); } break;
    case 'exploded': world.effects.explosion(e.x, e.y, e.z, 'c4'); audio.explosion(e, true); world.shake += 4; break;
    case 'planted': audio.plant(); break;
    case 'round': world.effects.clear(); ui.lastPhase = ''; ui.slotKey = ''; if (me) weapons.setTeam(me.team); world.csm?.updateFrustums(); break;
    case 'live': audio.beep(true); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------- local prediction audio / fx
weapons.on('shot', e => {
  audio.gunshot(e.weapon, null, true); world.shake += 0.12;
  const rig = weapons.activeRig, from = new THREE.Vector3(world.camera.position.x, world.camera.position.y - 0.12, world.camera.position.z);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(world.camera.quaternion), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(world.camera.quaternion);
  from.addScaledVector(right, 0.16).addScaledVector(fwd, 0.35);
  if (rig?.eject && prediction) world.effects.casing(from, right.clone().multiplyScalar(1.2).add(new THREE.Vector3(0, 0.6, 0)), prediction.char.y);
});
weapons.on('reload', () => {}).on('foley', f => audio.foley(f.kind, null, true, f.weapon)).on('draw', () => audio.draw(null, true)).on('dry', () => audio.dry()).on('melee', () => audio.swish(null, true)).on('throw', () => audio.throwSound(null, true)).on('pin', () => audio.click());
controller.on('inspect', () => { if (weapons.inspect()) audio.draw(null, true); }).on('wheel', dir => weapons.wheelSlot(dir)).on('scoreboard', show => { document.querySelector('#scoreboard').classList.toggle('hidden', !show); if (show && state) ui.scoreboard(state, id); }).on('buy', openBuy);
controller.on('lock', () => { audio.unlock(); audio.warmShots([weapons.inventory.weaponId(1), weapons.inventory.weaponId(2)].filter(Boolean)); ui.resume(false); }).on('unlock', () => { if (playing && state && state.phase !== 'warmup' && !resultShown && !ui.modal.open) ui.resume(true); });

// ---------------------------------------------------------------------------------------------- join / leave
async function join(options) {
  if (joining) return;
  joining = true; const my = ++generation;
  ui.showBusy('ULANMOQDA…'); audio.unlock();
  try {
    const result = await network.join({ name: profile.name, code: options.code, practice: !!options.practice, quick: !!options.quick, mapId: selectedMap, team,
      loadout: { t: profile.loadout.t, ct: profile.loadout.ct }, bots: options.practice ? { t: botCfg.t, ct: botCfg.ct } : undefined, difficulty: botCfg.difficulty });
    if (my !== generation) { network.leave(); return; }
    await enter(result, my);
  } catch (error) {
    if (my === generation) { ui.hideBusy(); ui.toast(error.message); const el = document.querySelector('#join-error'); if (el) el.textContent = error.message; network.leave(); }
  } finally { if (my === generation) { joining = false; ui.hideBusy(); const b = document.querySelector('#join-submit'); if (b) b.disabled = false; } }
}
/** Loads the room's map, prewarms shaders and hands control to the game loop (shared by join and matchmaking). */
async function enter(result, my) {
  id = result.id; state = result.snapshot;
    await loadMapById(state.mapId, true);
    if (!network.socket.connected) throw new Error('Xarita yuklanayotganda aloqa uzildi. Qayta kiring.');
    if (my !== generation) { network.leave(); return; }
    weapons.setTeam(result.team);
    ui.showBusy('GRAFIKA TAYYORLANMOQDA…');
    await world.prewarm(weapons).catch(() => {});
    if (my !== generation) { network.leave(); return; }
    world.setShowcase(null);
    prediction = new Prediction(world.map.collider, weapons);
    state = network.latest || state;
    playing = true; lastEvent = state.events.at(-1)?.id || 0; resultShown = false; acc = 0; sendAcc = 0;
    ui.showGame(world.map.name); ui.hideBusy(); receive(state);
  if (state.phase !== 'warmup') ui.resume(true);
}
function leave() {
  generation++; joining = false; playing = false; controller.unlock(); network.leave();
  state = null; id = null; prediction = null; controller.clearInput(); world.clearActors(); world.effects.clear(); world.bombRig.group.visible = false; world.bombLight.intensity = 0;
  weapons.inventory.reset('TERRORIST'); weapons.setActive(null); ui.showMenu(); ui.resume(false);
  ui.showView('home'); updateShowcase(); refreshLobby();
}

// ---------------------------------------------------------------------------------------------- buy
let isBuyOpen = false;
function openBuy() {
  if (isBuyOpen && ui.modal.open) {
    ui.modal.close();
    return;
  }
  const me = state?.players.find(p => p.id === id); if (!playing || !me) return;
  if (!(state.phase === 'buy' || state.phase === 'warmup')) { ui.toast('Xarid vaqti tugagan. Keyingi raundni kuting.'); return; }
  if (!me.alive) { ui.toast('Yo‘q qilinganda xarid qilib bo‘lmaydi.'); return; }
  isBuyOpen = true;
  controller.unlock(); ui.resume(false);
  const render = () => {
    if (!playing || !state || !['buy', 'warmup'].includes(state.phase) || !isBuyOpen) return;
    const p = state.players.find(q => q.id === id);
    ui.buy(state, p, async item => {
      try {
        await network.request('buy', item);
        audio.click();
        setTimeout(() => { if (ui.modal.open && ui.modal.querySelector('.buy-cols') && isBuyOpen) render(); }, 140);
      } catch (e) { ui.toast(e.message); }
    });
  };
  render();
}

// ---------------------------------------------------------------------------------------------- matchmaking (CS2-style)
let searchingMM = false, mode = store.get('mode', 'competitive');
const pool = new Set(JSON.parse(store.get('pool', '[]') || '[]'));
async function startSearch() {
  if (searchingMM || playing || joining) return;
  const name = profile.name;
  searchingMM = true; audio.unlock();
  ui.searching({ mode, elapsed: 0, inQueue: 1 });
  try {
    await network.queueJoin({ name, mode, maps: [...ui.pool], loadout: { t: profile.loadout.t, ct: profile.loadout.ct } }, {
      status: st => { if (searchingMM) ui.searching(st); },
      found: f => { audio.beep(true); ui.matchFound(f, () => network.queueAccept(f.matchId)); },
      accepted: a => ui.matchAccepted(a.accepted),
      requeued: r => { ui.hideMatchFound(); ui.toast(r.reason); },
      failed: r => { ui.hideMatchFound(); stopSearch(false); ui.toast(r.reason); },
      ready: async result => {
        ui.hideMatchFound(); stopSearch(false);
        const my = ++generation; joining = true;
        try { network.adopt(result); ui.showBusy('MATCH YUKLANMOQDA…'); await enter(result, my); }
        catch (error) { ui.toast(error.message); network.leave(); }
        finally { joining = false; ui.hideBusy(); }
      },
    });
  } catch (error) { stopSearch(false); ui.toast(error.message); }
}
function stopSearch(notify = true) { if (notify) network.queueLeave(); searchingMM = false; ui.searching(null); }
document.querySelector('#search-cancel').onclick = () => stopSearch(true);
document.querySelector('#go').onclick = () => {
  if (mode === 'competitive' || mode === 'casual') startSearch();
  else if (mode === 'practice') { stopSearch(searchingMM); join({ practice: true, name: store.get('name', 'Operator') }); }
  else document.querySelector('#online').click();
};
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (searchingMM) stopSearch(true); mode = b.dataset.mode; store.set('mode', mode); ui.setMode(mode); });
// ---------------------------------------------------------------------------------------------- CS2-style lobby: profile, pages, showcase
const botCfg = { t: 5, ct: 5, difficulty: 'medium', ...JSON.parse(store.get('bots', '{}') || '{}') };
const icon = (wid, fin) => weaponIcon(wid, fin || 'standard');
const INVENTORY_WEAPONS = ['ak47', 'm4a4', 'm4a1s', 'awp', 'deagle', 'usp', 'glock', 'galil', 'famas', 'sg553', 'aug', 'ssg08', 'mp9', 'mac10', 'ump45', 'mp7', 'p90', 'nova', 'xm1014', 'mag7', 'sawedoff', 'negev', 'p250', 'fiveseven', 'tec9', 'cz75', 'r8'];
const NEWS = [
  { tag: 'YANGILANISH', title: 'CS2 uslubidagi lobbi', text: 'Yangi bosh menyu: operatoringiz xaritada turadi, yuqorida INVENTAR / LOADOUT / O‘YNASH / DO‘KON / YANGILIKLAR. Demo profil avtomatik yaratiladi.' },
  { tag: 'BOTLAR', title: 'Botlarga qarshi rejim', text: 'Har tomonda 0–5 bot va 4 qiyinlik darajasi. Botlar endi granata otadi va ovozga buriladi.' },
  { tag: 'MATCHMAKING', title: 'Real o‘yinchilar bilan', text: 'COMPETITIVE va CASUAL navbati: xaritalar puli, “O‘yiningiz tayyor!” va qabul qilish oynasi.' },
  { tag: 'ARSENAL', title: '35 qurol, realistik reload', text: 'Magazin qo‘l bilan almashtiriladi, zatvor va slayd harakatlari o‘z ovozlari bilan. F — qurolni ko‘rish.' },
  { tag: 'XARITALAR', title: 'Sarob, Changtepa, Qishloq, Ombor', text: 'Klassik layoutlar: palace, long A, banana, A main va boshqalar.' },
];
function refreshLobby() {
  ui.renderProfile(profile, { rankOf, levelOf });
  ui.loadoutM4 = profile.loadout.m4;
  if (ui.view === 'loadout') ui.renderLoadout(profile, icon, (key, wid) => { profile.loadout[key] = wid; saveProfile(profile); refreshLobby(); updateShowcase(); });
  if (ui.view === 'inventory') ui.renderInventory(profile, INVENTORY_WEAPONS, FINISHES, icon, (wid, fin) => { if (wid) { if (fin === 'standard') delete profile.finishes[wid]; else profile.finishes[wid] = fin; saveProfile(profile); weapons.refreshFinish?.(wid); updateShowcase(); } refreshLobby(); });
  if (ui.view === 'store') ui.renderStore(profile, FINISHES, icon, fin => { const f = FINISHES[fin]; if (!f || profile.owned.includes(fin) || profile.coins < f.price) return; profile.coins -= f.price; profile.owned.push(fin); saveProfile(profile); audio.click(); ui.toast(`${f.name} — sotib olindi. INVENTARdan qurolga qo‘ying.`); refreshLobby(); });
  if (ui.view === 'news') ui.renderNews(NEWS);
}
function updateShowcase() {
  if (playing || !world.map) return;
  const side = team, rifle = side === 'TERRORIST' ? 'ak47' : profile.loadout.m4;
  world.setShowcase({ team: side, weapon: rifle, applyFinish: g => applyFinish(g, profile.finishes[rifle], weaponMaterials()) });
}
{
  const nameEl = document.querySelector('#lobby-name');
  nameEl.oninput = () => { profile.name = nameEl.value.trim().replace(/[<>&"]/g, '').slice(0, 18) || profile.name; saveProfile(profile); ui.renderProfile(profile, { rankOf, levelOf }); };
  ui.setMode(mode); ui.onPool = p => store.set('pool', JSON.stringify([...p]));
  ui.botSettings(botCfg, cfg => store.set('bots', JSON.stringify(cfg)));
  ui.renderFriends(['NOVA', 'GHOST', 'ATLAS', 'VIPER']);
  document.querySelectorAll('.tb-nav [data-view]').forEach(b => b.onclick = () => { ui.showView(ui.view === b.dataset.view ? 'home' : b.dataset.view); refreshLobby(); });
  document.querySelector('#nav-home').onclick = () => ui.showView('home');
  document.querySelector('#fullscreen').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
  // drag on the 3D scene turns the operator (home view)
  let drag = null;
  document.querySelector('#scene').addEventListener('pointerdown', e => { if (!playing) drag = e.clientX; });
  addEventListener('pointermove', e => { if (drag !== null && !playing) { world.showcaseSpin((e.clientX - drag) * 0.01); drag = e.clientX; } });
  addEventListener('pointerup', () => { drag = null; });
  ui.showView('home'); refreshLobby();
}

// ---------------------------------------------------------------------------------------------- UI wiring
const nameInput = () => document.querySelector('#operator-name')?.value || store.get('name', 'Operator');
document.querySelector('#practice').onclick = () => { if (searchingMM) stopSearch(true); join({ practice: true, name: store.get('name', 'Operator') }); };
document.querySelector('#quick').onclick = () => { if (searchingMM) stopSearch(true); join({ quick: true, name: store.get('name', 'Operator') }); };
document.querySelector('#online').onclick = () => {
  ui.dialog(`<small class="eyebrow">MULTIPLAYER</small><h2>Xonaga qo‘shiling.</h2><p>Yangi xona oching yoki do‘stingiz bilan bir xil kodni kiriting. Har jamoada 5 o‘rin bor; T / CT ni server tenglashtiradi.</p>
    <form id="join-form"><label for="operator-name">OPERATOR NOMI</label><input id="operator-name" value="" maxlength="18" required><label for="room-input">XONA KODI</label><input id="room-input" value="OPS001" minlength="4" maxlength="8" pattern="[A-Za-z0-9]{4,8}" required><div id="join-error" role="alert"></div><button id="join-submit" class="primary full">XONAGA KIRISH →</button></form>`);
  document.querySelector('#operator-name').value = store.get('name', 'Operator');
  document.querySelector('#join-form').onsubmit = e => { e.preventDefault(); document.querySelector('#join-submit').disabled = true; store.set('name', nameInput()); void join({ name: nameInput(), code: document.querySelector('#room-input').value }); };
};
document.querySelector('#guide-nav').onclick = () => ui.controls();
document.querySelector('#team').onclick = e => { team = team === 'TERRORIST' ? 'COUNTER_TERRORIST' : 'TERRORIST'; e.target.textContent = `${team === 'TERRORIST' ? 'TERRORIST' : 'COUNTER-TERRORIST'} ⇄`; updateShowcase(); };
document.querySelector('#settings').onclick = () => ui.settings({ quality: world.qualityName, sensitivity: controller.controls.pointerSpeed, volume: audio.volume, fpsLimit: pacer.limit, onFpsLimit: v => { pacer.setLimit(v); store.set('fpsLimit', pacer.limit); },
  onQuality: q => { world.setQuality(q); store.set('quality', q); }, onSensitivity: v => { controller.setSensitivity(v); store.set('sens', v); }, onVolume: v => { audio.setVolume(v); store.set('volume', v); } });
document.querySelector('#lock').onclick = () => { audio.unlock(); try { controller.lock(); } catch { ui.toast('Sichqoncha boshqaruvini yoqish uchun tugmani qayta bosing.'); } };
document.querySelector('#leave').onclick = leave; document.querySelector('#pause-button').onclick = () => { controller.unlock(); ui.resume(true); };
document.addEventListener('pointerlockerror', () => { ui.toast('Pointer Lock bloklandi. Oynani faollashtirib, qayta bosing.'); if (playing && !ui.modal.open) ui.resume(true); });
ui.modal.addEventListener('cancel', e => { if (ui.locked) { e.preventDefault(); if (state?.phase === 'warmup') leave(); } });
ui.modal.addEventListener('close', () => {
  if (isBuyOpen) {
    isBuyOpen = false;
    // show the resume button first: re-capturing the mouse can be refused without a user gesture, and 'lock' hides it again
    if (playing) { ui.resume(!controller.locked); try { controller.lock(); } catch { /* user click fallback */ } }
    return;
  }
  if (playing && state && ui.modal.querySelector) { if (!controller.locked && state.phase !== 'warmup' && !resultShown) ui.resume(true); }
});
document.addEventListener('visibilitychange', () => {
  controller.clearInput(); acc = 0; sendAcc = 0; previous = performance.now(); pacer.next = null;
  if (document.hidden) { controller.unlock(); audio.ctx?.suspend().catch(() => {}); }
  else if (playing) audio.ctx?.resume().catch(() => {});
});

// ---------------------------------------------------------------------------------------------- frame loop
// debug / screenshot hook: window.__setCam(x, y, z, yaw, pitch) pins the camera, window.__setCam(null) releases it
let debugCam = null;
window.__setCam = (x, y, z, yaw = 0, pitch = 0) => { debugCam = x === null ? null : { x, y, z, yaw, pitch }; };
let previous = performance.now(), slowSince = 0, specId = null, frameMs = 16, lastRes = 0;
const meshQ = new THREE.Vector3();
function frame(nowMs) {
  if (!pacer.ready(nowMs, { hidden: document.hidden, active: playing && controller.locked })) return;
  const raw = (nowMs - previous) / 1000; previous = nowMs; const dt = Math.max(0, Math.min(0.25, raw)); fps += (1 / Math.max(0.001, raw) - fps) * 0.04;
  const now = performance.now();
  // dynamic resolution: steer the smoothed frame time toward the pacer target before dropping a whole quality tier
  frameMs += (raw * 1000 - frameMs) * 0.05;
  if (playing && controller.locked && nowMs - lastRes > 1500 && store.get('adaptive', '1') !== '0') {
    const target = 1000 / Math.min(60, pacer.limit || 60), k = world.resScale ?? 1;
    if (frameMs > target * 1.2 && k > 0.75) { world.setResolutionScale(k - 0.05); lastRes = nowMs; }
    else if (frameMs < target * 0.8 && k < 1) { world.setResolutionScale(k + 0.05); lastRes = nowMs; }
  }
  // adaptive quality: sustained < 28 FPS drops one tier (the player can raise it again in Settings)
  if (playing && controller.locked && fps < Math.min(28, pacer.limit * 0.8) && (world.resScale ?? 1) <= 0.76 && world.qualityName !== 'low' && store.get('adaptive', '1') !== '0') { slowSince ||= nowMs; if (nowMs - slowSince > 5000) { world.setQuality({ ultra: 'high', high: 'medium', medium: 'low' }[world.qualityName] || 'low'); store.set('quality', world.qualityName); ui.toast(`FPS past: grafika ${world.qualityName.toUpperCase()} rejimiga o‘tkazildi.`); slowSince = 0; } } else slowSince = 0;
  const alive = !!(playing && state && prediction?.char && state.players.find(p => p.id === id)?.alive);
  heroHolder.visible = !playing && !world.showcase; heroHolder.rotation.set(0.08, -0.7 + Math.sin(nowMs * 0.00025) * 0.25, 0.12); weapons.root.visible = playing && alive;
  if (playing && state && prediction?.char) {
    acc += dt; let steps = 0;
    while (acc >= DT && steps++ < 16) {
      const step = prediction.command(controller.sampleCommand(), network.viewTick(now));
      if (step?.events) {
        controller.notify(step.events);
        if (step.events.footstep) audio.footstep(null, true, 0.55);
        if (step.events.jumped) audio.jump(null, true);
        if (step.events.landed > 3) audio.land(null, true, step.events.landed);
      }
      acc -= DT;
    }
    sendAcc += dt; if (sendAcc >= DT * 2) { sendAcc %= DT * 2; network.send(prediction.pending); }
    prediction.smooth(dt);
    const me = state.players.find(p => p.id === id), punch = weapons.visualPunch(dt);
    const pose = controller.update(dt, { char: prediction.char, prev: prediction.prev || prediction.char, alpha: acc / DT, correction: prediction.offset, punch, alive, walking: controller.keys.has('ShiftLeft') || controller.keys.has('ShiftRight') });
    if (alive) {
      world.setCamera(pose.eye, pose.yaw, pose.pitch, pose.roll);
      // viewmodel wall push-back via BVH
      const fwd = meshQ.set(0, 0, -1).applyQuaternion(world.camera.quaternion), d = world.map.collider.wallDistance(pose.eye.x, pose.eye.y, pose.eye.z, fwd.x, fwd.y, fwd.z, 1.2);
      const target = Math.max(0, Math.min(1, (0.85 - d) / 0.5)); wallPush += (target - wallPush) * Math.min(1, dt * 14);
      weapons.update(dt, controller.viewmodel, { wallPush });
      const inv = weapons.inventory, sw = inv.weapon(), zf = inv.zoom > 0 && sw?.scope ? sw.scope[inv.zoom - 1] : 0;
      scopeK += ((zf ? 1 : 0) - scopeK) * Math.min(1, dt * 14);
      const targetFov = zf || 74; if (Math.abs(world.camera.fov - targetFov) > 0.05) { world.camera.fov += (targetFov - world.camera.fov) * Math.min(1, dt * 16); world.camera.updateProjectionMatrix(); }
      controller.setZoomScale(Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(37)));
      const scoped = scopeK > 0.7; scopeEl.classList.toggle('on', scoped); if (scoped) weapons.root.visible = false;
    } else {
      // spectate: follow a living teammate (else anyone) through their eyes; otherwise tilt the death camera
      const remote = network.remote(now), spec = remote.find(p => p.alive && p.id !== id && p.team === me?.team);
      if (spec && state.phase !== 'warmup') { world.setCamera(V.set(spec.char.x, spec.char.y + 1.62 - 0.57 * (spec.char.crouch || 0), spec.char.z), spec.char.yaw, spec.char.pitch, 0); ui.spectate(spec.name); specId = spec.id; }
      else { world.setCamera(pose.eye, controller.yaw, Math.max(-0.6, controller.pitch - 0.25), 0.25); specId = null; }
      weapons.root.visible = false;
      scopeK = 0; scopeEl.classList.remove('on'); controller.setZoomScale(1); if (world.camera.fov !== 74) { world.camera.fov = 74; world.camera.updateProjectionMatrix(); }
    }
    world.updateActors(network.remote(now), id, me?.team, dt);
    if (!alive && specId) { const a = world.actors.get(specId); if (a) a.visible = false; } world.updateBomb(state.bomb, dt); world.effects.syncGrenades(state.grenades, dt); world.effects.syncFires(fireList, dt); world.updateDrops(state.drops, dt);
    audio.setListener(world.camera);
    // 'E' prompt for a weapon on the ground under the crosshair
    const aimed = alive ? world.aimedDrop(state.drops) : null, key = aimed ? `${aimed.id}` : '';
    if (key !== promptKey) {
      promptKey = key; promptEl.classList.toggle('on', !!aimed);
      if (aimed) { const w = WEAPONS[aimed.weapon], held = w && weapons.inventory.slots[w.slot]; promptEl.innerHTML = `<kbd>E</kbd> ${held ? `${WEAPONS[held]?.name || held} ⇄ ` : ''}${w?.name || aimed.weapon} olish`; }
    }
    if (state.bomb.state === 'planted' && now - lastBeep > (state.bomb.remaining < 10 ? 250 : state.bomb.remaining < 20 ? 500 : 1000)) { lastBeep = now; audio.beep(state.bomb.remaining < 10); }
    // dynamic crosshair from the same inaccuracy model the server uses
    const w = weapons.inventory.weapon();
    const spread = w?.kind === 'gun' ? inaccuracy(w, { speed: Math.hypot(prediction.char.vx, prediction.char.vz), grounded: prediction.char.grounded, crouch: prediction.char.crouch, burst: weapons.inventory.burst, zoom: weapons.inventory.zoom }) : 0.004;
    const px = Math.tan(spread) * (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2));
    crossGap += (2 + px * 1.2 - crossGap) * Math.min(1, dt * 16); ui.crosshair(crossGap); ui.setCrosshairVisible(alive && w?.kind !== 'melee' && w?.kind !== 'grenade' && scopeK < 0.7);
    if (nowMs - lastHud > 80) {
      lastHud = nowMs; ui.update(state, id, weapons.hud(), { fps, drawCalls: world.renderer.info.render.calls });
      if (world.map?.radar && nowMs - lastRadar > 45) { lastRadar = nowMs; ui.drawRadar(state, { ...me, char: prediction.char, id }, world.map.radar, controller.yaw, world.map.sites); }
    }
  } else if (world.map) { if (promptKey) { promptKey = ''; promptEl.classList.remove('on'); } world.updateDrops([], dt); world.setMenuCamera(nowMs / 1000); world.updateBomb(null, dt); }
  if (debugCam) { world.setCamera(V.set(debugCam.x, debugCam.y, debugCam.z), debugCam.yaw, debugCam.pitch, 0); weapons.root.visible = false; }
  world.render(dt, debugCam ? false : playing ? alive : true);
}
world.renderer.setAnimationLoop(frame);

// ---------------------------------------------------------------------------------------------- boot
(async () => {
  try {
    const manifest = await (await fetch('/maps/manifest.json')).json();
    maps = manifest.maps.filter(m => m.valid !== false); selectedMap = maps.find(m => m.id === selectedMap)?.id || maps[0].id;
    for (const id of [...pool]) if (!maps.some(m => m.id === id)) pool.delete(id);
    if (!pool.size) for (const m of maps) pool.add(m.id);
    ui.setMaps(maps, selectedMap, async mapId => { selectedMap = mapId; try { await loadMapById(mapId); } catch (e) { ui.toast(e.message); } }, pool);
    await loadMapById(selectedMap, true);
  } catch (error) { ui.toast(`Xaritalarni yuklab bo‘lmadi: ${error.message}`); }
  ui.ready();
})();

Object.defineProperty(window, '__KONTIR__', { get: () => ({ playing, state, id, predicted: prediction?.char, pending: prediction?.pending.length, drawCalls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles,
  fpsLimit: pacer.limit, inventory: weapons.inventory.toJSON(), activeWeapon: weapons.activeWeaponMesh?.name, visibleRigs: [...weapons.rigs.values()].filter(r => r.group.visible).map(r => r.id), crouchFactor: controller.crouchFactor, eye: controller.eye.toArray(), world, controller, weapons, audio, TICK_RATE, WEAPONS }) });

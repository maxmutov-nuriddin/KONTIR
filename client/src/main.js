import './style.css';
import { yandexSDK } from './yandexSDK.js';
import { FramePacer } from './frame-pacer.js';
import { spectatorTarget } from './spectator.js';
import * as THREE from 'three';
import { UI } from './ui.js';
import { WorldEngine, detectQuality } from '../WorldEngine.js';
import { PlayerController, DEFAULT_BINDS, DEFAULT_MOUSE, keyLabel } from '../PlayerController.js';
import { WeaponManager } from '../WeaponManager.js';
import { Network } from './network.js';
import { Prediction } from './prediction.js';
import { AudioEngine } from './audio.js';
import { loadProfile, saveProfile, recordMatch, rankOf, levelOf, adopt, getToken, setToken } from './profile.js';
import { startI18n, setLang, getLang } from './i18n.js';
import { Friends } from './friends.js';
import { FINISHES, applyFinish, applyGloveFinish, finishSwatch, swatchKey } from './finishes.js';
import * as eco from '../../shared/economy.js';
import { weaponIcon, iconSrc } from './icons.js';
import { TouchControls } from './touch.js';
import { weaponMaterials } from './viewmodels.js';
import { models } from './models.js';
import { loadPhotoTextures } from './materials.js';
import { buildWeaponRig } from './viewmodels.js';
import { DT, TICK_RATE } from '../../shared/constants.js';
import { WEAPONS, inaccuracy, weaponMass } from '../../shared/weapons.js';

const store = { get: (k, d) => { try { return localStorage.getItem(`kontir.${k}`) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(`kontir.${k}`, v); } catch { /* private mode */ } } };
const ui = new UI(), audio = new AudioEngine();
const profile = loadProfile(); saveProfile(profile);
let fireList = [], scopeK = 0;
const promptEl = document.createElement('div'); promptEl.id = 'use-prompt'; document.body.appendChild(promptEl); let promptKey = '';
const scopeEl = document.createElement('div'); scopeEl.id = 'scope'; scopeEl.innerHTML = '<i></i><i></i>'; document.body.appendChild(scopeEl);
let savedFps = store.get('fpsLimit', null);
/** Practice against bots runs in the browser (ping 0) unless the player chose server practice (account rewards). */
const localPractice = () => store.get('localPractice', '1') !== '0';
// 60 FPS by default: an uncapped loop runs a 120 Hz MacBook / gaming laptop GPU flat out and heats it for nothing.
// Older builds stored 0 (MAX) automatically, so that one-time default is migrated; a later explicit choice is kept.
if (savedFps === null || savedFps === '30' || savedFps === 30 || (store.get('perfDefaults', '0') !== '2' && savedFps === '0')) {
  savedFps = '60';
  store.set('fpsLimit', 60);
}
const pacer = new FramePacer(Number(savedFps));
let world;
try {
  world = new WorldEngine(document.querySelector('#scene'), { quality: store.get('quality', 'medium') });
  // first run of this build: pick the quality tier from the hardware (weak laptops would otherwise overheat / stutter)
  if (store.get('perfDefaults', '0') !== '2') { const q = detectQuality(world.renderer); world.setQuality(q); store.set('quality', q); store.set('perfDefaults', '2'); }
  { const cap = Number(store.get('dprCap', 'auto')); if ([1, 1.5, 2].includes(cap)) world.setPixelRatioCap(cap); }   // Settings → Ruxsat
}
catch (error) { document.querySelector('#loader').innerHTML = '<b>WebGL2 talab qilinadi.</b><span>Brauzerda grafik tezlashtirishni yoqing.</span>'; throw error; }
// GPU reset / memory pressure: three.js keeps the page alive and re-uploads everything on restore (no reload needed)
world.renderer.domElement.addEventListener('webglcontextlost', () => ui.toast('Grafika xotirasi tiklanmoqda…'));
world.renderer.domElement.addEventListener('webglcontextrestored', () => ui.toast('Grafika tiklandi.'));
const controller = new PlayerController(world.camera, document.body);
const weapons = new WeaponManager(world.viewScene);
// skins are equipped per side (T / CT): the viewmodel follows the team being played
const ctSide = () => weapons.team === 'COUNTER_TERRORIST';
weapons.finishFor = id => (ctSide() ? profile.finishesCT : profile.finishes)?.[id];
weapons.wearFor = id => (ctSide() ? profile.wearsCT : profile.wears)?.[id] || 0;
weapons.modelFor = id => (ctSide() ? profile.modelsCT : profile.models)?.[id];
const readJSON = (k, d) => { try { return JSON.parse(store.get(k, '') || 'null') ?? d; } catch { return d; } };
controller.setBinds(readJSON('binds', DEFAULT_BINDS));
controller.setMouse({ ...DEFAULT_MOUSE, sensitivity: Number(store.get('sens', 0.6)), ...readJSON('mouse', {}) });
audio.setVolume(Number(store.get('volume', 0.8)));

let maps = [], selectedMap = 'sahara', team = 'TERRORIST', loadedMap = null;
let playing = false, joining = false, generation = 0;
let state = null, id = null, prediction = null, acc = 0, sendAcc = 0, lastEvent = 0, lastHud = 0, lastRadar = 0, resultShown = false, fps = 60, wallPush = 0, crossGap = 6, lastBeep = 0;
const network = new Network(receive, reason => { if (playing) { leave(); ui.toast(reason === 'AFK' ? 'Harakatsizlik uchun chetlatildingiz.' : 'Server bilan aloqa uzildi. Qayta kiring.'); } });

// ---- accounts: the socket re-binds the session on every (re)connect before any join / queue request
let serverGains = null;
const AUTH_ERRORS = { username: 'Nom noto‘g‘ri: 3–16 ta lotin harf, raqam yoki _.', password: 'Parol 6–64 belgidan iborat bo‘lsin.', taken: 'Bu nom band. Boshqasini tanlang.', credentials: 'Nom yoki parol noto‘g‘ri.', slow: 'Juda ko‘p urinish. Bir daqiqa kuting.' };
network.socket.on('connect', () => { const tk = getToken(); if (tk && !profile.demo) network.socket.emit('auth:resume', tk, r => { if (r?.error) signOut(false); else friends.refresh(); }); });
const friends = new Friends({ network, profile, toast: t => ui.toast(t), openAuth: () => openAuth(), sound: () => audio.click?.(), inGame: () => playing });
// party member: the leader entered a room -> join the same room on the leader's team
friends.onFollow = f => { if (playing || joining || !f?.code) return; if (searchingMM) stopSearch(true); team = f.team === 'COUNTER_TERRORIST' ? 'COUNTER_TERRORIST' : 'TERRORIST'; ui.toast('Partiya lideriga qo‘shilmoqda…'); join({ code: f.code, name: profile.name }); };
// keep the account online for friends: reconnect after an unexpected drop (the server re-binds on auth:resume)
network.socket.on('disconnect', reason => { if (reason !== 'io client disconnect' && !profile.demo) setTimeout(() => { if (!network.socket.connected) network.connect().catch(() => {}); }, 3000); });
network.socket.on('account:match', r => { if (profile.demo || !r?.profile) return; serverGains = r.gains; adopt(profile, r.profile); refreshLobby(); });
async function authSubmit(mode, username, password) {
  try {
    await network.connect();
    const r = await network.request(mode === 'register' ? 'auth:register' : 'auth:login', { username, password });
    setToken(r.token); adopt(profile, r.profile); applyAccount();
    ui.toast(mode === 'register' ? 'Akkaunt yaratildi.' : 'Akkauntga kirildi.');
    return null;
  } catch (e) { return AUTH_ERRORS[e.message] || 'Server xatosi. Qayta urinib ko‘ring.'; }
}
function applyAccount() { for (const w of [...Object.keys(WEAPONS), 'gloves']) weapons.refreshFinish?.(w); refreshLobby(); updateShowcase(); friends.hangup(true); friends.chatWith = null; friends.refresh(); }
function signOut(notify = true) {
  const tk = getToken(); if (tk && network.socket.connected) network.socket.emit('auth:logout', tk);
  setToken(null); adopt(profile, loadProfile()); applyAccount(); if (notify) ui.toast('Akkauntdan chiqildi.');
}
function openAuth(canClose = true) {
  if (!profile.demo) {
    ui.dialog(`<small class="eyebrow">AKKAUNT</small><h2>${profile.name.replace(/[<>&"]/g, '')}</h2><p>AKKAUNT · serverda saqlanadi</p><button id="sign-out" class="primary full">CHIQISH</button>`);
    document.querySelector('#sign-out').onclick = () => { ui.modal.close(); signOut(); };
    return;
  }
  ui.auth({ canClose, onSubmit: authSubmit, onDemo: () => { try { sessionStorage.setItem('kontir.guest', '1'); } catch { /* ignore */ } } });
}
/** Account choices go to the server (it validates ownership); demo choices stay in this session. */
function saveChoices() {
  if (profile.demo) return saveProfile(profile);
  network.request('account:update', { loadout: profile.loadout, equipped: profile.equipped, equippedCT: profile.equippedCT }).then(r => { adopt(profile, r.profile); refreshLobby(); }).catch(() => {});
}

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
  // the buy window stays open for buyAfterLive seconds into the live phase; close the menu only once the server says so
  if (!state.buyOpen && !['buy', 'warmup'].includes(state.phase) && ui.modal.open && ui.modal.querySelector('.buy-cols')) ui.modal.close();
  const me = state.players.find(p => p.id === id);
  for (const event of state.events) if (event.id > lastEvent) { lastEvent = event.id; handleEvent(event, me); ui.event(event, id, state.players); }
  world.effects.syncSmokes?.(state.smokes);
  if (state.fires) fireList = state.fires;
  for (const s of state.smokes) world.effects.smoke(s.id, s.x, s.y, s.z, s.radius, s.age, s.left);
  if (state.phase === 'warmup') { ui.resume(false); ui.lobby(state, id, async () => { try { await network.request('start', {}); } catch (e) { ui.toast(e.message); } }, leave); }
  else if (ui.modal.querySelector('.room-code')) { ui.modal.close(); ui.resume(!controller.locked); }
  if (state.phase === 'matchEnd' && !resultShown) {
    resultShown = true; controller.unlock(); ui.resume(false);
    yandexSDK.gameplayStop();
    yandexSDK.showFullscreenAd();
    const me = state.players.find(p => p.id === id), won = !!(me && state.result?.winner === me.team), draw = !state.result?.winner;
    const gains = !profile.demo ? serverGains : me ? recordMatch(profile,{ won, draw, kills: me.kills, deaths: me.deaths, assists: me.assists, rounds: (state.scores?.TERRORIST || 0) + (state.scores?.COUNTER_TERRORIST || 0) }) : null;
    const onDoubleReward = (btn) => {
      btn.disabled = true;
      yandexSDK.showRewardedAd({
        onRewarded: async () => {
          let bonusCoins = 0;
          if (!profile.demo && getToken()) {
            try { const r = await network.request('account:reward', { kind: 'double' }); adopt(profile, r.profile); bonusCoins = r.coins; }
            catch { return ui.toast('2x mukofot bu o‘yin uchun allaqachon olingan yoki muddati o‘tgan.'); }
          } else if (gains && !profile.doubled?.[state?.code + ':' + state?.round]) {
            bonusCoins = gains.coins; profile.coins += bonusCoins; (profile.doubled ||= {})[state?.code + ':' + state?.round] = true; saveProfile(profile);
          }
          refreshLobby();
          ui.toast(`2x mukofot olindi! +${bonusCoins} ◈ KONTI berildi.`);
          const coinsEl = document.querySelector('#results-coins');
          if (coinsEl && gains) coinsEl.textContent = `◈ +${gains.coins * 2} (2x MUKOFOT)`;
          btn.textContent = '✓ 2x KONTI OLINDI';
        },
        onError: () => {
          btn.disabled = false;
          ui.toast('Reklama yuklanmadi. Qayta urinib ko‘ring.');
        }
      });
    };
    ui.results(state, leave, gains, onDoubleReward); refreshLobby();
  }
  if (state.phase !== 'matchEnd') { resultShown = false; serverGains = null; }
}

const V = new THREE.Vector3(), V2 = new THREE.Vector3();
function playerPos(pid) { const p = state?.players.find(q => q.id === pid); return p?.char ? { x: p.char.x, y: p.char.y + 1.4, z: p.char.z } : null; }
// a USP-S / M4A1-S fired without its silencer sounds like its unsuppressed cousin
const unsilenced = e => e.silenced === false && WEAPONS[e.weapon]?.detachable ? (e.weapon === 'usp' ? 'p2000' in WEAPONS ? 'p2000' : 'p250' : 'm4a4') : e.weapon;
function handleEvent(e, me) {
  switch (e.type) {
    case 'shot': {
      const mine = e.shooter === id;
      if (!mine) {
        const muzzle = world.actorMuzzleWorld(e.shooter, V) ? V.clone() : new THREE.Vector3(e.from.x, e.from.y - 0.1, e.from.z);
        world.effects.tracer(muzzle, e.to); world.effects.remoteMuzzle(muzzle); audio.gunshot(unsilenced(e), e.from, false);
      } else {
        const muzzle = weapons.activeRig?.muzzle?.getWorldPosition(V2) ? V2.clone() : new THREE.Vector3(e.from.x, e.from.y - 0.1, e.from.z);
        // the view scene has its own camera space: project the muzzle straight ahead of the eye for the tracer origin
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(world.camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(world.camera.quaternion);
        muzzle.copy(world.camera.position).addScaledVector(fwd, 0.9).addScaledVector(right, 0.14).addScaledVector(new THREE.Vector3(0, -1, 0), 0.1);
        world.effects.tracer(muzzle, e.to, true);
      }
      if (e.hit) world.effects.impact(e.to, {}, 'flesh'); else if (e.wall) world.effects.impact(e.to, e.wall, 'wall');
      if (e.pen) { const d = V.set(e.to.x - e.from.x, e.to.y - e.from.y, e.to.z - e.from.z).normalize(); world.effects.impact(e.pen, { nx: d.x, ny: d.y, nz: d.z, s: e.pen.s }, 'wall'); }
      break;
    }
    case 'hit':
      if (e.attacker === id) { ui.hitmarker(e.part === 'head', e.killed); audio.hitmarker(e.part === 'head'); }
      if (e.target === id) {
        audio.hurt();
        const px = prediction?.char?.x ?? 0, pz = prediction?.char?.z ?? 0;
        const fx = e.from?.x ?? px, fz = e.from?.z ?? pz;
        const dx = fx - px, dz = fz - pz;
        ui.damageIndicator(controller.yaw - Math.atan2(-dx, -dz));
        world.shake += 0.6;
      }
      break;
    case 'footstep': audio.footstep({ x: e.x, y: e.y + 0.1, z: e.z }, false, 1); break;
    case 'jump': audio.jump({ x: e.x, y: e.y, z: e.z }); break;
    case 'land': audio.land({ x: e.x, y: e.y, z: e.z }, false, e.speed); break;
    case 'weaponSound': { const pos = { x: e.x, y: e.y + 1.2, z: e.z }; if (e.kind === 'reloadStart') audio.reload(pos, false, e.weapon); else if (e.kind === 'select' || e.kind === 'quick') audio.draw(pos); break; }
    case 'melee': audio.swish(e.from, e.shooter === id); break;
    case 'chat': ui.chatLine(e); audio.click(); break;
    case 'radio': ui.chatLine({ name: e.name, text: RADIO[e.msg] || '…', team: e.team, teamOnly: true, radio: true }); audio.beep(false); break;
    case 'ping': world.effects.ping(e, e.who === id ? '#8ee07a' : '#e5b96a', e.name); audio.beep(true); break;
    case 'overtime': ui.toast(`OVERTIME ${e.set} · ${e.half}-yarim · har kimga $12 500`); break;
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
    case 'round': world.effects.clear(); ui.lastPhase = ''; ui.slotKey = ''; ui.revivedThisRound = false; if (me) weapons.setTeam(me.team); world.csm?.updateFrustums(); break;
    case 'live': audio.beep(true); break;
    case 'roundEnd': if (e.winner) audio.roundWin(e.winner); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------- local prediction audio / fx
weapons.on('shot', e => {
  audio.gunshot(unsilenced(e), null, true); world.shake += 0.12;
  const rig = weapons.activeRig, from = new THREE.Vector3(world.camera.position.x, world.camera.position.y - 0.12, world.camera.position.z);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(world.camera.quaternion), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(world.camera.quaternion);
  from.addScaledVector(right, 0.16).addScaledVector(fwd, 0.35);
  if (rig?.eject && prediction) world.effects.casing(from, right.clone().multiplyScalar(1.2).add(new THREE.Vector3(0, 0.6, 0)), prediction.char.y);
});
weapons.on('reload', () => {}).on('foley', f => audio.foley(f.kind, null, true, f.weapon)).on('draw', () => audio.draw(null, true)).on('dry', () => audio.dry()).on('melee', () => audio.swish(null, true)).on('throw', () => audio.throwSound(null, true)).on('pin', () => audio.click());
weapons.setLeftHanded(store.get('leftHanded', '0') === '1');
const viewmodelOpts = { x: 0, y: 0, z: 0, fov: 58, ...readJSON('viewmodel', {}) };
function applyViewmodel() { weapons.setViewOffset(viewmodelOpts); world.viewCamera.fov = viewmodelOpts.fov; world.viewCamera.updateProjectionMatrix(); }
applyViewmodel();
const touch = new TouchControls(controller); controller.touchMode = touch.enabled;
controller.on('hand', () => store.set('leftHanded', weapons.setLeftHanded(!weapons.leftHanded) ? '1' : '0'));
controller.on('inspect', () => { if (weapons.inspect()) audio.draw(null, true); }).on('wheel', dir => weapons.wheelSlot(dir)).on('scoreboard', show => { document.querySelector('#scoreboard').classList.toggle('hidden', !show); if (show && state) ui.scoreboard(state, id); }).on('buy', openBuy);
controller.on('lock', () => { audio.unlock(); audio.warmShots([weapons.inventory.weaponId(1), weapons.inventory.weaponId(2)].filter(Boolean)); ui.resume(false); }).on('unlock', () => { if (playing && state && state.phase !== 'warmup' && !resultShown && !ui.modal.open) ui.resume(true); });

// ---------------------------------------------------------------------------------------------- join / leave
async function join(options) {
  if (joining) return;
  joining = true; const my = ++generation;
  ui.showBusy('ULANMOQDA…'); audio.unlock();
  try {
    const request = { name: profile.name, code: options.code, practice: !!options.practice, quick: !!options.quick, mapId: pickMap(), team,
      loadout: { t: profile.loadout.t, ct: profile.loadout.ct }, bots: options.practice ? { t: botCfg.t, ct: botCfg.ct } : undefined, difficulty: botCfg.difficulty };
    let result;
    if (options.practice && localPractice()) {
      // offline practice: the room runs in this browser on the already-loaded collision map (ping 0, no account rewards)
      await loadMapById(request.mapId, true);
      if (my !== generation) return;
      // own per-side skins for the local room (the server derives them from the account instead): knife model + agent
      const side = (f = {}, w = {}, m = {}) => {
        const out = {};
        for (const [k, v] of Object.entries(f)) if (k === 'agent_t' || k === 'agent_ct') out.agent = { finish: v }; else out[k] = m[k] ? { finish: v, wear: w[k] || 0, model: m[k] } : { finish: v, wear: w[k] || 0 };
        return out;
      };
      result = network.startLocal(world.map, { ...request, skins: { TERRORIST: side(profile.finishes, profile.wears, profile.models), COUNTER_TERRORIST: side(profile.finishesCT, profile.wearsCT, profile.modelsCT) } });
    } else result = await network.join(request);
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
    if (!network.connected) throw new Error('Xarita yuklanayotganda aloqa uzildi. Qayta kiring.');
    if (my !== generation) { network.leave(); return; }
    weapons.setTeam(result.team);
    ui.showBusy('GRAFIKA TAYYORLANMOQDA…');
    await world.prewarm(weapons).catch(() => {});
    if (my !== generation) { network.leave(); return; }
    world.setShowcase(null);
    prediction = new Prediction(world.map.collider, weapons);
    state = network.latest || state;
    playing = true; friends.applyMic(); lastEvent = state.events.at(-1)?.id || 0; resultShown = false; acc = 0; sendAcc = 0;
    ui.isPractice = !!result.practice || !!state.practice || mode === 'practice';
    ui.revivedThisRound = false;
    yandexSDK.gameplayStart();
    ui.showGame(world.map.name); ui.hideBusy(); receive(state);
  // straight into the game: no deploy screen; if the browser refuses the lock, any click on the scene captures the mouse
  ui.resume(false); if (state.phase !== 'warmup') { try { controller.lock(); } catch { /* click fallback */ } }
}
function leave() {
  yandexSDK.gameplayStop();
  yandexSDK.showFullscreenAd();
  generation++; joining = false; playing = false; friends.applyMic(); controller.unlock(); network.leave(); world.setResolutionScale(1);
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
  if (!state.buyOpen && !(state.phase === 'buy' || state.phase === 'warmup')) { ui.toast('Xarid vaqti tugagan. Keyingi raundni kuting.'); return; }
  if (!me.alive) { ui.toast('Yo‘q qilinganda xarid qilib bo‘lmaydi.'); return; }
  isBuyOpen = true;
  controller.unlock(); ui.resume(false);
  const render = () => {
    if (!playing || !state || !(state.buyOpen || ['buy', 'warmup'].includes(state.phase)) || !isBuyOpen) { if (isBuyOpen && ui.modal.open && ui.modal.querySelector('.buy-cols')) { ui.modal.close(); isBuyOpen = false; } return; }
    const p = state.players.find(q => q.id === id);
    ui.buy(state, p, async item => {
      try {
        await network.request('buy', item);
        audio.click();
        setTimeout(() => { if (ui.modal.open && ui.modal.querySelector('.buy-cols') && isBuyOpen) render(); }, 140);
      } catch (e) { ui.toast(e.message); }
    }, async item => {
      try { await network.request('sellback', item); audio.click(); setTimeout(() => { if (ui.modal.open && ui.modal.querySelector('.buy-cols') && isBuyOpen) render(); }, 140); }
      catch (e) { ui.toast(e.message); }
    });
  };
  render();
}

// ---------------------------------------------------------------------------------------------- comms: chat (Y / U), radio (Z), ping (X / middle mouse)
const RADIO = ['Hujumga!', 'Orqaga chekinamiz', 'Meni yopib turing', 'Dushman ko‘rindi!', 'Hudud toza', 'Yordam kerak!', 'Tushunarli', 'Yo‘q', 'Bombani A ga olib boramiz', 'Bombani B ga olib boramiz'].slice(0, 9);
let specPick = 0, deadView = false;
controller.on('cycle', d => { if (deadView) specPick += d; });
controller.on('voice', down => friends.setPTT(down));
controller.on('chat', teamOnly => { if (!playing) return; ui.openChat(teamOnly, text => network.emit('chat', { text, team: teamOnly }), () => {}); })
  .on('radio', () => { if (!playing) return; controller.radioOpen = !controller.radioOpen; ui.radioMenu(controller.radioOpen ? RADIO : null); })
  .on('radioPick', n => { controller.radioOpen = false; ui.radioMenu(null); if (RADIO[n - 1]) network.emit('radio', n - 1); })
  .on('ping', () => {
    if (!playing || !world.map) return;
    const f = V.set(0, 0, -1).applyQuaternion(world.camera.quaternion), o = world.camera.position;
    const hit = world.map.collider.raycast(o.x, o.y, o.z, f.x, f.y, f.z, 90);
    if (hit) network.emit('ping', { x: hit.x, y: hit.y, z: hit.z });
  });

// ---------------------------------------------------------------------------------------------- matchmaking (CS2-style)
let searchingMM = false, mode = store.get('mode', 'competitive');
const pool = new Set(JSON.parse(store.get('pool', '[]') || '[]'));
/** Random map from the selected pool, never the one just played (and not the one before it when the pool allows). */
function pickMap() {
  const ids = [...pool].filter(id => maps.some(m => m.id === id)); if (!ids.length) return selectedMap;
  const recent = JSON.parse(store.get('recentMaps', '[]') || '[]');
  const fresh = ids.filter(id => !recent.slice(0, Math.min(2, ids.length - 1)).includes(id));
  const id = (fresh.length ? fresh : ids)[Math.floor(Math.random() * (fresh.length || ids.length))];
  store.set('recentMaps', JSON.stringify([id, ...recent.filter(x => x !== id)].slice(0, 3)));
  return id;
}
async function startSearch() {
  if (searchingMM || playing || joining) return;
  const name = profile.name;
  searchingMM = true; audio.unlock();
  ui.searching({ mode, elapsed: 0, inQueue: 1 });
  try {
    await network.queueJoin({ name, mode, maps: [...ui.pool], loadout: { t: profile.loadout.t, ct: profile.loadout.ct } }, {
      status: st => { if (searchingMM) ui.searching(st); },
      found: f => {
        audio.beep(true);
        // nobody else to wait for (bot-filled solo match): accept at once instead of a pop-up that can expire unseen
        if (f.solo || f.players === 1) { ui.hideMatchFound(); ui.showBusy('MATCH YUKLANMOQDA…'); network.queueAccept(f.matchId); return; }
        ui.matchFound(f, () => network.queueAccept(f.matchId));
      },
      accepted: a => ui.matchAccepted(a.accepted),
      requeued: r => { ui.hideMatchFound(); ui.toast(r.reason); },
      failed: r => { ui.hideMatchFound(); ui.hideBusy(); stopSearch(false); ui.toast(r.reason); },
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
const icon = (wid, fin) => iconSrc(wid, fin || 'standard');
const INVENTORY_WEAPONS = ['ak47', 'm4a4', 'm4a1s', 'awp', 'deagle', 'usp', 'glock', 'galil', 'famas', 'sg553', 'aug', 'ssg08', 'mp9', 'mac10', 'ump45', 'mp7', 'p90', 'nova', 'xm1014', 'mag7', 'sawedoff', 'negev', 'p250', 'fiveseven', 'tec9', 'cz75', 'r8'];
// news in all three languages (the i18n observer only knows fixed UI phrases)
const NEWS = [
  { tag: ['YANGILANISH', 'ОБНОВЛЕНИЕ', 'UPDATE'], title: ['Do‘stlar, partiya va ovozli chat', 'Друзья, пати и голосовой чат', 'Friends, party and voice chat'], text: ['Do‘stlarni qidiring, partiyaga taklif qiling va bitta jamoada o‘ynang. Shaxsiy xabarlar va ovozli qo‘ng‘iroq (o‘yinda V — gapirish).', 'Ищите друзей, приглашайте в пати и играйте в одной команде. Личные сообщения и голосовые звонки (в игре V — говорить).', 'Find friends, invite them to your party and play on one team. Direct messages and voice calls (V to talk in a match).'] },
  { tag: ['AKKAUNT', 'АККАУНТ', 'ACCOUNT'], title: ['Login va parol', 'Логин и пароль', 'Username and password'], text: ['XP, reyting, KONTI va skinlar serverda saqlanadi. Demo rejimda progress saqlanmaydi.', 'XP, рейтинг, KONTI и скины хранятся на сервере. В демо прогресс не сохраняется.', 'XP, rating, KONTI and skins are stored on the server. Demo progress is not saved.'] },
  { tag: ['SOZLAMALAR', 'НАСТРОЙКИ', 'SETTINGS'], title: ['Tugmalar va sichqoncha', 'Клавиши и мышь', 'Keys and mouse'], text: ['Har bir amal uchun tugmani o‘zingiz tanlang; sezgirlik, scope sezgirligi, Y teskari, raw input.', 'Назначайте клавиши на любое действие; чувствительность, прицел, инверсия Y, raw input.', 'Rebind every action; sensitivity, scoped sensitivity, invert Y, raw input.'] },
  { tag: ['BOTLAR', 'БОТЫ', 'BOTS'], title: ['Botlarga qarshi rejim', 'Режим против ботов', 'Versus bots'], text: ['Har tomonda 0–5 bot va 4 qiyinlik darajasi. Botlar granata otadi va ovozga buriladi.', 'До 5 ботов с каждой стороны и 4 уровня сложности. Боты бросают гранаты и реагируют на звук.', '0–5 bots per side and 4 difficulty levels. Bots throw grenades and react to sound.'] },
  { tag: ['XARITALAR', 'КАРТЫ', 'MAPS'], title: ['Sarob, Changtepa, Qishloq, Ombor', 'Sarob, Changtepa, Qishloq, Ombor', 'Sarob, Changtepa, Qishloq, Ombor'], text: ['Klassik layoutlar: palace, long A, banana, A main va boshqalar.', 'Классические планировки: palace, long A, banana, A main и другие.', 'Classic layouts: palace, long A, banana, A main and more.'] },
];
const newsFor = () => { const i = { uz: 0, ru: 1, en: 2 }[getLang()] ?? 0; return NEWS.map(n => ({ tag: n.tag[i], title: n.title[i], text: n.text[i] })); };
function refreshLobby() {
  ui.renderProfile(profile, { rankOf, levelOf });
  ui.loadoutM4 = profile.loadout.m4;
  if (ui.view === 'loadout') ui.renderLoadout(profile, icon, (key, wid) => { profile.loadout[key] = wid; saveChoices(); refreshLobby(); updateShowcase(); });
  const ctx = { icon: skinIcon, finishes: FINISHES, eco, market, now: marketNow + (performance.now() - marketAt) };
  if (ui.view === 'inventory') ui.renderInventory(profile, { ...ctx, weapons: ['agent_t', 'agent_ct', 'knife', ...INVENTORY_WEAPONS], onEquip: equip, onSell: sell });
  if (ui.view === 'store') ui.renderStore(profile, { ...ctx, onBuy: buySkin });
  if (ui.view === 'news') ui.renderNews(newsFor());
}
// ---- skin market (server-priced; see shared/economy.js)
let market = {}, marketNow = Date.now(), marketAt = performance.now(), marketTimer = 0;
/** Friends → player name: their public card (inventory + stats), or a lock when they made it private. */
friends.viewProfile = async name => {
  try {
    await network.connect();
    const { profile: u } = await network.request('profile:view', name);
    ui.playerProfile(u, { icon: skinIcon, finishes: FINISHES, eco, market, now: marketNow + (performance.now() - marketAt) });
  } catch (e) { ui.toast(e.message === 'nouser' ? 'O‘yinchi topilmadi.' : 'Profilni ochib bo‘lmadi.'); }
};
async function loadMarket() { try { const r = await network.request('market'); market = r.market || {}; marketNow = r.now || Date.now(); marketAt = performance.now(); } catch { /* offline: base prices */ } }
const hex = n => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
/** Agent thumbnail: operator silhouette in the agent's uniform colours over its camo. */
const agentIcon = id => {
  const a = eco.AGENTS[id] || { pal: { uniform: 0x6f6650, camo: [0x5a5240, 0x8a8066, 0x403a2e], gear: 0x3a382e } };   // standard kit
  const c = a.pal.camo || [a.pal.uniform, a.pal.uniform, a.pal.uniform];
  return `<span class="agent-ico" style="background:radial-gradient(circle at 30% 25%, ${hex(c[1])} 0 18%, transparent 19%), radial-gradient(circle at 70% 60%, ${hex(c[0])} 0 22%, transparent 23%), radial-gradient(circle at 40% 80%, ${hex(c[2])} 0 16%, transparent 17%), ${hex(a.pal.uniform)}">
    <svg viewBox="0 0 64 64"><path d="M32 6 a9 9 0 1 1 0 18 a9 9 0 1 1 0-18 Z M16 60 L18 34 Q20 26 32 26 Q44 26 46 34 L48 60 Z" fill="${hex(a.pal.gear ?? a.pal.uniform)}" stroke="#000a" stroke-width="2"/></svg></span>`;
};
const skinIcon = (w, f, wear = 0) => eco.isAgentWeapon(w) ? agentIcon(f) : w === 'gloves'
  ? `<span class="glove-ico" data-swatch="${swatchKey(f, wear)}" style="background-image:url(${finishSwatch(f, wear)})"><svg viewBox="0 0 64 64"><path d="M14 60 V30 L10 14 a4 4 0 0 1 8-2 L22 26 V8 a4 4 0 0 1 8 0 V24 V6 a4 4 0 0 1 8 0 V24 V9 a4 4 0 0 1 8 0 V28 l4-8 a4 4 0 0 1 7 4 L50 44 V60 Z" fill="none" stroke="#0009" stroke-width="2.5"/></svg></span>`
  : `<img alt="" data-icon="${w}:${f || 'standard'}" src="${iconSrc(w, f || 'standard')}">`;
const ERR = { coins: 'KONTI yetarli emas.', item: 'Bu skin mavjud emas.', shop: 'Bu taklif bugungi do‘konda yo‘q (do‘kon yangilandi).', full: 'Inventar to‘lgan (200 ta).', slow: 'Juda tez — biroz kuting.', auth: 'Akkauntga kiring.' };
function syncSkins() {
  const ct = eco.equippedView(profile.items, profile.equippedCT || {});
  Object.assign(profile, eco.equippedView(profile.items, profile.equipped), { finishesCT: ct.finishes, wearsCT: ct.wears, modelsCT: ct.models }); for (const w of [...INVENTORY_WEAPONS, 'knife', 'gloves']) weapons.refreshFinish?.(w); updateShowcase(); }
async function buySkin(req) {
  if (profile.demo) { ui.toast('Skin olish uchun akkaunt kerak.'); return openAuth(); }
  try { const r = await network.request('account:buy', req); adopt(profile, r.profile); audio.click(); syncSkins(); await loadMarket();
    ui.toast(`Sotib olindi: ${eco.wearOf(r.item.wear).name}, float ${r.item.wear.toFixed(4)}. INVENTARdan kiying.`); }
  catch (e) { ui.toast(ERR[e.message] || 'Server xatosi. Qayta urinib ko‘ring.'); }
  refreshLobby();
}
async function sell(itemId) {
  try { const r = await network.request('account:sell', itemId); adopt(profile, r.profile); audio.click(); syncSkins(); await loadMarket(); ui.toast(`Sotildi: +${r.coins} ◈`); }
  catch (e) { ui.toast(ERR[e.message] || 'Server xatosi.'); }
  refreshLobby();
}
/** side: 't' | 'ct' | 'both' — a skin can be worn on one side only (as in CS2). */
function equip(weapon, itemId, side = 'both') {
  profile.equipped ||= {}; profile.equippedCT ||= {};
  for (const [s, map] of [['t', profile.equipped], ['ct', profile.equippedCT]]) {
    if (side !== 'both' && side !== s) continue;
    if (itemId) map[weapon] = itemId; else delete map[weapon];
  }
  syncSkins(); saveChoices(); refreshLobby();
}
ui.onRefresh = () => refreshLobby();
setTimeout(() => { for (const w of ['ak47', 'm4a4', 'm4a1s', 'awp', 'deagle', 'usp', 'glock', 'p250', 'knife']) iconSrc(w, 'standard'); }, 4000);
document.querySelectorAll('[data-view="store"], [data-view="inventory"]').forEach(b => b.addEventListener('click', async () => { await loadMarket(); refreshLobby(); }));
clearInterval(marketTimer); marketTimer = setInterval(() => { if (ui.view === 'store') loadMarket().then(refreshLobby); }, 60000);

function updateShowcase() {
  if (playing || !world.map) return;
  const side = team, rifle = side === 'TERRORIST' ? 'ak47' : profile.loadout.m4;
  const ct = side === 'COUNTER_TERRORIST', fin = (ct ? profile.finishesCT : profile.finishes) || {}, wr = (ct ? profile.wearsCT : profile.wears) || {};
  world.setShowcase({ team: side, weapon: rifle, agent: fin[ct ? 'agent_ct' : 'agent_t'], applyFinish: g => { applyFinish(g, fin[rifle], weaponMaterials(), wr[rifle] || 0); applyGloveFinish(g, fin.gloves, wr.gloves || 0); } });
}
{
  const nameEl = document.querySelector('#lobby-name');
  ui.onAuth = () => openAuth();
  ui.onFreeCoins = () => {
    audio.click();
    // check the cooldown / daily cap BEFORE showing an ad (the server enforces the same rules)
    const probe = structuredClone(profile.ads || {}), err = eco.claimAd(probe, Date.now());
    if (err === 'daily') return ui.toast(`Bugungi reklama limiti tugadi (${eco.AD_DAILY_MAX} ta). Ertaga qayta urinib ko‘ring.`);
    if (err === 'cooldown') return ui.toast(`Keyingi bepul KONTI ${Math.ceil((eco.AD_COOLDOWN_MS - (Date.now() - (profile.ads?.last || 0))) / 60000)} daqiqadan keyin.`);
    yandexSDK.showRewardedAd({
      onRewarded: async () => {
        let got = 0;
        if (!profile.demo && getToken()) {
          try { const r = await network.request('account:reward', { kind: 'free' }); adopt(profile, r.profile); got = r.coins; }
          catch (e) { return ui.toast(e.message === 'daily' ? 'Bugungi limit tugadi.' : e.message === 'cooldown' ? 'Biroz kuting.' : 'Server xatosi.'); }
        } else { profile.ads ||= {}; if (eco.claimAd(profile.ads, Date.now())) return; profile.coins += eco.AD_REWARD; got = eco.AD_REWARD; saveProfile(profile); }
        refreshLobby();
        ui.toast(`+${got} ◈ KONTI berildi.`);
      },
      onError: () => {
        ui.toast('Reklama yuklanmadi yoki internet aloqasi yo‘q.');
      }
    });
  };
  ui.onRevive = () => {
    if (ui.revivedThisRound || !playing) return;
    audio.click();
    yandexSDK.showRewardedAd({
      onRewarded: () => {
        ui.revivedThisRound = true;
        network.request('practice:revive', {}).catch(e => ({ error: e.message })).then(res => {
          if (res?.ok) {
            ui.toast('Qayta tirildingiz!');
            try { controller.lock(); } catch {}
          } else {
            ui.toast(res?.error || 'Tirilish amalga oshmadi.');
          }
        });
      },
      onError: () => {
        ui.toast('Reklama yuklanmadi.');
      }
    });
  };
  document.querySelector('#account-btn').onclick = () => openAuth();
  const langEl = document.querySelector('#lang'); langEl.value = getLang(); langEl.onchange = () => { setLang(langEl.value); refreshLobby(); };
  window.applyYandexLanguage = langCode => {
    if (!langCode) return;
    const l = String(langCode).slice(0, 2).toLowerCase();
    const target = (l === 'ru' || l === 'be' || l === 'uk' || l === 'kk') ? 'ru' : (l === 'uz' ? 'uz' : 'en');
    setLang(target);
    const el = document.querySelector('#lang');
    if (el) el.value = target;
    refreshLobby();
  };
  nameEl.oninput = () => { if (!profile.demo) return; profile.name = nameEl.value.trim().replace(/[<>&"]/g, '').slice(0, 18) || profile.name; saveProfile(profile); ui.renderProfile(profile, { rankOf, levelOf }); };
  ui.setMode(mode); ui.onPool = p => store.set('pool', JSON.stringify([...p]));
  ui.botSettings(botCfg, cfg => store.set('bots', JSON.stringify(cfg)));
  friends.renderRail(); friends.renderParty();
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
document.querySelector('#settings').onclick = () => ui.settings({ quality: world.qualityName, volume: audio.volume, fpsLimit: pacer.limit, mouse: controller.mouseOpts,
  binds: structuredClone(controller.binds), getBinds: () => structuredClone(controller.binds), keyLabel,
  capture: fn => { controller.capture = code => { controller.capture = null; fn(code); }; },
  onBinds: b => { controller.setBinds(b || DEFAULT_BINDS); store.set('binds', JSON.stringify(controller.binds)); },
  onMouse: m => { controller.setMouse(m); store.set('mouse', JSON.stringify(controller.mouseOpts)); store.set('sens', controller.mouseOpts.sensitivity); },
  onFpsLimit: v => { pacer.setLimit(v); store.set('fpsLimit', pacer.limit); },
  dprCap: world.dprCap ?? null, onDpr: v => { world.setPixelRatioCap(v); store.set('dprCap', v ?? 'auto'); },
  localPractice: localPractice(), onLocalPractice: on => store.set('localPractice', on ? '1' : '0'),
  account: !profile.demo && !!getToken(), privateProfile: !!profile.privateProfile,
  onPrivateProfile: async on => {
    try { const r = await network.request('account:update', { privateProfile: on }); adopt(profile, r.profile); ui.toast(on ? 'Profil yopildi.' : 'Profil ochildi.'); }
    catch { ui.toast('Saqlab bo‘lmadi. Internetni tekshiring.'); }
  },
  onQuality: q => { world.setQuality(q); store.set('quality', q); },
  viewmodel: viewmodelOpts, onViewmodel: vm => { Object.assign(viewmodelOpts, vm); applyViewmodel(); store.set('viewmodel', JSON.stringify(viewmodelOpts)); },
  onAutoQuality: () => { const r = detectQuality(world.renderer, true); world.setQuality(r.quality); store.set('quality', r.quality); pacer.setLimit(r.fps); store.set('fpsLimit', r.fps); return r; }, onVolume: v => { audio.setVolume(v); store.set('volume', v); } });
ui.modal.addEventListener('close', () => { controller.capture = null; });
document.querySelector('#lock').onclick = () => { audio.unlock(); try { controller.lock(); } catch { ui.toast('Sichqoncha boshqaruvini yoqish uchun tugmani qayta bosing.'); } };
// click anywhere on the game view (not on UI) captures the mouse; Esc once = pause menu, Esc again = back to the game
addEventListener('mousedown', e => {
  if (!playing || controller.locked || ui.modal.open || state?.phase === 'warmup' || resultShown || !$paused()) return;
  if (e.target.closest?.('button, input, select, dialog, a, #friends, #chat-form, #call-bar, .party-invite')) return;
  audio.unlock(); try { controller.lock(); } catch { /* ignore */ }
});
const $paused = () => document.querySelector('#resume').classList.contains('hidden');
addEventListener('keydown', e => {
  if (e.code !== 'Escape' || !playing || controller.locked || ui.modal.open || $paused()) return;
  e.preventDefault(); ui.resume(false); try { controller.lock(); } catch { /* next click locks */ }
});
document.querySelector('#pause-settings').onclick = () => document.querySelector('#settings').click(); // settings from the pause menu
// mouse buttons 4 / 5 (browser back / forward) must never leave the game: they stay usable as bindable inputs
for (const t of ['mousedown', 'mouseup', 'auxclick']) addEventListener(t, e => { if (e.button === 3 || e.button === 4) e.preventDefault(); }, true);
history.pushState({ kontir: 1 }, ''); addEventListener('popstate', () => history.pushState({ kontir: 1 }, ''));
document.querySelector('#leave').onclick = leave; document.querySelector('#pause-button').onclick = () => { controller.unlock(); ui.resume(true); };
document.addEventListener('pointerlockerror', () => { if (playing && !ui.modal.open) ui.toast('Sichqonchani yoqish uchun ekranni bosing.'); });
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
const QUALITY_DOWN = { ultra: 'high', high: 'crisp', crisp: 'medium', medium: 'low' };
const QUALITY_LABEL = { low: 'TEZKOR', medium: 'O‘RTA', crisp: 'TINIQ', high: 'YUQORI', ultra: 'ULTRA' };
function frame(nowMs) {
  if (!pacer.ready(nowMs, { hidden: document.hidden, active: playing && controller.locked })) return;
  const raw = (nowMs - previous) / 1000; previous = nowMs; const dt = Math.max(0, Math.min(0.25, raw)); fps += (1 / Math.max(0.001, raw) - fps) * 0.15;
  const now = performance.now();
  // dynamic resolution: steer the smoothed frame time toward the pacer target before dropping a whole quality tier
  frameMs += (raw * 1000 - frameMs) * 0.05;
  if (playing && controller.locked && nowMs - lastRes > 1500 && store.get('adaptive', '1') !== '0') {
    // Uncapped (MAX) aims for a smooth 60, not 144: chasing 144 FPS on an old PC used to drop the resolution to 75 %
    // permanently and made the picture blurry. A chosen limit (120 / 144) is honoured as the target.
    const targetFps = pacer.limit > 0 ? pacer.limit : 60;
    const target = 1000 / targetFps, k = world.resScale ?? 1;
    if (frameMs > target * 1.2 && k > world.minResolutionScale) { world.setResolutionScale(k - 0.05); lastRes = nowMs; }
    else if (frameMs < target * 0.85 && k < 1) { world.setResolutionScale(k + 0.05); lastRes = nowMs; }
  }
  // adaptive quality: sustained < 28 FPS at minimum resolution drops one tier (the player can raise it again in Settings)
  if (playing && controller.locked && fps < 28 && (world.resScale ?? 1) <= world.minResolutionScale + 0.01 && world.qualityName !== 'low' && store.get('adaptive', '1') !== '0') { slowSince ||= nowMs; if (nowMs - slowSince > 5000) { world.setQuality(QUALITY_DOWN[world.qualityName] || 'low'); store.set('quality', world.qualityName); ui.toast(`FPS past: grafika ${QUALITY_LABEL[world.qualityName]} rejimiga o‘tkazildi.`); slowSince = 0; } } else slowSince = 0;
  const alive = !!(playing && state && prediction?.char && state.players.find(p => p.id === id)?.alive);
  { const want = playing && !ui.modal.open; if (want !== touch.visible) touch.setVisible(want); }
  heroHolder.visible = !playing && !world.showcase; heroHolder.rotation.set(0.08, -0.7 + Math.sin(nowMs * 0.00025) * 0.25, 0.12); weapons.root.visible = playing && alive;
  if (playing && state && prediction?.char) {
    acc += dt; let steps = 0;
    while (acc >= DT && steps++ < 16) {
      const step = prediction.command(controller.sampleCommand(), network.viewTick(now));
      if (network.local) network.local.tick(prediction.pending);   // offline practice: the room advances in lockstep
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
    controller.viewmodel.mass = weaponMass(weapons.inventory.weapon()?.id) || 1;
    const pose = controller.update(dt, { char: prediction.char, prev: prediction.prev || prediction.char, alpha: acc / DT, correction: prediction.offset, punch, alive, walking: controller.keys.has('ShiftLeft') || controller.keys.has('ShiftRight') });
    if (alive) {
      world.setCamera(pose.eye, pose.yaw, pose.pitch, pose.roll);
      // viewmodel wall push-back via BVH
      const fwd = meshQ.set(0, 0, -1).applyQuaternion(world.camera.quaternion), d = world.map.collider.wallDistance(pose.eye.x, pose.eye.y, pose.eye.z, fwd.x, fwd.y, fwd.z, 1.2);
      const target = Math.max(0, Math.min(1, (0.85 - d) / 0.5)); wallPush += (target - wallPush) * Math.min(1, dt * 14);
      weapons.update(dt, controller.viewmodel, { wallPush });
      deadView = false;
      const inv = weapons.inventory, sw = inv.weapon(), zf = inv.zoom > 0 && sw?.scope ? sw.scope[inv.zoom - 1] : 0;
      scopeK += ((zf ? 1 : 0) - scopeK) * Math.min(1, dt * 14);
      const targetFov = zf || 74; if (Math.abs(world.camera.fov - targetFov) > 0.05) { world.camera.fov += (targetFov - world.camera.fov) * Math.min(1, dt * 16); world.camera.updateProjectionMatrix(); }
      controller.setZoomScale(Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(37)));
      const scoped = scopeK > 0.7; scopeEl.classList.toggle('on', scoped); if (scoped) weapons.root.visible = false;
    } else {
      // spectate: follow a living teammate (else anyone) through their eyes; otherwise tilt the death camera
      // LMB / RMB cycle through living teammates (anyone alive when the team is wiped)
      deadView = true;
      const spec = spectatorTarget(network.remote(now), id, me?.team, specPick);
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
    crossGap += (2 + px * 1.2 - crossGap) * Math.min(1, dt * 16); ui.crosshair(crossGap); ui.setCrosshairVisible(alive && w?.kind !== 'grenade' && scopeK < 0.7);   // the knife keeps a crosshair (where the stab lands)
    if (nowMs - lastHud > 80) {
      lastHud = nowMs; ui.update(state, id, weapons.hud(), { fps, drawCalls: world.renderer.info.render.calls });
      if (world.map?.radar) { lastRadar = nowMs; ui.drawRadar(state, { ...me, char: prediction.char, id }, world.map.radar, controller.yaw, world.map.sites, pid => world.actors.get(pid)); }   // every frame: smooth
    }
  } else if (world.map) { if (promptKey) { promptKey = ''; promptEl.classList.remove('on'); } world.updateDrops([], dt); world.setMenuCamera(nowMs / 1000); world.updateBomb(null, dt); }
  if (debugCam) { world.setCamera(V.set(debugCam.x, debugCam.y, debugCam.z), debugCam.yaw, debugCam.pitch, 0); weapons.root.visible = false; }
  world.render(dt, debugCam ? false : playing ? alive : true);
}
world.renderer.setAnimationLoop(frame);

// ---------------------------------------------------------------------------------------------- boot
(async () => {
  try {
    await models.init(world.gltf);
    // only the weapons you can hold right away block the menu; scanned textures load in parallel and are skipped on
    // TEZKOR (weak laptops: ~25 MB less to download and much less GPU memory)
    const START = ['knife', 'glock', 'usp', 'p250', 'ak47', 'm4a4', 'm4a1s', 'c4'];
    ui.setLoading(0.05, '3D modellar');
    await Promise.all([
      models.count() ? models.preload(f => ui.setLoading(0.05 + f * 0.3, '3D modellar'), START) : null,
      world.qualityName === 'low' ? null : loadPhotoTextures('./textures/', world.maxAniso),
    ]);
    const manifest = await (await fetch('./maps/manifest.json')).json();
    maps = manifest.maps.filter(m => m.valid !== false); selectedMap = maps.find(m => m.id === selectedMap)?.id || maps[0].id;
    for (const id of [...pool]) if (!maps.some(m => m.id === id)) pool.delete(id);
    if (!pool.size) for (const m of maps) pool.add(m.id);
    ui.setMaps(maps, selectedMap, async mapId => { selectedMap = mapId; try { await loadMapById(mapId); } catch (e) { ui.toast(e.message); } }, pool);
    await loadMapById(selectedMap, true);
  } catch (error) { ui.toast(`Xaritalarni yuklab bo‘lmadi: ${error.message}`); }
  ui.ready(); document.getElementById('boot')?.remove();
  // the rest of the weapon models stream in after the menu is up; a rig built from the procedural fallback is rebuilt
  if (models.count()) setTimeout(() => models.preload(() => {}, Object.keys(models.manifest.weapons)).then(() => { for (const [wid, r] of weapons.rigs) if (!r.fromModel && models.weapon(wid) && !r.group.visible) { r.group.removeFromParent(); weapons.rigs.delete(wid); } }), 500);
  yandexSDK.init({ audio, controller }).then(sdk => {
    const ylang = sdk?.environment?.i18n?.lang || yandexSDK.getLanguage();
    if (ylang) window.applyYandexLanguage?.(ylang);
  }).catch(() => {});
  // saved session -> restore the account; otherwise offer sign-in / register / demo once per browser session
  const tk = getToken();
  if (tk) {
    try { await network.connect(); adopt(profile, (await network.request('auth:resume', tk)).profile); applyAccount(); }
    catch (e) { if (e.message === 'expired') setToken(null); ui.toast(e.message === 'expired' ? 'Akkauntdan chiqildi.' : 'Server xatosi. Qayta urinib ko‘ring.'); }
  } else { let guest = null; try { guest = sessionStorage.getItem('kontir.guest'); } catch { /* ignore */ } if (!guest) openAuth(true); }
})();
startI18n();

Object.defineProperty(window, '__KONTIR__', { get: () => ({ playing, state, id, predicted: prediction?.char, pending: prediction?.pending.length, drawCalls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles,
  fpsLimit: pacer.limit, inventory: weapons.inventory.toJSON(), activeWeapon: weapons.activeWeaponMesh?.name, visibleRigs: [...weapons.rigs.values()].filter(r => r.group.visible).map(r => r.id), crouchFactor: controller.crouchFactor, eye: controller.eye.toArray(), world, controller, weapons, audio, yandexSDK, TICK_RATE, WEAPONS }) });

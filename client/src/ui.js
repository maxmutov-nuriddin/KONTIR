import { gsap } from 'gsap';
import { WEAPONS, BUY_ITEMS } from '../../shared/weapons.js';
import { RULES } from '../../shared/constants.js';

const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
export const clock = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TEAM_LABEL = { TERRORIST: 'TERRORIST', COUNTER_TERRORIST: 'COUNTER-TERRORIST' };
const TEAM_SHORT = { TERRORIST: 'T', COUNTER_TERRORIST: 'CT' };
const REASONS = { elimination: 'Jamoa yo‘q qilindi', exploded: 'Bomba portladi', defused: 'Bomba zararsizlantirildi', time: 'Vaqt tugadi', draw: 'Durang', match: 'Match yakuni' };
const BUY_NAMES = { kevlar: 'KEVLAR', helmet: 'KEVLAR + DUBULG‘A', defuser: 'DEFUSE KIT' };
const RPM = w => Math.round(60 / w.interval);
const GROUP_NAMES = { PISTOLS: 'PISTOLS', SMGS: 'SMG', HEAVY: 'SHOTGUN', RIFLES: 'RIFLES', GRENADES: 'GRENADES', GEAR: 'GEAR' };
const statLine = id => {
  const w = WEAPONS[id];
  if (w?.kind === 'gun') return `${w.damage}${w.pellets ? ` × ${w.pellets}` : ''} DMG · ${RPM(w)} RPM${w.scope ? ' · SCOPE' : ''}`;
  return { he: '98 DMG · 8.5 M', flash: '2 TAGACHA', smoke: '18 SONIYA', molotov: '7 s OLOV', incendiary: '7 s OLOV', decoy: 'SOXTA OTISH', kevlar: '100 ARMOR', helmet: '100 ARMOR + DUBULG‘A', defuser: '5 s DEFUSE' }[id] || '';
};

export class UI {
  constructor() {
    $('#app').innerHTML = `
      <div class="shade"></div>
      <section id="menu" class="menu cs-lobby">
        <header class="topbar">
          <div class="tb-left"><button id="nav-home" class="tb-icon" title="Bosh sahifa" aria-label="Bosh sahifa">⌂</button><button id="settings" class="tb-icon" title="Sozlamalar" aria-label="Sozlamalar">⚙</button><button id="fullscreen" class="tb-icon" title="To‘liq ekran" aria-label="To‘liq ekran">⛶</button></div>
          <nav class="tb-nav"><button data-view="inventory">INVENTAR</button><button data-view="loadout">LOADOUT</button><button data-view="play" id="play-nav" class="tb-play">O‘YNASH</button><button data-view="store">DO‘KON</button><button data-view="news">YANGILIKLAR</button></nav>
          <div class="tb-right"><select id="lang" class="tb-lang" aria-label="Til"><option value="uz">UZ</option><option value="ru">RU</option><option value="en">EN</option></select><button id="account-btn" class="tb-account" title="Akkaunt">KIRISH</button><span class="coins" title="Demo tangalar — o‘ynab yig‘iladi">◈ <b id="coins">0</b></span><button id="btn-free-coins" class="tb-bonus-btn" title="Reklama ko‘rib bepul tanga olish">🎬 +150 ◈</button><a class="brand" href="#"><b>◩</b> KONTIR</a></div>
        </header>
        <aside class="rail">
          <div class="rail-me"><div class="avatar" id="rail-avatar">O</div><span class="rail-level" id="rail-level">1</span></div>
          <button id="guide-nav" class="rail-btn" title="Qo‘llanma">?</button>
          <div class="rail-friends" id="rail-friends"></div>
          <div class="rail-status" title="Server"><i></i><small>64</small></div>
        </aside>
        <div class="player-card" id="player-card"><div class="pc-top"><span class="pc-rank" id="pc-rank"></span><strong id="pc-name">Operator</strong></div><div class="pc-level"><small id="pc-level">DARAJA 1</small><div class="pc-bar"><i id="pc-xp"></i></div></div><small class="pc-demo">DEMO PROFIL · ma’lumotlar shu qurilmada saqlanadi</small></div>
        <div class="views">
        <section class="view" id="view-play">
        <div class="lobby">
          <div class="lobby-main">
            <div class="mode-tabs" id="mode-tabs">
              <button data-mode="competitive" class="on"><b>COMPETITIVE</b><small>5v5 · MR12 · real o‘yinchilar</small></button>
              <button data-mode="casual"><b>CASUAL</b><small>tezroq topiladi · bo‘sh joyga bot</small></button>
              <button data-mode="practice"><b>BOTLARGA QARSHI</b><small>son va qiyinlikni tanlang</small></button>
              <button data-mode="private"><b>XUSUSIY XONA</b><small>do‘stlar bilan kod orqali</small></button>
            </div>
            <div class="map-toolbar"><div class="section-label">XARITALAR <span id="map-count"></span></div><span id="pool-hint"></span><button id="map-all" class="text-button">Hammasini tanlash</button></div>
            <div class="map-grid" id="map-options"></div>
          </div>
          <aside class="lobby-side">
            <div class="party"><div class="party-head"><small>PARTIYA</small><span id="party-count">1 / 5</span></div>
              <div class="party-me"><div class="avatar" id="avatar">O</div><div><input id="lobby-name" maxlength="18" spellcheck="false" aria-label="Operator nomi"><small id="lobby-rank">KONTIR OPERATOR</small></div></div>
              <div class="party-slots"><i>+</i><i>+</i><i>+</i><i>+</i></div></div>
            <div class="side-block" id="bot-settings"><small>BOTLAR</small>
              <div class="bot-row"><span>T</span><div class="seg" id="bots-t">${[0, 1, 2, 3, 4, 5].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div></div>
              <div class="bot-row"><span>CT</span><div class="seg" id="bots-ct">${[0, 1, 2, 3, 4, 5].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div></div>
              <div class="bot-row"><span>QIYINLIK</span><div class="seg" id="bots-diff">${['easy', 'medium', 'hard', 'expert'].map(d => `<button data-d="${d}">${{ easy: 'OSON', medium: 'O‘RTA', hard: 'QIYIN', expert: 'EKSPERT' }[d]}</button>`).join('')}</div></div></div>
            <div class="side-block"><small>TOMON AFZALLIGI (botlar / xona)</small><button id="team">TERRORIST ⇄</button></div>
            <div class="side-block quick-row"><button id="practice" class="secondary">MASHQ ${arrow}</button><button id="quick" class="secondary">TEZKOR ${arrow}</button><button id="online" class="secondary">KOD ${arrow}</button></div>
            <div id="search-status" class="hidden"><div><small id="search-mode">COMPETITIVE</small><strong id="search-time">0:00</strong><span id="search-info">Qidirilmoqda…</span></div><button id="search-cancel" aria-label="Bekor qilish">×</button></div>
            <button id="go" class="go">IZLASH</button>
          </aside>
        </div>
        </section>
        <section class="view" id="view-loadout"></section>
        <section class="view" id="view-inventory"></section>
        <section class="view" id="view-store"></section>
        <section class="view" id="view-news"></section>
        </div>
      </section>
      <section id="hud" class="hidden">
        <div class="hud-top">
          <div class="radar-wrap"><canvas id="radar" width="220" height="220"></canvas><div class="radar-label"><span id="location-label"></span><small id="ping">0 MS</small></div></div>
          <div class="match-bar"><div class="team-score t"><small>T</small><b id="t-score">0</b><div class="alive" id="t-alive"></div></div>
            <div class="match-clock"><small id="phase">BUY</small><strong id="clock">0:15</strong><span id="round">RAUND 1 · 1-YARIM</span></div>
            <div class="team-score ct"><div class="alive" id="ct-alive"></div><b id="ct-score">0</b><small>CT</small></div></div>
          <div class="top-right"><button id="pause-button">ESC <span>MENYU</span></button><div id="killfeed"></div></div></div>
        <div id="crosshair" style="--gap:6px"><i></i><i></i><i></i><i></i></div><div id="hitmarker"><i></i><i></i><i></i><i></i></div><div id="damage-flash"></div><div id="dmg-dirs"></div><div id="flashbang"></div>
        <div id="objective"></div><div id="interaction"><span></span><div><i></i></div></div><div id="round-banner"></div><div id="chat"><div id="chat-log"></div><form id="chat-form" hidden><span id="chat-scope">HAMMA</span><input id="chat-input" maxlength="120" autocomplete="off" spellcheck="false"></form></div><div id="radio-menu" hidden></div><div id="pings"></div>
        <div id="death-notice" class="hidden"><strong>SIZ YO‘Q QILINDINGIZ</strong><span>Keyingi raundni kuting · TAB — natijalar</span><button id="btn-revive" class="revive-btn hidden">🎬 QAYTA TIRILISH (REKLAMA)</button></div>
        <div class="hud-bottom">
          <div class="vitals"><div class="stat hp"><small>HP</small><strong id="health">100</strong></div><div class="stat ar"><small id="armor-label">ARMOR</small><strong id="armor">0</strong></div><div class="money" id="money">$800</div></div>
          <div class="key-hints"><span><kbd>1-5</kbd> SLOT</span><span><kbd>Q</kbd> ALMASHTIRISH</span><span><kbd>B</kbd> XARID</span><span><kbd>F</kbd> KO‘RIK</span><span><kbd>Z</kbd> RADIO</span><span><kbd>X</kbd> PING</span><span><kbd>Y/U</kbd> CHAT</span><span><kbd>G</kbd> TASHLASH</span><span><kbd>E</kbd> OLISH / DEFUSE</span></div>
          <div class="weapons"><div id="slots"></div><div id="qswitch"><kbd>Q</kbd><span></span></div>
            <div class="ammo"><small id="weapon-name"></small><div><strong id="ammo">30</strong><span>/ <b id="reserve">90</b></span></div><small id="reload-status"></small></div></div></div>
        <div class="telemetry"><span id="fps">60 FPS</span><span id="drawcalls">0 DC</span><span id="tickinfo">64 TICK</span></div>
        <div id="scoreboard" class="hidden"><div class="sb-wrap"><div class="sb-head"><small>LIVE SCOREBOARD</small><h2 id="sb-title"></h2></div><div class="sb-teams"></div></div></div>
        <div id="resume" class="hidden"><div><span>PAUZA · ESC — davom etish</span><h2>O‘yin to‘xtatildi</h2><p>WASD — harakat · SICHQONCHA — nishon · CHAP TUGMA — otish<br>SHIFT — jimgina yurish · CTRL — cho‘kish · Q — oxirgi qurol · 1–5 — slot</p><button id="lock" class="primary">DAVOM ETISH ${arrow}</button><button id="pause-settings" class="secondary pause-set">⚙ SOZLAMALAR</button><button id="leave" class="text-button">Bosh menyuga qaytish</button></div></div>
      </section>
      <dialog id="modal"><button id="close" aria-label="Yopish">×</button><div id="modal-content"></div></dialog>
      <div id="toast" role="status"></div><div id="loader"><b>◩ KONTIR</b><div><i id="loader-bar"></i></div><span id="loader-text">OPERATSIYA YUKLANMOQDA</span></div>`;
    this.menu = $('#menu'); this.hud = $('#hud'); this.modal = $('#modal'); this.content = $('#modal-content'); this.radar = $('#radar').getContext('2d');
    this.el = Object.fromEntries(['health', 'armor', 'armor-label', 'ammo', 'reserve', 'money', 'phase', 'clock', 'round', 't-score', 'ct-score', 'weapon-name', 'reload-status', 'fps', 'ping', 'objective', 'drawcalls', 'tickinfo', 't-alive', 'ct-alive', 'qswitch', 'slots'].map(id => [id, document.getElementById(id)]));
    this.weaponsTable = WEAPONS; this.view = 'home';
    this.locked = false; this.lastPhase = ''; this.lastHealth = 100; this.slotKey = ''; this.aliveKey = '';
    this.revivedThisRound = false; this.isPractice = false;
    $('#close').onclick = () => this.modal.close(); this.modal.addEventListener('click', e => { if (e.target === this.modal && !this.locked) this.modal.close(); });
    $('#btn-free-coins')?.addEventListener('click', () => this.onFreeCoins?.());
    $('#btn-revive')?.addEventListener('click', () => this.onRevive?.());
    $('.brand').onclick = e => e.preventDefault();
  }
  ready() { gsap.to('#loader', { autoAlpha: 0, duration: 0.5, onComplete: () => $('#loader')?.remove() }); gsap.from('.lobby-main > *', { opacity: 0, y: 16, stagger: 0.07, duration: 0.6, ease: 'power3.out' }); gsap.from('.lobby-side', { opacity: 0, x: 20, duration: 0.6, delay: 0.15 }); }
  setLoading(fraction, label) { const bar = $('#loader-bar'); if (bar) bar.style.width = `${Math.round(fraction * 100)}%`; const t = $('#loader-text'); if (t && label) t.textContent = label.toUpperCase(); }
  showBusy(text) { this.busy ||= document.createElement('div'); this.busy.id = 'busy'; this.busy.textContent = text; if (!this.busy.isConnected) document.body.append(this.busy); }
  hideBusy() { this.busy?.remove(); }
  dialog(html, locked = false) { this.content.innerHTML = html; this.locked = locked; $('#close').hidden = locked; if (!this.modal.open) this.modal.showModal(); gsap.fromTo(this.modal, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.2 }); }
  toast(text) { const el = $('#toast'); el.textContent = text; gsap.killTweensOf(el); gsap.set(el, { autoAlpha: 1 }); gsap.to(el, { autoAlpha: 0, delay: 3.5, duration: 0.3 }); }

  /**
   * Map grid. Matchmaking modes treat cards as a multi-select pool (checkboxes); practice / private pick one map.
   * Every click also previews that map in the menu background (onSelect).
   */
  setMaps(maps, selected, onSelect, pool = new Set(maps.map(m => m.id))) {
    this.maps = maps; this.pool = pool; this.selectedMap = selected;
    $("#map-count").textContent = ` · ${maps.length}`;
    $('#map-options').innerHTML = maps.map(m => `<button data-map="${esc(m.id)}" class="map-card ${m.id === selected ? 'selected' : ''} ${pool.has(m.id) ? 'pooled' : ''}"><canvas width="160" height="100" data-thumb="${esc(m.id)}"></canvas><i class="check"></i><div><strong>${esc(m.name)}</strong><small>${esc(m.subtitle || '')}</small></div></button>`).join('');
    document.querySelectorAll('[data-map]').forEach(b => b.onclick = () => {
      const mid = b.dataset.map;
      if (this.mode === 'competitive' || this.mode === 'casual') { if (this.pool.has(mid) && this.pool.size > 1) this.pool.delete(mid); else this.pool.add(mid); b.classList.toggle('pooled', this.pool.has(mid)); this.onPool?.(this.pool); }
      document.querySelectorAll('[data-map]').forEach(x => x.classList.toggle('selected', x === b)); this.selectedMap = mid; onSelect(mid);
      this.poolHint();
    });
    $('#map-all').onclick = () => { for (const m of maps) this.pool.add(m.id); document.querySelectorAll('[data-map]').forEach(x => x.classList.add('pooled')); this.onPool?.(this.pool); this.poolHint(); };
    for (const m of maps) this.drawThumb(m.id);
    this.poolHint();
  }
  poolHint() { if (!this.pool) return; const mm = this.mode === 'competitive' || this.mode === 'casual'; $('#pool-hint').textContent = mm ? `${this.pool.size} ta xarita tanlangan — shulardan biri o‘ynaladi` : 'Bitta xaritani tanlang'; $('#map-all').hidden = !mm; document.querySelector('#map-options').classList.toggle('pool-mode', mm); }
  /** Top-down preview drawn from the map's ASCII layout (walls, floor, sites, spawns). */
  async drawThumb(id) {
    const canvas = document.querySelector(`[data-thumb="${CSS.escape(id)}"]`); if (!canvas) return;
    const g = canvas.getContext('2d'), grad = g.createLinearGradient(0, 0, 160, 100); grad.addColorStop(0, '#2b3533'); grad.addColorStop(1, '#141b1c'); g.fillStyle = grad; g.fillRect(0, 0, 160, 100);
    let text = ''; try { const r = await fetch(`./maps/${id}.txt`); if (r.ok) text = await r.text(); } catch { /* user GLB without layout */ }
    const rows = text.trim().split('\n').filter(Boolean); if (!rows.length) { g.fillStyle = '#e5b96a'; g.font = '700 38px Barlow Condensed, sans-serif'; g.fillText(id.slice(0, 2).toUpperCase(), 16, 62); return; }
    const cols = Math.max(...rows.map(r => r.length)), cell = Math.min(150 / cols, 92 / rows.length), ox = (160 - cols * cell) / 2, oy = (100 - rows.length * cell) / 2;
    const color = ch => ('#23'.includes(ch) ? null : ch === 'A' || ch === 'B' ? '#d98a3a' : ch === 't' ? '#e5b96a' : ch === 'x' ? '#5c8fd6' : ch === 'R' ? '#6f6a5c' : '#b8a888');
    rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const col = color(row[c]); if (!col) continue; g.fillStyle = col; g.fillRect(ox + c * cell, oy + r * cell, cell + 0.4, cell + 0.4); } });
    g.fillStyle = '#0008'; g.fillRect(0, 76, 160, 24);
  }
  setMode(mode) {
    this.mode = mode;
    const bs = document.querySelector('#bot-settings'); if (bs) bs.hidden = mode !== 'practice';
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#go').textContent = { competitive: 'IZLASH', casual: 'IZLASH', practice: 'BOSHLASH', private: 'XONAGA KIRISH' }[mode];
    this.poolHint();
  }
  /** Search state (top of the side panel), CS2 style: mode, mm:ss, players searching. */
  searching(info) {
    const box = $('#search-status');
    if (!info) { box.classList.add('hidden'); $('#go').disabled = false; $('#go').classList.remove('searching'); return; }
    box.classList.remove('hidden'); $('#go').disabled = true; $('#go').classList.add('searching');
    $('#search-mode').textContent = info.mode === 'casual' ? 'CASUAL' : 'COMPETITIVE';
    $('#search-time').textContent = `${Math.floor(info.elapsed / 60)}:${String(info.elapsed % 60).padStart(2, '0')}`;
    $('#search-info').textContent = `Qidirilmoqda · navbatda ${info.inQueue ?? 1} o‘yinchi`;
  }
  /** "YOUR MATCH IS READY" overlay with ACCEPT, one dot per player and a countdown bar. */
  matchFound(found, onAccept) {
    this.hideMatchFound();
    const el = document.createElement('div'); el.id = 'match-found';
    el.innerHTML = `<div class="mf-card"><small>${found.mode === 'casual' ? 'CASUAL' : 'COMPETITIVE'} · ${esc(found.mapName)}</small><h2>O‘YININGIZ TAYYOR!</h2>
      <div class="mf-dots">${Array.from({ length: found.players }, () => '<i></i>').join('')}${Array.from({ length: Math.max(0, found.size - found.players) }, () => '<i class="bot" title="bot"></i>').join('')}</div>
      <button id="mf-accept" class="primary">QABUL QILISH</button><div class="mf-bar"><i></i></div><span id="mf-info">${found.players} ta o‘yinchi · bo‘sh joylarga bot qo‘shiladi</span></div>`;
    document.body.append(el);
    gsap.fromTo(el.querySelector('.mf-card'), { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' });
    gsap.fromTo(el.querySelector('.mf-bar i'), { scaleX: 1 }, { scaleX: 0, duration: Math.max(1, found.acceptSeconds), ease: 'none' });
    el.querySelector('#mf-accept').onclick = () => { el.querySelector('#mf-accept').disabled = true; el.querySelector('#mf-accept').textContent = 'QABUL QILINDI'; onAccept(); };
  }
  matchAccepted(n) { document.querySelectorAll('#match-found .mf-dots i:not(.bot)').forEach((d, i) => d.classList.toggle('on', i < n)); const info = $('#mf-info'); if (info) info.textContent = `${n} ta o‘yinchi qabul qildi`; }
  hideMatchFound() { document.querySelector('#match-found')?.remove(); }
  // ------------------------------------------------------------------------------------------- CS2-style lobby pages
  /** Home = only the 3D showcase + player card; other views slide over it. */
  showView(view) {
    this.view = view || 'home';
    document.querySelectorAll('.tb-nav [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === this.view));
    document.querySelectorAll('.views .view').forEach(v => v.classList.toggle('open', v.id === `view-${this.view}`));
    this.menu.classList.toggle('home', this.view === 'home');
    const v = document.querySelector(`#view-${this.view}`);
    if (v) gsap.fromTo(v, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' });
  }
  renderProfile(p, { rankOf, levelOf }) {
    const lvl = levelOf(p.xp), into = p.xp % 1000;
    $('#pc-name').textContent = p.name; $('#pc-rank').textContent = rankOf(p.rating); $('#pc-level').textContent = `DARAJA ${lvl} · ${into} / 1000 XP`;
    $('#pc-xp').style.width = `${into / 10}%`; $('#coins').textContent = p.coins;
    $('#rail-level').textContent = lvl;
    for (const el of [$('#rail-avatar'), $('#avatar')]) if (el) { el.textContent = (p.name[0] || 'O').toUpperCase(); el.style.background = `linear-gradient(135deg, hsl(${p.hue} 70% 62%), hsl(${(p.hue + 40) % 360} 60% 38%))`; }
    const nameEl = $('#lobby-name'); if (nameEl && document.activeElement !== nameEl) nameEl.value = p.name;
    if (nameEl) nameEl.disabled = !p.demo; // account names are fixed (unique username)
    $('#lobby-rank').textContent = `${rankOf(p.rating)} · ${p.demo ? 'DEMO' : 'PRO'}`;
    $('.pc-demo').textContent = p.demo ? 'DEMO · progress saqlanmaydi' : 'AKKAUNT · serverda saqlanadi';
    const acc = $('#account-btn'); if (acc) acc.textContent = p.demo ? 'KIRISH' : p.name;
  }
  /** Right rail: squad of practice partners shown like a friends list. */
  renderFriends(names) { $('#rail-friends').innerHTML = names.map((n, i) => `<div class="friend" title="${esc(n)} · bot"><span style="background:hsl(${(i * 67) % 360} 45% 40%)">${esc(n[0])}</span><i></i></div>`).join(''); }
  renderLoadout(p, icon, onPick) {
    const opt = (side, key, id, label) => `<button class="lo-opt ${p.loadout[key] === id ? 'on' : ''}" data-key="${key}" data-id="${id}"><img alt="" src="${icon(id, p.finishes[id])}"><b>${esc(label)}</b></button>`;
    $('#view-loadout').innerHTML = `<div class="page"><div class="page-head"><small>LOADOUT</small><h2>Raund boshidagi qurollaringiz</h2><p>Tanlov har raund boshida (va do‘konda) qo‘llanadi. Skinlar INVENTAR bo‘limida.</p></div>
      <div class="lo-cols"><div class="lo-side ct"><h3>COUNTER-TERRORIST</h3><small>BOSHLANG‘ICH PISTOLET</small><div class="lo-row">${opt('ct', 'ct', 'usp', 'USP-S')}${opt('ct', 'ct', 'p250', 'P250')}</div>
        <small>RIFLE (do‘konda ko‘rinadigani)</small><div class="lo-row">${opt('ct', 'm4', 'm4a4', 'M4A4')}${opt('ct', 'm4', 'm4a1s', 'M4A1-S')}</div></div>
      <div class="lo-side t"><h3>TERRORIST</h3><small>BOSHLANG‘ICH PISTOLET</small><div class="lo-row">${opt('t', 't', 'glock', 'GLOCK-18')}${opt('t', 't', 'p250', 'P250')}</div></div></div></div>`;
    document.querySelectorAll('.lo-opt').forEach(b => b.onclick = () => onPick(b.dataset.key, b.dataset.id));
  }
  renderInventory(p, weapons, finishes, icon, onEquip) {
    const sel = this.invSelected && weapons.includes(this.invSelected) ? this.invSelected : weapons[0]; this.invSelected = sel;
    const W = this.weaponsTable;
    $('#view-inventory').innerHTML = `<div class="page inv"><div class="page-head"><small>INVENTAR</small><h2>Qurollar va skinlar</h2><p>Sotib olingan skinlarni istalgan qurolga qo‘ying. Yangi skinlar DO‘KONda.</p></div>
      <div class="inv-body"><div class="inv-grid">${weapons.map(id => `<button class="inv-item ${id === sel ? 'on' : ''}" data-w="${id}"><img alt="" src="${icon(id, p.finishes[id])}"><b>${esc(W[id]?.name || id)}</b><small>${esc(finishes[p.finishes[id] || 'standard'].name)}</small></button>`).join('')}</div>
      <div class="inv-detail"><img alt="" class="inv-hero" src="${icon(sel, p.finishes[sel])}"><h3>${esc(W[sel]?.name || sel)}</h3><small>SKIN TANLASH</small>
        <div class="inv-fin">${p.owned.map(f => `<button class="fin ${(p.finishes[sel] || 'standard') === f ? 'on' : ''}" data-f="${f}">${esc(finishes[f]?.name || f)}</button>`).join('')}</div></div></div></div>`;
    document.querySelectorAll('.inv-item').forEach(b => b.onclick = () => { this.invSelected = b.dataset.w; onEquip(null); });
    document.querySelectorAll('.fin').forEach(b => b.onclick = () => onEquip(sel, b.dataset.f));
  }
  renderStore(p, finishes, icon, onBuy) {
    const demo = { standard: 'ak47', desert: 'ak47', forest: 'm4a4', urban: 'ump45', arctic: 'awp', tiger: 'deagle', crimson: 'm4a1s', cobalt: 'glock', emerald: 'usp', fade: 'p90', carbon: 'aug', gold: 'deagle' };
    $('#view-store').innerHTML = `<div class="page"><div class="page-head"><small>DO‘KON</small><h2>Skinlar</h2><p>Demo tangalar (◈) har bir match uchun beriladi: qatnashish, o‘ldirish va g‘alaba. Haqiqiy pul yo‘q.</p></div>
      ${p.demo ? '<div class="store-lock"><b>SKIN UCHUN AKKAUNT KERAK</b><span>Skin olish uchun akkaunt kerak. Demo rejimda skinlar yo‘q.</span><button data-auth class="primary">KIRISH</button></div>' : ''}
      <div class="store-grid">${Object.entries(finishes).filter(([id]) => id !== 'standard').map(([id, f]) => { const own = p.owned.includes(id); return `<div class="store-item ${own ? 'own' : ''}"><img alt="" src="${icon(demo[id] || 'ak47', id)}"><b>${esc(f.name)}</b><button data-buy-fin="${id}" ${p.demo || own || p.coins < f.price ? 'disabled' : ''}>${own ? 'SIZDA BOR' : `◈ ${f.price}`}</button></div>`; }).join('')}</div></div>`;
    document.querySelector('#view-store [data-auth]')?.addEventListener('click', () => this.onAuth?.());
    document.querySelectorAll('[data-buy-fin]').forEach(b => b.onclick = () => onBuy(b.dataset.buyFin));
  }
  /** Sign in / register / demo. onSubmit(mode, username, password) resolves to an error message or null. */
  auth({ canClose, onSubmit, onDemo }) {
    this.dialog(`<div class="auth-brand"><b>◩</b> KONTIR</div><h2>KONTIRga xush kelibsiz</h2><p>Akkauntda XP, reyting, tangalar va skinlar serverda saqlanadi. Demo rejimda progress saqlanmaydi va skin olib bo‘lmaydi.</p>
      <div class="auth-tabs"><button data-am="login" class="on">KIRISH</button><button data-am="register">RO‘YXATDAN O‘TISH</button></div>
      <form id="auth-form"><label for="auth-user">Foydalanuvchi nomi</label><input id="auth-user" maxlength="16" autocomplete="username" spellcheck="false" required>
        <label for="auth-pass">Parol</label><div class="pw"><input id="auth-pass" type="password" maxlength="64" autocomplete="current-password" required><button type="button" class="pw-eye" data-eye="auth-pass" title="Parolni ko‘rsatish" aria-label="Parolni ko‘rsatish">👁</button></div>
        <div id="auth-rep" hidden><label for="auth-pass2">Parolni takrorlang</label><div class="pw"><input id="auth-pass2" type="password" maxlength="64" autocomplete="new-password"><button type="button" class="pw-eye" data-eye="auth-pass2" title="Parolni ko‘rsatish" aria-label="Parolni ko‘rsatish">👁</button></div></div>
        <small class="auth-hint">Nom: 3–16 ta lotin harf, raqam yoki _ . Parol: kamida 6 belgi. E-mail kerak emas.</small>
        <div id="auth-error" role="alert"></div><button id="auth-submit" class="primary full">KIRISH</button></form>
      <div class="auth-or"><span>yoki</span></div><button id="auth-demo" class="secondary full">DEMO BILAN O‘YNASH</button>`, !canClose);
    this.modal.classList.add('auth-modal'); this.modal.addEventListener('close', () => this.modal.classList.remove('auth-modal'), { once: true });
    let mode = 'login';
    const setMode = m => {
      mode = m; document.querySelectorAll('[data-am]').forEach(b => b.classList.toggle('on', b.dataset.am === m));
      $('#auth-rep').hidden = m !== 'register'; $('#auth-pass2').required = m === 'register';
      $('#auth-pass').autocomplete = m === 'register' ? 'new-password' : 'current-password';
      $('#auth-submit').textContent = m === 'register' ? 'RO‘YXATDAN O‘TISH' : 'KIRISH'; $('#auth-error').textContent = '';
    };
    document.querySelectorAll('[data-am]').forEach(b => b.onclick = () => setMode(b.dataset.am));
    document.querySelectorAll('.pw-eye').forEach(b => b.onclick = () => { const i = $(`#${b.dataset.eye}`), show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.classList.toggle('on', show); b.textContent = show ? '🙈' : '👁'; i.focus(); });
    $('#auth-demo').onclick = () => { this.locked = false; this.modal.close(); onDemo(); };
    $('#auth-form').onsubmit = async e => {
      e.preventDefault();
      const user = $('#auth-user').value.trim(), pass = $('#auth-pass').value;
      if (mode === 'register' && pass !== $('#auth-pass2').value) { $('#auth-error').textContent = 'Parollar mos emas.'; return; }
      $('#auth-submit').disabled = true;
      const err = await onSubmit(mode, user, pass);
      if (!this.modal.open) return;
      $('#auth-submit').disabled = false;
      if (err) $('#auth-error').textContent = err; else { this.locked = false; this.modal.close(); }
    };
    $('#auth-user').focus();
  }
  renderNews(items) {
    $('#view-news').innerHTML = `<div class="page"><div class="page-head"><small>YANGILIKLAR</small><h2>Nimalar yangi</h2></div><div class="news">${items.map(n => `<article><small>${esc(n.tag)}</small><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></article>`).join('')}</div></div>`;
  }
  botSettings(cfg, onChange) {
    const mark = () => {
      document.querySelectorAll('#bots-t button').forEach(b => b.classList.toggle('on', +b.dataset.n === cfg.t));
      document.querySelectorAll('#bots-ct button').forEach(b => b.classList.toggle('on', +b.dataset.n === cfg.ct));
      document.querySelectorAll('#bots-diff button').forEach(b => b.classList.toggle('on', b.dataset.d === cfg.difficulty));
    };
    document.querySelectorAll('#bots-t button').forEach(b => b.onclick = () => { cfg.t = +b.dataset.n; mark(); onChange(cfg); });
    document.querySelectorAll('#bots-ct button').forEach(b => b.onclick = () => { cfg.ct = +b.dataset.n; mark(); onChange(cfg); });
    document.querySelectorAll('#bots-diff button').forEach(b => b.onclick = () => { cfg.difficulty = b.dataset.d; mark(); onChange(cfg); });
    mark();
  }

  showMenu() { this.modal.close(); this.menu.classList.remove('hidden'); this.hud.classList.add('hidden'); document.body.classList.remove('playing'); this.lastPhase = ''; $('#killfeed').replaceChildren(); $('#scoreboard').classList.add('hidden'); }
  showGame(name) { this.modal.close(); this.menu.classList.add('hidden'); this.hud.classList.remove('hidden'); document.body.classList.add('playing'); $('#location-label').textContent = name; this.lastPhase = ''; this.lastHealth = 100; gsap.fromTo('.hud-top,.hud-bottom', { opacity: 0 }, { opacity: 1, duration: 0.4 }); }
  resume(show) { $('#resume').classList.toggle('hidden', !show); }

  controls() {
    this.dialog(`<small class="eyebrow">FIELD MANUAL</small><h2>Avval reja. Keyin harakat.</h2>
      <p>MR12: 12 raund yarim, 13 raund yutgan jamoa g‘olib. Buy 15 s, raund 1:55, bomba 40 s. Defuse: 10 s, kit bilan 5 s.</p>
      <div class="control-grid"><kbd>W A S D</kbd><span>Harakat (250 u/s)</span><kbd>SHIFT</kbd><span>Jimgina yurish (130 u/s, qadam ovozi yo‘q)</span><kbd>CTRL / C</kbd><span>Cho‘kish (100 u/s)</span>
      <kbd>SPACE</kbd><span>Sakrash (havoda strafe)</span><kbd>1 – 5</kbd><span>Asosiy · Pistolet · Pichoq · Granata · C4</span><kbd>Q</kbd><span>Oxirgi qurolga qaytish</span>
      <kbd>LMB / RMB</kbd><span>Otish / pichoq sanchish · kuchsiz otish</span><kbd>R</kbd><span>Qayta o‘qlash</span><kbd>B</kbd><span>Xarid menyusi</span>
      <kbd>F</kbd><span>Qurolni aylantirib ko‘rish (inspect)</span><kbd>Y / U</kbd><span>Chat: hammaga / faqat jamoaga</span><kbd>Z</kbd><span>Radio buyruqlari (keyin 1–9)</span><kbd>X / G‘ildirak tugmasi</kbd><span>Nishonga olingan joyni jamoaga belgilash (ping)</span><kbd>G</kbd><span>Qo‘ldagi qurolni (yoki C4 ni) tashlash</span><kbd>E</kbd><span>Yerdagi qurolni olish (bir xil slotdagi bilan almashtiradi); bo‘sh slotga ustidan yurib o‘tsangiz o‘zi olinadi</span><kbd>E (ushlab)</kbd><span>Defuse</span><kbd>C4 + LMB</kbd><span>Plant (5-slot, A/B hududida ushlab turing)</span><kbd>TAB</kbd><span>Natijalar</span><kbd>ESC</kbd><span>Sichqonchani bo‘shatish</span></div>`);
  }
  /**
   * Settings with tabs: general (graphics / FPS / volume), mouse (sensitivity, zoom, invert, raw input, wheel, crouch
   * toggle) and keyboard (two bindings per action; click a cell, press a key or mouse button — Esc cancels, Backspace clears).
   */
  settings(o) {
    const ACTS = [['forward', 'Oldinga'], ['back', 'Orqaga'], ['left', 'Chapga'], ['right', 'O‘ngga'], ['jump', 'Sakrash'], ['crouch', 'Cho‘kish'], ['walk', 'Jimgina yurish'],
      ['attack', 'Otish'], ['attack2', 'Ikkinchi otish / scope'], ['reload', 'Qayta o‘qlash'], ['use', 'Olish / defuse'], ['quick', 'Oxirgi qurol'], ['drop', 'Qurolni tashlash'], ['inspect', 'Qurol ko‘rigi'],
      ['slot1', 'Asosiy qurol'], ['slot2', 'Pistolet'], ['slot3', 'Pichoq'], ['slot4', 'Granata'], ['slot5', 'C4'], ['buy', 'Xarid menyusi'], ['scoreboard', 'Natijalar'],
      ['chat', 'Umumiy chat'], ['teamchat', 'Jamoa chati'], ['radio', 'Radio'], ['ping', 'Ping'], ['voice', 'Ovozli gapirish (ushlab turing)']];
    const m = o.mouse, tab = this.settingsTab || 'general';
    this.dialog(`<small class="eyebrow">SYSTEM CONFIGURATION</small><h2>Sozlamalar.</h2>
      <div class="set-tabs">${[['general', 'UMUMIY'], ['mouse', 'SICHQONCHA'], ['keys', 'KLAVIATURA']].map(([k, l]) => `<button data-st="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="set-page" data-page="general">
        <div class="setting"><span>Grafika</span><div class="seg" id="quality-seg">${['low', 'medium', 'high', 'ultra'].map(q => `<button data-q="${q}" class="${q === o.quality ? 'on' : ''}">${{ low: 'TEZKOR', medium: 'O‘RTA', high: 'YUQORI', ultra: 'ULTRA' }[q]}</button>`).join('')}</div></div>
        <div class="setting"><span>FPS limiti</span><div class="seg" id="fps-seg">${[[30, '30'], [60, '60'], [120, '120'], [144, '144'], [0, 'MAX']].map(([v, l]) => `<button data-fps="${v}" class="${v === o.fpsLimit ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <label for="volume">OVOZ</label><input id="volume" type="range" min="0" max="1" step="0.05" value="${o.volume}">
        <p class="note">TEZKOR: soyasiz, kamroq yuklama. O‘RTA (tavsiya): tiniq (MSAA, to‘liq ruxsat), bitta soya kaskadi har 2-kadrda — qurilma qizimaydi. YUQORI: 2 × 1024 px soya. ULTRA: GTAO + bloom, 3 × 2048 px soya. Menyu 30 FPS; yashirin oynada render to‘xtaydi. Pastroq FPS limiti GPU yukini kamaytiradi.</p></div>
      <div class="set-page" data-page="mouse">
        <label for="sensitivity">SICHQONCHA SEZGIRLIGI <b id="sens-val">${m.sensitivity.toFixed(2)}</b></label><input id="sensitivity" type="range" min="0.15" max="2" step="0.01" value="${m.sensitivity}">
        <label for="zoom-sens">SCOPE SEZGIRLIGI <b id="zoom-val">${m.zoomSensitivity.toFixed(2)}</b></label><input id="zoom-sens" type="range" min="0.3" max="1.5" step="0.05" value="${m.zoomSensitivity}">
        ${[['invertY', 'Y o‘qini teskari qilish'], ['rawInput', 'Raw input (OS tezlashtirishsiz)'], ['wheelSwitch', 'G‘ildirak bilan qurol almashtirish'], ['toggleCrouch', 'Cho‘kish — bosib yoqish/o‘chirish']].map(([k, l]) => `<label class="check-row"><input type="checkbox" data-mo="${k}" ${m[k] ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <div class="set-page" data-page="keys"><div class="bind-grid">${ACTS.map(([a, l]) => `<span>${l}</span>${[0, 1].map(i => `<button class="bind" data-bind="${a}" data-i="${i}">${esc(o.keyLabel(o.binds[a]?.[i]))}</button>`).join('')}`).join('')}</div>
        <p class="note">Katakni bosing, keyin tugma yoki sichqoncha tugmasini bosing. Esc — bekor, Backspace — tozalash.</p><button id="binds-reset" class="text-button">Standart holatga qaytarish</button></div>`);
    const show = t => { this.settingsTab = t; document.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === t)); document.querySelectorAll('.set-page').forEach(p => { p.hidden = p.dataset.page !== t; }); };
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = () => show(b.dataset.st)); show(tab);
    document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b)); o.onQuality(b.dataset.q); });
    document.querySelectorAll('[data-fps]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-fps]').forEach(x => x.classList.toggle('on', x === b)); o.onFpsLimit(Number(b.dataset.fps)); });
    $('#volume').oninput = e => o.onVolume(Number(e.target.value));
    $('#sensitivity').oninput = e => { $('#sens-val').textContent = Number(e.target.value).toFixed(2); o.onMouse({ sensitivity: Number(e.target.value) }); };
    $('#zoom-sens').oninput = e => { $('#zoom-val').textContent = Number(e.target.value).toFixed(2); o.onMouse({ zoomSensitivity: Number(e.target.value) }); };
    document.querySelectorAll('[data-mo]').forEach(c => c.onchange = () => o.onMouse({ [c.dataset.mo]: c.checked }));
    document.querySelectorAll('.bind').forEach(b => b.onclick = e => {
      e.stopPropagation(); document.querySelectorAll('.bind').forEach(x => x.classList.remove('wait')); b.classList.add('wait'); b.textContent = '…';
      // ignore the click that opened capture mode; the next key / button press is the binding
      setTimeout(() => o.capture(code => {
        const a = b.dataset.bind, i = Number(b.dataset.i), binds = o.binds;
        if (code !== 'Escape') {
          const next = code === 'Backspace' ? null : code;
          if (next) for (const k of Object.keys(binds)) binds[k] = binds[k].map(c => (c === next ? null : c)); // one input -> one action
          binds[a][i] = next; o.onBinds(binds);
        }
        document.querySelectorAll('.bind').forEach(x => { x.classList.remove('wait'); x.textContent = o.keyLabel(binds[x.dataset.bind]?.[Number(x.dataset.i)]); });
      }), 0);
    });
    $('#binds-reset').onclick = () => { o.onBinds(null); this.settings({ ...o, binds: o.getBinds() }); };
  }
  lobby(state, id, start, leave) {
    const list = t => state.players.filter(p => p.team === t).map(p => `<div><span>${esc(p.name)}${p.id === id ? ' (siz)' : ''}${p.bot ? ' · BOT' : ''}</span><b>${p.id === state.host ? 'HOST' : ''}</b></div>`).join('') || '<div><span>—</span></div>';
    const count = t => state.players.filter(p => p.team === t).length;
    const fill = () => {
      $('#lobby-eyebrow').textContent = `WARMUP · ${clock(state.remaining)}`;
      $('#lobby-t').innerHTML = `<h4>TERRORIST · ${count('TERRORIST')}/5</h4><div class="roster">${list('TERRORIST')}</div>`;
      $('#lobby-ct').innerHTML = `<h4>COUNTER-TERRORIST · ${count('COUNTER_TERRORIST')}/5</h4><div class="roster">${list('COUNTER_TERRORIST')}</div>`;
      const b = $('#start-match'); b.disabled = state.host !== id; b.firstChild.textContent = state.host === id ? 'MATCHNI BOSHLASH ' : 'XONA EGASI KUTILMOQDA ';
    };
    const key = JSON.stringify([state.host, state.remaining | 0, state.players.map(p => [p.id, p.name, p.team])]);
    if (this.modal.open && $('#lobby-eyebrow')) { if (key !== this.lobbyKey) { this.lobbyKey = key; fill(); } return; }
    this.lobbyKey = key;
    this.dialog(`<small class="eyebrow" id="lobby-eyebrow"></small><h2>Jamoani yig‘ing.</h2><p>Do‘stlar quyidagi xona kodini kiritishi mumkin. Har jamoada 5 o‘rin.</p><div class="room-code">${esc(state.code)}</div>
      <div class="teams"><div id="lobby-t"></div><div id="lobby-ct"></div></div>
      <button id="start-match" class="primary full"><span>MATCHNI BOSHLASH </span>${arrow}</button><button id="leave-lobby" class="text-button">Xonadan chiqish</button>`, true);
    fill(); $('#start-match').onclick = start; $('#leave-lobby').onclick = leave;
  }
  buy(state, me, onBuy) {
    const owned = id => me.inv && (Object.values(me.inv.slots).includes(id) || (me.inv.grenades[id] || 0) > 0);
    const columns = [['PISTOLS'], ['SMGS', 'HEAVY'], ['RIFLES'], ['GRENADES'], ['GEAR']];
    const card = ([id, def]) => {
      // Exclude weapons belonging to the enemy team, and the M4 variant not chosen in LOADOUT (CS2 rule)
      if (def.team && def.team !== me.team) return '';
      if ((id === 'm4a4' || id === 'm4a1s') && this.loadoutM4 && id !== this.loadoutM4) return '';
      const name = WEAPONS[id]?.name || BUY_NAMES[id] || id.toUpperCase();
      const poor = me.money < def.price && state.phase !== 'warmup';
      const own = id === 'kevlar' ? me.armor >= 100 : id === 'helmet' ? me.armor >= 100 && me.helmet : id === 'defuser' ? me.kit : owned(id);
      const label = own ? '<span class="badge-own">BOR</span>' : (state.phase === 'warmup' ? 'FREE' : `$${def.price}`);
      return `<button data-buy="${id}" ${own ? 'disabled' : ''} class="${poor ? 'poor' : ''} ${own ? 'own' : ''}"><span><b>${name}</b><small>${statLine(id)}</small></span><strong>${label}</strong></button>`;
    };
    this.dialog(`<small class="eyebrow">EQUIPMENT REQUISITION · ${clock(state.remaining)}</small><h2>Jihozingizni tanlang.</h2><div class="balance">BALANS <strong>$${me.money}</strong></div>
      <div class="buy-cols">${columns.map(col => `<div>${col.map(g => `<h4>${GROUP_NAMES[g]}</h4>${Object.entries(BUY_ITEMS).filter(([, d]) => d.group === g).map(card).join('')}`).join('')}</div>`).join('')}</div><p class="note">Xaridni server tasdiqlaydi. Tanlangan qurol to‘g‘ridan-to‘g‘ri qo‘lga olinadi.</p>`);
    document.querySelectorAll('[data-buy]:not([disabled])').forEach(b => b.onclick = () => onBuy(b.dataset.buy));
  }
  results(state, onExit, gains = null, onDoubleReward = null) {
    const rows = t => state.players.filter(p => p.team === t).sort((a, b) => b.kills - a.kills).map(p => `<div><span>${esc(p.name)}</span><b>${p.kills} / ${p.assists} / ${p.deaths}</b></div>`).join('');
    const canDouble = gains && gains.coins > 0 && typeof onDoubleReward === 'function';
    this.dialog(`<small class="eyebrow">OPERATION COMPLETE</small><h2>${state.result?.winner ? `${TEAM_LABEL[state.result.winner]} — G‘OLIB.` : 'DURANG.'}</h2>
      <div class="final-scores"><span>T <b>${state.scores.TERRORIST}</b></span><span>CT <b>${state.scores.COUNTER_TERRORIST}</b></span></div>
      <div class="teams"><div><h4>T · K / A / D</h4><div class="roster">${rows('TERRORIST')}</div></div><div><h4>CT · K / A / D</h4><div class="roster">${rows('COUNTER_TERRORIST')}</div></div></div>
      ${gains ? `<div class="gains" id="results-gains"><span>+${gains.xp} XP</span><span id="results-coins">◈ +${gains.coins}</span><span>${gains.rating >= 0 ? '+' : ''}${gains.rating} REYTING</span>${gains.levelUp ? '<span class="up">YANGI DARAJA!</span>' : ''}</div>` : ''}
      ${canDouble ? `<button id="btn-double-reward" class="secondary full reward-btn">🎬 2x TANGALAR (+${gains.coins} ◈ REKLAMA)</button>` : ''}
      <button id="results-exit" class="primary full">BOSH MENYU ${arrow}</button>`, true);
    $('#results-exit').onclick = onExit;
    if (canDouble) {
      const btn = $('#btn-double-reward');
      if (btn) btn.onclick = () => onDoubleReward(btn);
    }
  }

  // ------------------------------------------------------------------------------------------- in-game
  event(e, id, players) {
    const name = pid => players.find(p => p.id === pid)?.name || '?';
    if (e.type === 'kill') {
      const row = document.createElement('div'); row.className = `kf ${e.killer === id || e.victim === id ? 'me' : ''}`;
      const w = WEAPONS[e.weapon]?.name || (e.weapon === 'world' ? 'DUNYO' : e.weapon === 'c4' ? 'C4' : e.weapon.toUpperCase());
      row.innerHTML = `<b class="${e.killerTeam === 'TERRORIST' ? 't' : 'ct'}">${esc(e.killerName || 'DUNYO')}</b><i>${w}${e.head ? ' ⌖' : ''}</i><b class="${e.victimTeam === 'TERRORIST' ? 't' : 'ct'}">${esc(e.victimName)}</b>`;
      $('#killfeed').prepend(row); gsap.from(row, { opacity: 0, x: 18, duration: 0.2 }); setTimeout(() => row.remove(), 7000);
    } else if (e.type === 'planted') this.toast(`Bomba ${e.site} hududiga o‘rnatildi. ${RULES.bombSeconds} soniya!`);
    else if (e.type === 'defuseStart' && e.who !== id) this.toast(`${name(e.who)} bombani zararsizlantirmoqda…`);
    else if (e.type === 'defused') this.toast('Bomba zararsizlantirildi.');
    else if (e.type === 'bombPickup') this.toast(`${name(e.who)} bombani oldi.`);
    else if (e.type === 'halftime') this.toast('Yarim vaqt: tomonlar almashdi. Pul 800$ ga qaytdi.');
  }
  hitmarker(head, kill) {
    const el = $('#hitmarker'); el.classList.toggle('head', !!head); el.classList.toggle('kill', !!kill);
    gsap.killTweensOf(el); gsap.fromTo(el, { opacity: 1, scale: 1.2 }, { opacity: 0, scale: 1, duration: kill ? 0.5 : 0.3 });
  }
  damageIndicator(angle) {
    const d = document.createElement('div'); d.className = 'dmg'; d.style.transform = `rotate(${angle}rad)`; $('#dmg-dirs').append(d);
    gsap.fromTo(d, { opacity: 0.95 }, { opacity: 0, duration: 1.4, onComplete: () => d.remove() });
    gsap.killTweensOf('#damage-flash'); gsap.fromTo('#damage-flash', { opacity: 0.45 }, { opacity: 0, duration: 0.5 });
  }
  flash(seconds, full) {
    const el = $('#flashbang'); gsap.killTweensOf(el);
    gsap.timeline().set(el, { opacity: full ? 1 : 0.65 }).to(el, { opacity: full ? 1 : 0.65, duration: Math.min(1.2, seconds * 0.35) }).to(el, { opacity: 0, duration: Math.max(0.3, seconds * 0.65), ease: 'power2.in' });
  }
  spectate(name) { const el = $('#death-notice span'); const text = `${name} KUZATILMOQDA · TAB — natijalar`; if (el.textContent !== text) el.textContent = text; }
  crosshair(gap) { $('#crosshair').style.setProperty('--gap', `${gap.toFixed(1)}px`); }
  setCrosshairVisible(v) { $('#crosshair').style.display = v ? '' : 'none'; }

  update(state, id, hud, extra) {
    const p = state.players.find(q => q.id === id); if (!p) return;
    const el = this.el, t = state.scores.TERRORIST, ct = state.scores.COUNTER_TERRORIST;
    el.health.textContent = p.alive ? p.health : 0; el.health.classList.toggle('low', p.health <= 30);
    el.armor.textContent = p.armor ?? 0; el['armor-label'].textContent = p.helmet ? 'ARMOR+H' : 'ARMOR';
    el.money.textContent = `$${p.money ?? 0}`;
    el['t-score'].textContent = t; el['ct-score'].textContent = ct;
    el.phase.textContent = { warmup: 'WARMUP', buy: 'BUY TIME', live: 'LIVE', post: 'ROUND OVER', matchEnd: 'MATCH OVER' }[state.phase] || state.phase.toUpperCase();
    const planted = state.bomb.state === 'planted';
    el.clock.textContent = clock(planted ? state.bomb.remaining : state.remaining); el.clock.classList.toggle('danger', planted);
    el.round.textContent = state.phase === 'warmup' ? 'O‘YIN BOSHLANISHI KUTILMOQDA' : `RAUND ${state.round} · ${state.half}-YARIM · 13 GA`;
    // weapon panel
    el['weapon-name'].textContent = hud.weapon;
    el.ammo.textContent = hud.mag ?? '—'; el.reserve.textContent = hud.reserve ?? '—'; el.ammo.parentElement.style.visibility = hud.mag === null ? 'hidden' : 'visible';
    el['reload-status'].textContent = hud.reloading ? `QAYTA O‘QLASH ${Math.round(hud.reload * 100)}%` : hud.pin ? 'GRANATA TAYYOR — CHAP TUGMANI QO‘YING' : hud.mag === 0 ? 'R — QAYTA O‘QLASH' : '';
    const slotKey = JSON.stringify([hud.slots.map(s => [s.id, s.active, s.count]), hud.previous, hud.mag, hud.reserve]);
    if (slotKey !== this.slotKey) {
      this.slotKey = slotKey;
      el.slots.innerHTML = hud.slots.map(s => {
        const count = s.slot === 4 && s.count ? `<em>${['he', 'flash', 'smoke'].map(g => `<u class="${s.id === g ? 'on' : ''}" title="${g}">${s.count[g] ? { he: 'HE', flash: 'FB', smoke: 'SM' }[g] + (s.count[g] > 1 ? '×' + s.count[g] : '') : ''}</u>`).join('')}</em>` : '';
        return `<div class="slot ${s.active ? 'active' : ''} ${s.id ? '' : 'empty'}"><kbd>${s.slot}</kbd><span>${s.id ? esc(s.name) : '—'}</span>${count}</div>`;
      }).join('');
      const prev = hud.slots.find(s => s.slot === hud.previous);
      el.qswitch.querySelector('span').textContent = prev?.id ? `⇄ ${prev.slot} · ${prev.name}` : '';
      el.qswitch.style.visibility = prev?.id ? 'visible' : 'hidden';
    }
    const alive = t => state.players.filter(q => q.team === t);
    const ak = alive('TERRORIST').map(q => +q.alive).join('') + '|' + alive('COUNTER_TERRORIST').map(q => +q.alive).join('');
    if (ak !== this.aliveKey) { this.aliveKey = ak; const pips = t => alive(t).map(q => `<i class="${q.alive ? 'on' : ''}"></i>`).join(''); el['t-alive'].innerHTML = pips('TERRORIST'); el['ct-alive'].innerHTML = pips('COUNTER_TERRORIST'); }
    el.fps.textContent = `${Math.round(extra.fps)} FPS`; el.ping.textContent = `${Math.round(p.rtt || 0)} MS`; el.drawcalls.textContent = `${extra.drawCalls} DC`; el.tickinfo.textContent = `TICK ${state.tick}`;
    el.objective.textContent = state.bomb.state === 'planted' ? `⚠ BOMBA ${state.bomb.site} HUDUDIDA · ${p.team === 'COUNTER_TERRORIST' ? 'DEFUSE QILING' : 'HIMOYA QILING'}`
      : state.bomb.carrier === id ? '◆ BOMBA SIZDA · 5 — C4, A/B HUDUDIDA CHAP TUGMANI USHLANG' : state.bomb.state === 'dropped' && p.team === 'TERRORIST' ? '◆ BOMBA TUSHIB QOLDI' : '';
    const prog = $('#interaction'), a = p.action;
    prog.style.display = a && a.progress > 0 ? 'block' : 'none';
    if (a) { prog.querySelector('span').textContent = a.kind === 'plant' ? 'O‘RNATILMOQDA…' : 'ZARARSIZLANTIRILMOQDA…'; prog.querySelector('i').style.width = `${Math.min(100, a.progress / (a.kind === 'plant' ? RULES.plantSeconds : a.need) * 100)}%`; }
    $('#death-notice').classList.toggle('hidden', p.alive || state.phase === 'matchEnd');
    const reviveBtn = $('#btn-revive');
    if (reviveBtn) {
      const canRevive = !p.alive && (state.practice || this.isPractice) && state.phase === 'live' && !this.revivedThisRound;
      reviveBtn.classList.toggle('hidden', !canRevive);
    }
    if (p.health < this.lastHealth) { gsap.killTweensOf('#damage-flash'); gsap.fromTo('#damage-flash', { opacity: 0.35 }, { opacity: 0, duration: 0.5 }); } this.lastHealth = p.health;
    if (this.lastPhase !== state.phase) {
      this.lastPhase = state.phase; const banner = $('#round-banner');
      const winner = state.result?.winner;
      banner.innerHTML = state.phase === 'post' || state.phase === 'matchEnd' ? `<strong class="${winner === 'TERRORIST' ? 't' : 'ct'}">${winner ? TEAM_LABEL[winner] + ' — RAUND SIZNIKI' : 'DURANG'}</strong><small>${REASONS[state.result?.reason] || ''}</small>${state.result?.mvp ? `<em class="mvp">★ MVP: ${esc(state.result.mvp.name)}${state.result.mvp.kills ? ` · ${state.result.mvp.kills} ta o‘ldirish` : ''}</em>` : ''}`
        : state.phase === 'live' ? '<strong>RAUND BOSHLANDI</strong>' : state.phase === 'buy' ? `<strong>RAUND ${state.round}</strong><small>${state.overtime ? `OVERTIME ${state.overtime} · ` : ''}JIHOZLANING · B</small>` : '';
      gsap.killTweensOf(banner); gsap.set(banner, { opacity: banner.textContent ? 1 : 0 }); if (banner.textContent) gsap.to(banner, { opacity: 0, duration: 0.6, delay: 2.6 });
    }
    this.scoreboard(state, id);
  }
  // ------------------------------------------------------------------------------------------- comms
  chatLine({ name, text, team, teamOnly, dead, radio }) {
    const row = document.createElement('div'); row.className = `cl ${team === 'TERRORIST' ? 't' : 'ct'}`;
    row.innerHTML = `${dead ? '<i>*O‘LIK*</i> ' : ''}${teamOnly ? '<i>(JAMOA)</i> ' : ''}<b>${esc(name)}</b>${radio ? ' <i>(radio)</i>' : ''}: <span>${esc(text)}</span>`;
    const log = $('#chat-log'); log.append(row); while (log.children.length > 8) log.firstChild.remove();
    gsap.fromTo(row, { opacity: 0 }, { opacity: 1, duration: 0.15 }); setTimeout(() => gsap.to(row, { opacity: 0, duration: 0.6, onComplete: () => row.remove() }), 9000);
  }
  openChat(teamOnly, onSend, onClose) {
    const form = $('#chat-form'), input = $('#chat-input');
    form.hidden = false; $('#chat-scope').textContent = teamOnly ? 'JAMOA' : 'HAMMA'; input.value = ''; input.focus();
    const close = () => { form.hidden = true; input.blur(); form.onsubmit = null; input.onkeydown = null; onClose(); };
    form.onsubmit = e => { e.preventDefault(); const t = input.value.trim(); if (t) onSend(t); close(); };
    input.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  }
  radioMenu(lines) {
    const m = $('#radio-menu');
    if (!lines) { m.hidden = true; return; }
    m.hidden = false; m.innerHTML = `<small>RADIO · 1-${lines.length}</small>${lines.map((l, i) => `<div><kbd>${i + 1}</kbd> ${esc(l)}</div>`).join('')}<div><kbd>Z</kbd> yopish</div>`;
  }

  drawRadar(state, me, radarMap, yaw, sites = []) {
    const c = this.radar, W = 220, R = 46, scale = W / 2 / R;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, W); c.fillStyle = '#0d1516e6'; c.fillRect(0, 0, W, W);
    c.save(); c.translate(W / 2, W / 2); c.rotate(yaw); // player forward (-z) points up
    const w2c = (x, z) => [(x - me.char.x) * scale, (z - me.char.z) * scale];
    if (radarMap) { const s = (radarMap.half * 2) * scale / radarMap.canvas.width, [ox, oz] = w2c(radarMap.cx - radarMap.half, radarMap.cz - radarMap.half); c.save(); c.translate(ox, oz); c.scale(s, s); c.imageSmoothingEnabled = true; c.drawImage(radarMap.canvas, 0, 0); c.restore(); }
    c.font = '700 12px Barlow Condensed, Arial'; c.textAlign = 'center';
    for (const s of sites) { const [x, z] = w2c(s.x, s.z); c.fillStyle = '#e9b64f'; c.save(); c.translate(x, z); c.rotate(-yaw); c.fillText(s.id, 0, 4); c.restore(); }
    const b = state.bomb; if (b.state === 'planted' || b.state === 'dropped') { const [x, z] = w2c(b.x, b.z); c.fillStyle = b.state === 'planted' ? '#ff3b2a' : '#e9b64f'; c.fillRect(x - 3, z - 3, 6, 6); }
    for (const p of state.players) {
      if (!p.alive || p.id === me.id || !p.char) continue; if (p.team !== me.team && p.hidden) continue;   // enemies appear on radar only while spotted
      const [x, z] = w2c(p.char.x, p.char.z); c.fillStyle = p.team === 'TERRORIST' ? '#e0b45a' : '#6fb2e8'; c.beginPath(); c.arc(x, z, 3.4, 0, 7); c.fill();
      c.strokeStyle = c.fillStyle; c.beginPath(); c.moveTo(x, z); c.lineTo(x - Math.sin(p.char.yaw) * 8, z - Math.cos(p.char.yaw) * 8); c.stroke();
    }
    c.restore(); c.fillStyle = '#fff3c4'; c.beginPath(); c.moveTo(W / 2, W / 2 - 7); c.lineTo(W / 2 + 5, W / 2 + 5); c.lineTo(W / 2 - 5, W / 2 + 5); c.closePath(); c.fill();
    c.strokeStyle = '#ffffff22'; c.strokeRect(0.5, 0.5, W - 1, W - 1);
  }
  scoreboard(state, id) {
    if ($('#scoreboard').classList.contains('hidden')) return;
    $('#sb-title').textContent = `${state.scores.TERRORIST} : ${state.scores.COUNTER_TERRORIST} — RAUND ${state.round}${state.overtime ? ` · OVERTIME ${state.overtime}` : ''}`;
    const me = state.players.find(p => p.id === id);
    const rounds = Math.max(1, (state.scores.TERRORIST || 0) + (state.scores.COUNTER_TERRORIST || 0));
    const team = t => `<table class="${t === 'TERRORIST' ? 't' : 'ct'}"><thead><tr><th>${TEAM_LABEL[t]}</th><th>$</th><th>K</th><th>A</th><th>D</th><th>ADR</th><th>HS%</th><th>★</th><th>PING</th></tr></thead><tbody>${state.players.filter(p => p.team === t).sort((a, b) => b.kills - a.kills || (b.damage || 0) - (a.damage || 0)).map(p => `<tr class="${p.id === id ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td>${esc(p.name)}${p.bot ? ' · BOT' : ''}</td><td>${p.team === me?.team ? '$' + (p.money ?? 0) : '—'}</td><td>${p.kills}</td><td>${p.assists}</td><td>${p.deaths}</td><td>${Math.round((p.damage || 0) / rounds)}</td><td>${p.kills ? Math.round((p.hsKills || 0) / p.kills * 100) : 0}</td><td>${p.mvps || 0}</td><td>${p.bot ? '—' : p.rtt}</td></tr>`).join('')}</tbody></table>`;
    $('.sb-teams').innerHTML = team('TERRORIST') + team('COUNTER_TERRORIST');
  }
}
export const extraSeen = new Set();

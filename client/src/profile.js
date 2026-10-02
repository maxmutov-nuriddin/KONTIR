// Player profile. Two kinds:
//  - account (username + password, see server/Accounts.js): the server owns XP / rating / coins / skins; this module
//    only mirrors it and remembers the session token.
//  - demo (guest): generated automatically, lives for this browser session only (sessionStorage) — progress is not
//    kept and skins cannot be bought, so nothing a guest "earns" survives; only the name and loadout are remembered.
import { newStats, applyMatch, levelOf } from '../../shared/progress.js';
export { levelOf };
const KEY = 'kontir.demo.v2', TOKEN = 'kontir.token';
const NAMES = ['Lochin', 'Burgut', 'Qoplon', "Bo'ri", 'Shunqor', 'Yulduz', 'Chaqmoq', "To'fon", 'Sherdil', 'Temir', 'Olov', 'Kumush'];

export const RANKS = [
  'Kumush I', 'Kumush II', 'Kumush III', 'Kumush IV', 'Kumush Elita', 'Kumush Elita Usta',
  'Oltin Nova I', 'Oltin Nova II', 'Oltin Nova III', 'Oltin Nova Usta',
  'Usta Qo‘riqchi I', 'Usta Qo‘riqchi II', 'Usta Qo‘riqchi Elita', 'Faxriy Qo‘riqchi',
  'Afsonaviy Burgut', 'Afsonaviy Burgut Usta', 'Oliy Usta', 'Global Elita',
];
export const rankOf = rating => RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.floor((rating - 700) / 75)))];

const store = (s, k, v) => { try { if (v === undefined) return s.getItem(k); if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* private mode */ } return null; };
export const getToken = () => store(localStorage, TOKEN);
export const setToken = token => store(localStorage, TOKEN, token ?? null);

export function defaultProfile() {
  const tag = String(1000 + Math.floor(Math.random() * 9000));
  return { id: `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, demo: true, name: `${NAMES[Math.floor(Math.random() * NAMES.length)]}${tag}`, hue: Math.floor(Math.random() * 360), ...newStats() };
}
export function loadProfile() {
  let p = null;
  try { p = JSON.parse(store(sessionStorage, KEY) || 'null'); } catch { p = null; }
  if (!p || typeof p !== 'object' || !p.id) {
    p = defaultProfile();
    const old = store(localStorage, 'kontir.name'); if (old && old !== 'Operator') p.name = old;
    try { const l = JSON.parse(store(localStorage, 'kontir.loadout') || 'null'); if (l) Object.assign(p.loadout, l); } catch { /* ignore */ }
  }
  const base = defaultProfile();
  for (const k of Object.keys(base)) if (p[k] === undefined) p[k] = base[k];
  p.loadout = { ...base.loadout, ...(p.loadout || {}) }; p.demo = true; p.items = []; p.equipped = {}; p.finishes = {}; p.wears = {}; delete p.owned;
  return p;
}
/** Replaces the profile object's contents in place (other modules keep their reference). */
export function adopt(p, next) { for (const k of Object.keys(p)) delete p[k]; Object.assign(p, next); if (!p.id) p.id = `acc-${p.name}`; return p; }
export function saveProfile(p) {
  if (!p.demo) return;
  store(sessionStorage, KEY, JSON.stringify(p)); store(localStorage, 'kontir.name', p.name); store(localStorage, 'kontir.loadout', JSON.stringify(p.loadout));
}
/** Demo only: applies a finished match locally (accounts are rewarded by the server). */
export function recordMatch(p, stats) { const gains = applyMatch(p, stats); saveProfile(p); return gains; }

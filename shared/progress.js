// Progression rules shared by the client (demo profile) and the server (real accounts): XP / coins / rating per match,
// skin wear per match and loadout validation (skin prices live in economy.js). The server is authoritative for accounts; the demo profile uses the same math.
import { FINISH_RARITY, validSkin, matchWear } from './economy.js';
export const LOADOUT_CHOICES = Object.freeze({ t: ['glock', 'p250'], ct: ['usp', 'p250'], m4: ['m4a4', 'm4a1s'] });
export const levelOf = xp => 1 + Math.floor(xp / 1000);

export function newStats() {
  return { xp: 0, rating: 1000, coins: 500, matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, loadout: { t: 'glock', ct: 'usp', m4: 'm4a4' }, items: [], equipped: {}, equippedCT: {}, ads: {}, seq: 0 };
}

/** Old accounts owned finish *patterns*; each becomes one Minimal Wear item on the weapon it was shown on (AK otherwise). */
export function migrateSkins(p) {
  // skins are equipped per side: `equipped` = T, `equippedCT` = CT; accounts from before the split wear the same on both
  if (Array.isArray(p.items)) { if (!p.equippedCT || typeof p.equippedCT !== 'object') p.equippedCT = { ...(p.equipped || {}) }; return p; }
  p.items = []; p.equipped = {}; p.seq = 0; p.ads ||= {};
  const on = Object.entries(p.finishes || {});
  for (const fin of (p.owned || []).filter(f => f !== 'standard' && FINISH_RARITY[f])) {
    const w = on.find(([, f]) => f === fin)?.[0] || 'ak47';
    const item = { id: `i${++p.seq}`, weapon: validSkin(w, fin) ? w : 'ak47', finish: fin, wear: 0.1, seed: p.seq * 97 % 1000 };
    p.items.push(item); if (!p.equipped[item.weapon]) p.equipped[item.weapon] = item.id;
  }
  delete p.owned; delete p.finishes; p.equippedCT = { ...p.equipped };
  return p;
}

/** Applies a finished match; returns the gains shown on the result screen. */
export function applyMatch(p, { won, draw = false, kills = 0, deaths = 0, assists = 0, mvps = 0, rounds = 0 }) {
  const n = v => Math.max(0, Math.min(200, Number(v) || 0));
  kills = n(kills); deaths = n(deaths); assists = n(assists); mvps = n(mvps); rounds = n(rounds);
  const xp = 100 + kills * 25 + assists * 10 + mvps * 50 + (won ? 300 : draw ? 120 : 0) + rounds * 5;
  const coins = 40 + kills * 5 + (won ? 60 : 0);
  const rating = won ? 25 : draw ? 0 : -20;
  const before = levelOf(p.xp);
  p.xp += xp; p.coins += coins; p.rating = Math.max(700, p.rating + rating);
  p.matches++; if (won) p.wins++; p.kills += kills; p.deaths += deaths;
  // equipped skins wear down with use (floats only go up)
  const used = new Set([...Object.values(p.equipped || {}), ...Object.values(p.equippedCT || {})]), dw = matchWear(kills);
  for (const it of p.items || []) if (used.has(it.id)) it.wear = Math.min(1, +(it.wear + dw).toFixed(4));
  return { xp, coins, rating, levelUp: levelOf(p.xp) > before };
}

/** Keeps only valid loadout / equip choices (an equipped item must be owned and belong to that weapon). */
export function cleanChoices(p, { loadout, equipped, equippedCT, privateProfile } = {}) {
  if (typeof privateProfile === 'boolean') p.privateProfile = privateProfile;   // hides inventory and stats from other players
  if (loadout && typeof loadout === 'object') for (const [k, ok] of Object.entries(LOADOUT_CHOICES)) if (ok.includes(loadout[k])) p.loadout[k] = loadout[k];
  const clean = map => {
    const next = {};
    for (const [w, id] of Object.entries(map).slice(0, 64)) { const it = (p.items || []).find(i => i.id === id); if (it && it.weapon === w) next[w] = id; }
    return next;
  };
  if (equipped && typeof equipped === 'object') p.equipped = clean(equipped);
  if (equippedCT && typeof equippedCT === 'object') p.equippedCT = clean(equippedCT);
  return p;
}

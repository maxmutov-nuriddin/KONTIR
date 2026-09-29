// Demo profile: every player gets one automatically on first launch (stored locally). It carries the name, avatar,
// XP / level, a local rank rating, coins earned by playing, unlocked weapon finishes and the loadout. A real account
// system can later replace `storage` with a server-side profile without touching the UI.
const KEY = 'kontir.profile.v1';
const NAMES = ['Lochin', 'Burgut', 'Qoplon', "Bo'ri", 'Shunqor', 'Yulduz', 'Chaqmoq', "To'fon", 'Sherdil', 'Temir', 'Olov', 'Kumush'];

export const RANKS = [
  'Kumush I', 'Kumush II', 'Kumush III', 'Kumush IV', 'Kumush Elita', 'Kumush Elita Usta',
  'Oltin Nova I', 'Oltin Nova II', 'Oltin Nova III', 'Oltin Nova Usta',
  'Usta Qo‘riqchi I', 'Usta Qo‘riqchi II', 'Usta Qo‘riqchi Elita', 'Faxriy Qo‘riqchi',
  'Afsonaviy Burgut', 'Afsonaviy Burgut Usta', 'Oliy Usta', 'Global Elita',
];
export const rankOf = rating => RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.floor((rating - 700) / 75)))];
export const levelOf = xp => 1 + Math.floor(xp / 1000);

export function defaultProfile() {
  const tag = String(1000 + Math.floor(Math.random() * 9000));
  return {
    id: `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, demo: true,
    name: `${NAMES[Math.floor(Math.random() * NAMES.length)]}${tag}`, hue: Math.floor(Math.random() * 360),
    xp: 0, rating: 1000, coins: 500, matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0,
    loadout: { t: 'glock', ct: 'usp', m4: 'm4a4' },
    finishes: {}, owned: ['standard'],
  };
}

export function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { p = null; }
  if (!p || typeof p !== 'object' || !p.id) {
    p = defaultProfile();
    try { const old = localStorage.getItem('kontir.name'); if (old && old !== 'Operator') p.name = old; } catch { /* private mode */ }
  }
  const base = defaultProfile();
  for (const k of Object.keys(base)) if (p[k] === undefined) p[k] = base[k];
  p.loadout = { ...base.loadout, ...(p.loadout || {}) };
  return p;
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); localStorage.setItem('kontir.name', p.name); } catch { /* private mode */ } }

/** Applies a finished match to the profile; returns the gains for the result screen. */
export function recordMatch(p, { won, draw = false, kills = 0, deaths = 0, assists = 0, mvps = 0, rounds = 0 }) {
  const xp = 100 + kills * 25 + assists * 10 + mvps * 50 + (won ? 300 : draw ? 120 : 0) + rounds * 5;
  const coins = 40 + kills * 5 + (won ? 60 : 0);
  const rating = won ? 25 : draw ? 0 : -20;
  const before = levelOf(p.xp);
  p.xp += xp; p.coins += coins; p.rating = Math.max(700, p.rating + rating);
  p.matches++; if (won) p.wins++; p.kills += kills; p.deaths += deaths;
  saveProfile(p);
  return { xp, coins, rating, levelUp: levelOf(p.xp) > before };
}

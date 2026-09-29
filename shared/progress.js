// Progression rules shared by the client (demo profile) and the server (real accounts): XP / coins / rating per match,
// finish prices and loadout validation. The server is authoritative for accounts; the demo profile uses the same math.
export const FINISH_PRICES = Object.freeze({
  standard: 0, desert: 250, forest: 250, urban: 300, arctic: 350, tiger: 600, crimson: 800,
  cobalt: 450, emerald: 450, fade: 1200, carbon: 700, gold: 2500,
});
export const LOADOUT_CHOICES = Object.freeze({ t: ['glock', 'p250'], ct: ['usp', 'p250'], m4: ['m4a4', 'm4a1s'] });
export const levelOf = xp => 1 + Math.floor(xp / 1000);

export function newStats() {
  return { xp: 0, rating: 1000, coins: 500, matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, loadout: { t: 'glock', ct: 'usp', m4: 'm4a4' }, finishes: {}, owned: ['standard'] };
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
  return { xp, coins, rating, levelUp: levelOf(p.xp) > before };
}

/** Keeps only valid loadout / finish choices (finishes must be owned). */
export function cleanChoices(p, { loadout, finishes } = {}) {
  if (loadout && typeof loadout === 'object') for (const [k, ok] of Object.entries(LOADOUT_CHOICES)) if (ok.includes(loadout[k])) p.loadout[k] = loadout[k];
  if (finishes && typeof finishes === 'object') {
    const next = {};
    for (const [wid, fin] of Object.entries(finishes).slice(0, 64)) if (/^[a-z0-9]{2,12}$/.test(wid) && fin !== 'standard' && p.owned.includes(fin)) next[wid] = fin;
    p.finishes = next;
  }
  return p;
}

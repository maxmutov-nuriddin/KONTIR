import { KNIVES, KNIFE_WEAPONS, isKnifeType, knifeModel, VANILLA, AGENTS, isAgentWeapon, validAgent, dailyShop, shopRefreshIn } from './cosmetics.js';
export { KNIVES, KNIFE_WEAPONS, isKnifeType, knifeModel, VANILLA, AGENTS, isAgentWeapon, shopRefreshIn };

// Skin economy shared by the server (authoritative for accounts) and the client (store / inventory display).
// A skin is an ITEM: one weapon + one finish + a wear float. Price = rarity base x weapon demand x wear x market demand.
// Knives and gloves are always ★ (the most valuable tier). Wear grows a little every match the skin is equipped,
// so a Factory New skin slowly becomes Battle-Scarred and loses value — like CS2 floats, but earned by playing.

/** Rarity tiers, cheapest first (CS2 colours). base = price of a Factory New skin on a x1 weapon. */
export const RARITIES = Object.freeze([
  { id: 'consumer', name: 'Iste’mol', color: '#b0c3d9', base: 120 },
  { id: 'industrial', name: 'Sanoat', color: '#5e98d9', base: 300 },
  { id: 'milspec', name: 'Harbiy', color: '#4b69ff', base: 800 },
  { id: 'restricted', name: 'Cheklangan', color: '#8847ff', base: 2000 },
  { id: 'classified', name: 'Maxfiy', color: '#d32ce6', base: 5000 },
  { id: 'covert', name: 'Yashirin', color: '#eb4b4b', base: 12000 },
  { id: 'star', name: '★ Noyob', color: '#e4ae39', base: 30000 },
]);
export const RARITY = Object.freeze(Object.fromEntries(RARITIES.map(r => [r.id, r])));

/** Finish -> rarity on ordinary weapons (knives / gloves are always ★). */
export const FINISH_RARITY = Object.freeze({
  desert: 'consumer', forest: 'consumer', urban: 'industrial', arctic: 'industrial', cobalt: 'milspec', emerald: 'milspec',
  tiger: 'restricted', carbon: 'restricted', crimson: 'classified', ruby: 'classified', fade: 'covert', gold: 'covert', sapphire: 'covert',
  sand_dune: 'consumer', safari_mesh: 'consumer', boreal: 'consumer', night_ops: 'industrial', storm: 'industrial', tide: 'industrial',
  neon_grid: 'milspec', lime: 'milspec', zebra: 'milspec', copper: 'milspec', hex_red: 'restricted', cyber: 'restricted', jade: 'restricted', pop_dots: 'restricted',
  damascus: 'classified', splatter: 'classified', doppler: 'classified', aqua_wave: 'classified', emerald_doppler: 'covert', gold_damascus: 'covert', inferno: 'covert', galaxy: 'covert',
});
/** Finishes that exist for gloves (cloth / leather patterns; metallic paints make no sense on a glove). */
export const GLOVE_FINISHES = Object.freeze(['desert', 'forest', 'urban', 'arctic', 'tiger', 'crimson', 'carbon', 'fade', 'boreal', 'safari_mesh', 'night_ops', 'zebra', 'hex_red', 'splatter', 'inferno']);

/** Wear tiers by float. mul = price factor at the clean end of the tier (it drops a little more inside the tier). */
export const WEAR = Object.freeze([
  { id: 'fn', name: 'Zavoddan yangi', short: 'FN', lo: 0, hi: 0.07, mul: 1 },
  { id: 'mw', name: 'Kam ishlatilgan', short: 'MW', lo: 0.07, hi: 0.15, mul: 0.8 },
  { id: 'ft', name: 'Dalada sinalgan', short: 'FT', lo: 0.15, hi: 0.38, mul: 0.6 },
  { id: 'ww', name: 'Eskirgan', short: 'WW', lo: 0.38, hi: 0.45, mul: 0.48 },
  { id: 'bs', name: 'Jangda titilgan', short: 'BS', lo: 0.45, hi: 1, mul: 0.38 },
]);
export const wearOf = f => WEAR.find(w => f < w.hi) || WEAR[WEAR.length - 1];
export function wearMul(f) { const w = wearOf(f); return w.mul * (1 - 0.15 * Math.min(1, (f - w.lo) / (w.hi - w.lo))); }

/** How much players want a skin on this weapon (popular rifles > pistols > SMGs; knives / gloves on top). */
export const DEMAND = Object.freeze({
  knife: 3, gloves: 2.5, awp: 1.8, ak47: 1.7, m4a4: 1.5, m4a1s: 1.5, deagle: 1.3, usp: 1.2, glock: 1.1,
  galil: 0.9, famas: 0.9, aug: 0.9, sg553: 0.9, ssg08: 0.8, p250: 0.7, fiveseven: 0.7, tec9: 0.7, cz75: 0.7, r8: 0.7,
  mp9: 0.6, mac10: 0.6, mp7: 0.6, ump45: 0.6, p90: 0.65, nova: 0.5, xm1014: 0.5, mag7: 0.5, sawedoff: 0.5, negev: 0.5,
  ...Object.fromEntries(KNIFE_WEAPONS.map(w => [w, KNIVES[knifeModel(w)].demand])), agent_t: 1, agent_ct: 1,
});
export const SKIN_WEAPONS = Object.freeze(Object.keys(DEMAND));
/** Ordinary guns that take paint finishes (no knives, gloves or agents). */
export const GUN_SKIN_WEAPONS = Object.freeze(SKIN_WEAPONS.filter(w => w !== 'knife' && w !== 'gloves' && !isKnifeType(w) && !isAgentWeapon(w)));
export const isStarWeapon = w => w === 'knife' || w === 'gloves' || isKnifeType(w);
export const rarityOf = (weapon, finish) => isAgentWeapon(weapon) ? AGENTS[finish]?.rarity || 'milspec' : isStarWeapon(weapon) ? 'star' : FINISH_RARITY[finish] || 'consumer';
export function validSkin(weapon, finish) {
  if (!Object.hasOwn(DEMAND, weapon)) return false;
  if (isAgentWeapon(weapon)) return validAgent(weapon, finish);
  if (isKnifeType(weapon) && finish === VANILLA) return true;
  return Object.hasOwn(FINISH_RARITY, finish) && (weapon !== 'gloves' || GLOVE_FINISHES.includes(finish));
}
/** Every finish a weapon can carry (store / daily shop listing). */
export function finishesFor(weapon) {
  if (isAgentWeapon(weapon)) return Object.keys(AGENTS).filter(a => validAgent(weapon, a));
  const list = Object.keys(FINISH_RARITY).filter(f => validSkin(weapon, f));
  return isKnifeType(weapon) ? [VANILLA, ...list] : list;
}
/** The equip slot an item is worn in: every knife model goes into the knife slot. */
export const slotOf = weapon => (isKnifeType(weapon) ? 'knife' : weapon);
/** Today's shop (rotates daily, same for everyone) and whether an offer is in it. */
export const todayShop = now => dailyShop(now, { weapons: GUN_SKIN_WEAPONS, finishes: finishesFor });
export const inShop = (weapon, finish, now) => todayShop(now).some(o => o.weapon === weapon && o.finish === finish);

// ---- market: every weapon:finish has a demand multiplier that buys push up, sales push down and time pulls to 1
export const MARKET_MIN = 0.55, MARKET_MAX = 3, MARKET_HALF_LIFE_H = 6;
export const marketKey = (weapon, finish) => `${weapon}:${finish}`;
export function marketMul(market, key, now = Date.now()) {
  const m = market?.[key]; if (!m) return 1;
  const k = Math.pow(0.5, Math.max(0, now - m.t) / 3.6e6 / MARKET_HALF_LIFE_H);
  return 1 + (m.mul - 1) * k;
}
export function marketTrade(market, key, buy, now = Date.now()) {
  const cur = marketMul(market, key, now);
  market[key] = { mul: Math.min(MARKET_MAX, Math.max(MARKET_MIN, cur * (buy ? 1.05 : 0.97))), t: now };
  return market[key].mul;
}

/** Current price of a skin (coins). */
/** ★ knives / gloves: the finish still matters (a Fade knife is worth far more than a desert-camo one). */
const STAR_FINISH = { consumer: 0.55, industrial: 0.7, milspec: 0.85, restricted: 1, classified: 1.3, covert: 1.8 };
export function skinPrice(weapon, finish, wear, market, now) {
  // agents never wear out (cloth kits are not scratched paint): price by their own rarity only
  if (isAgentWeapon(weapon)) return Math.max(10, Math.round(RARITY[rarityOf(weapon, finish)].base * 0.6 * marketMul(market, marketKey(weapon, finish), now) / 5) * 5);
  const r = RARITY[rarityOf(weapon, finish)], star = isStarWeapon(weapon) ? (finish === VANILLA ? 0.75 : STAR_FINISH[FINISH_RARITY[finish]] || 1) : 1;
  return Math.max(10, Math.round(r.base * star * (DEMAND[weapon] || 0.5) * wearMul(wear) * marketMul(market, marketKey(weapon, finish), now) / 5) * 5);
}
export const SELL_RATE = 0.7;          // the market keeps 30 %: buying and re-selling always loses coins

/** Wear gained by every equipped skin after a match (more fighting = more scratches). */
export const matchWear = kills => 0.004 + Math.min(40, Math.max(0, kills)) * 0.0006;

// ---- rewarded ads: fixed amount decided by the server, with a cooldown and a daily cap
export const AD_REWARD = 50, AD_COOLDOWN_MS = 5 * 60 * 1000, AD_DAILY_MAX = 8, DOUBLE_WINDOW_MS = 15 * 60 * 1000;
export const dayKey = now => new Date(now).toISOString().slice(0, 10);
/** Validates a free-coins ad view against the profile's ad log; returns an error code or null. Mutates `ads` when ok. */
export function claimAd(ads, now) {
  if (ads.day !== dayKey(now)) { ads.day = dayKey(now); ads.n = 0; }
  if (ads.n >= AD_DAILY_MAX) return 'daily';
  if (now - (ads.last || 0) < AD_COOLDOWN_MS) return 'cooldown';
  ads.n++; ads.last = now; return null;
}

/** Equipped finish / wear per weapon, the shape the renderer uses. */
export function equippedView(items = [], equipped = {}) {
  const finishes = {}, wears = {}, models = {};
  for (const [w, id] of Object.entries(equipped)) {
    const it = items.find(i => i.id === id); if (!it || slotOf(it.weapon) !== w) continue;
    finishes[w] = it.finish; wears[w] = it.wear;
    if (isKnifeType(it.weapon)) models[w] = knifeModel(it.weapon);          // knife slot: which knife model
  }
  return { finishes, wears, models };
}

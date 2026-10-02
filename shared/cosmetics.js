// Cosmetics catalogue shared by the server (validation, daily shop) and the client (store, inventory, rendering):
// knife models, agents (character skins per side) and the rotating daily shop.

/** ★ knife models. Each is its own skin "weapon" (knife_<id>) and is worn in the knife slot. `demand` scales its price. */
export const KNIVES = Object.freeze({
  bayonet: { name: 'Bayonet', demand: 3.2 },
  m9: { name: 'M9 Bayonet', demand: 3.6 },
  karambit: { name: 'Karambit', demand: 4.2 },
  butterfly: { name: 'Babochka', demand: 4.0 },
  talon: { name: 'Talon', demand: 3.5 },
  skeleton: { name: 'Skeleton', demand: 3.4 },
  stiletto: { name: 'Stiletto', demand: 3.1 },
  classic: { name: 'Classic', demand: 3.2 },
  flip: { name: 'Flip', demand: 2.6 },
  huntsman: { name: 'Huntsman', demand: 2.8 },
  falchion: { name: 'Falchion', demand: 2.6 },
  bowie: { name: 'Bowie', demand: 2.6 },
  ursus: { name: 'Ursus', demand: 2.8 },
  nomad: { name: 'Nomad', demand: 3.0 },
  paracord: { name: 'Paracord', demand: 2.6 },
  survival: { name: 'Survival', demand: 2.4 },
  navaja: { name: 'Navaja', demand: 2.0 },
  gut: { name: 'Gut', demand: 2.2 },
  shadow: { name: 'Shadow Daggers', demand: 2.2 },
});
export const KNIFE_WEAPONS = Object.freeze(Object.keys(KNIVES).map(k => `knife_${k}`));
export const isKnifeType = w => typeof w === 'string' && w.startsWith('knife_') && Object.hasOwn(KNIVES, w.slice(6));
export const knifeModel = w => (isKnifeType(w) ? w.slice(6) : null);
/** Plain (unpainted) finish, only for knife models: the "vanilla" knife. */
export const VANILLA = 'vanilla';

/**
 * Agents: character skins, one set per side. A palette override recolours the procedural operator (uniform, camo,
 * gear, headwear). rarity uses the economy's rarity ids.
 */
export const AGENTS = Object.freeze({
  // ---- T
  t_desert: { side: 'TERRORIST', name: 'Cho‘l bo‘risi', rarity: 'milspec', pal: { uniform: 0xa58d5f, pants: 0x96805a, camo: [0x7d6a48, 0xc2ab80, 0x564a38], scarf: 0x8a6a40 } },
  t_shadow: { side: 'TERRORIST', name: 'Tungi soya', rarity: 'restricted', pal: { uniform: 0x2b2c2e, pants: 0x232426, camo: [0x1b1c1e, 0x3c3e42, 0x111213], gear: 0x1c1c1c, gearDark: 0x141414, webbing: 0x161616, scarf: 0x2a2a2a, boot: 0x1e1a16 } },
  t_forest: { side: 'TERRORIST', name: 'O‘rmon partizani', rarity: 'restricted', pal: { uniform: 0x5a6340, pants: 0x4e5638, camo: [0x3e4a2c, 0x7a8456, 0x2c3220], scarf: 0x4f5a34, gear: 0x33372a } },
  t_crimson: { side: 'TERRORIST', name: 'Qizil qo‘mondon', rarity: 'classified', pal: { uniform: 0x6a2a24, pants: 0x3a2724, camo: [0x4e1c18, 0x8a3a30, 0x2a1210], scarf: 0x9a2e26, patch: 0xe0b040, gear: 0x2a2220 } },
  t_snow: { side: 'TERRORIST', name: 'Qorli tog‘', rarity: 'classified', pal: { uniform: 0xd6d9dc, pants: 0xbfc4c8, camo: [0xa9b0b6, 0xeef1f3, 0x80888f], scarf: 0xcfd4d8, knit: 0xe6e8ea, gear: 0x8a9096 } },
  t_gold: { side: 'TERRORIST', name: 'Oltin sher', rarity: 'covert', pal: { uniform: 0x3a3226, pants: 0x2e281e, camo: [0x6a5428, 0xc9a24e, 0x2a2216], scarf: 0xc9a24e, patch: 0xf2c14e, metal: 0xd4a73a, gear: 0x2a2418 } },
  // ---- CT
  ct_seal: { side: 'COUNTER_TERRORIST', name: 'Dengiz shaytoni', rarity: 'milspec', pal: { uniform: 0x5c6650, pants: 0x535c48, camo: [0x434c3a, 0x8a9478, 0x2e3428], carrier: 0x4f5844, helmet: 0x5c6650 } },
  ct_night: { side: 'COUNTER_TERRORIST', name: 'Tungi operator', rarity: 'restricted', pal: { uniform: 0x23272e, pants: 0x1d2128, camo: [0x161a20, 0x343a44, 0x0e1014], gear: 0x1e2228, gearDark: 0x15181c, webbing: 0x181b20, carrier: 0x1f232a, helmet: 0x22262c, boot: 0x16181c } },
  ct_urban: { side: 'COUNTER_TERRORIST', name: 'Shahar SWAT', rarity: 'restricted', pal: { uniform: 0x5e6266, pants: 0x4c5054, camo: [0x3e4246, 0x8e9296, 0x2a2d30], carrier: 0x2f3236, helmet: 0x3a3d40, gear: 0x34373a, patch: 0x5fa0e8 } },
  ct_navy: { side: 'COUNTER_TERRORIST', name: 'Moviy chaqmoq', rarity: 'classified', pal: { uniform: 0x24344e, pants: 0x1e2c42, camo: [0x18263a, 0x3e5a80, 0x101a28], carrier: 0x1c2a40, helmet: 0x22324a, patch: 0x7fd0ff, gear: 0x1a2438 } },
  ct_arctic: { side: 'COUNTER_TERRORIST', name: 'Arktika guruhi', rarity: 'classified', pal: { uniform: 0xd4d8dc, pants: 0xc0c5ca, camo: [0xa6aeb5, 0xeef1f3, 0x7e868d], carrier: 0xb9bfc5, helmet: 0xdfe3e6, gear: 0x9aa1a7 } },
  ct_elite: { side: 'COUNTER_TERRORIST', name: 'Elita gvardiyasi', rarity: 'covert', pal: { uniform: 0x1d1f22, pants: 0x18191b, camo: [0x2a2620, 0xb8963e, 0x121212], carrier: 0x22201c, helmet: 0x1a1a1a, patch: 0xf2c14e, metal: 0xc9a24e, gear: 0x26231d } },
});
export const AGENT_WEAPON = Object.freeze({ TERRORIST: 'agent_t', COUNTER_TERRORIST: 'agent_ct' });
export const isAgentWeapon = w => w === 'agent_t' || w === 'agent_ct';
export const agentSideOf = w => (w === 'agent_t' ? 'TERRORIST' : w === 'agent_ct' ? 'COUNTER_TERRORIST' : null);
export const validAgent = (weapon, finish) => Object.hasOwn(AGENTS, finish) && AGENTS[finish].side === agentSideOf(weapon);
export const agentsFor = side => Object.keys(AGENTS).filter(k => AGENTS[k].side === side);

// ---- daily shop: a deterministic, date-seeded selection; everyone sees the same offers, they change at 00:00 UTC
export const SHOP_SIZE = { knife: 4, gloves: 2, agent: 4, weapon: 22 };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pick(list, n, r) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
export const shopDay = now => new Date(now).toISOString().slice(0, 10);
/** Milliseconds until the shop rotates. */
export const shopRefreshIn = now => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now; };

/**
 * Today's offers [{ weapon, finish }]. `catalog` = { weapons, finishes(weapon) } supplied by economy.js so this module
 * stays free of price logic.
 */
export function dailyShop(now, catalog) {
  const r = rng(hash(`kontir-shop:${shopDay(now)}`)), out = [];
  const combos = ws => ws.flatMap(w => catalog.finishes(w).map(f => ({ weapon: w, finish: f })));
  out.push(...pick(combos(KNIFE_WEAPONS.concat('knife')), SHOP_SIZE.knife, r));
  out.push(...pick(combos(['gloves']), SHOP_SIZE.gloves, r));
  out.push(...pick(combos(['agent_t']), SHOP_SIZE.agent / 2, r), ...pick(combos(['agent_ct']), SHOP_SIZE.agent / 2, r));
  out.push(...pick(combos(catalog.weapons), SHOP_SIZE.weapon, r));
  return out;
}

// Offline practice: the authoritative Room (same code the server runs) simulated inside the browser, in lockstep with
// the client's 64 Hz command loop. Ping is 0 and prediction never needs a correction. Practice played this way grants
// no account rewards (the server cannot verify a match it did not run).
import { Room } from '../../server/Room.js';
import { Navigation } from '../../server/Navigation.js';
import { RULES } from '../../shared/constants.js';

const LOCAL_ID = 'local-player';
const navCache = new WeakMap();

export class LocalRoom {
  /** @param {object} map client map data (buildMapData) @param {(state:object)=>void} onSnapshot */
  constructor(map, request, onSnapshot) {
    let nav = navCache.get(map.collider);
    if (!nav) { nav = new Navigation(map.collider); navCache.set(map.collider, nav); }
    const diff = ['easy', 'medium', 'hard', 'expert'].includes(request.difficulty) ? request.difficulty : 'medium';
    this.room = new Room('LOCAL', map, nav, { practice: true, botDifficulty: diff });
    this.onSnapshot = onSnapshot;
    const team = request.team === 'COUNTER_TERRORIST' ? 'COUNTER_TERRORIST' : 'TERRORIST';
    const name = String(request.name ?? 'Operator').trim().replace(/[<>&"]/g, '').slice(0, 18) || 'Operator';
    const player = this.room.add(LOCAL_ID, name, team);
    player.rtt = 0;                                          // same process: no network round trip
    // pistol loadout (same rule as the server's applyLoadout)
    const pick = (v, ok) => (ok.includes(v) ? v : undefined), lo = request.loadout || {};
    player.loadout = { TERRORIST: pick(lo.t, ['glock', 'p250']), COUNTER_TERRORIST: pick(lo.ct, ['usp', 'p250']) };
    if (!player.inv.slots[1] && (this.room.phase === 'warmup' || this.room.phase === 'buy')) { const money = player.money; this.room.newLoadout(player); player.money = money; }
    const n = v => (Number.isInteger(v) && v >= 0 && v <= 5 ? v : 5);
    const counts = request.bots && typeof request.bots === 'object' ? { TERRORIST: n(request.bots.t), COUNTER_TERRORIST: n(request.bots.ct) } : null;
    if (counts) counts[player.team] = Math.max(1, counts[player.team]);
    this.room.fillBots(counts); this.room.start();
    this.team = player.team;
  }
  get id() { return LOCAL_ID; }
  snapshot() { return structuredClone(this.room.snapshot(LOCAL_ID)); }
  /** One authoritative tick right after the client produced its command for it. */
  tick(pending) {
    if (pending.length) this.room.enqueue(LOCAL_ID, pending.slice(0, 32));
    this.room.step();
    if (this.room.tick % RULES.snapshotEvery === 0) this.onSnapshot(this.snapshot());
  }
  /** Request / fire-and-forget events the server would handle for a room member. */
  handle(event, payload) {
    const r = this.room;
    switch (event) {
      case 'buy': return r.buy(LOCAL_ID, String(payload));
      case 'sellback': return r.sell(LOCAL_ID, String(payload));
      case 'chat': if (payload && typeof payload === 'object') r.chat(LOCAL_ID, payload.text, payload.team === true); return { ok: true };
      case 'radio': r.radio(LOCAL_ID, payload); return { ok: true };
      case 'ping': if (payload && typeof payload === 'object') r.ping(LOCAL_ID, +payload.x, +payload.y, +payload.z); return { ok: true };
      case 'practice:revive': {
        const p = r.players.get(LOCAL_ID);
        if (!p || p.alive || r.phase !== 'live') return { error: 'Tirilish imkoni yo‘q.' };
        r.respawn(p); return { ok: true };
      }
      case 'start': return { ok: true };
      default: return { error: 'Lokal rejimda mavjud emas.' };
    }
  }
}

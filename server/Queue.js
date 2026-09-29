// CS2-style matchmaking queue: players search with a map pool and a mode; the matcher forms a match per map,
// everybody must ACCEPT within the window, then the server builds a 5v5 room (bots fill empty seats).
//
// Pure logic (no sockets, injectable clock) so it is unit-testable; server.js wires it to Socket.IO.
import { randomBytes } from 'node:crypto';

export const MODES = Object.freeze({
  competitive: { label: 'COMPETITIVE', size: 10, fillAfterMs: 45000, soloAfterMs: 90000 },
  casual: { label: 'CASUAL', size: 10, fillAfterMs: 12000, soloAfterMs: 20000 },
});

export class MatchQueue {
  /**
   * @param {{ mapIds: string[], now?: () => number, acceptMs?: number, modes?: object }} options
   *   modes can override fillAfterMs / soloAfterMs per mode (tests use tiny values).
   */
  constructor({ mapIds, now = () => Date.now(), acceptMs = 20000, modes = {} }) {
    this.mapIds = mapIds; this.now = now; this.acceptMs = acceptMs;
    this.modes = Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, { ...v, ...(modes[k] || {}) }]));
    this.entries = new Map();   // id -> { id, name, maps:Set, mode, since, matchId }
    this.matches = new Map();   // matchId -> { id, mapId, mode, players:[id], accepted:Set, deadline }
  }
  join(id, { name = 'Operator', maps = null, mode = 'competitive' } = {}) {
    if (!this.modes[mode]) mode = 'competitive';
    const pool = (Array.isArray(maps) ? maps : this.mapIds).filter(m => this.mapIds.includes(m));
    const entry = { id, name, maps: new Set(pool.length ? pool : this.mapIds), mode, since: this.now(), matchId: null };
    this.leave(id);
    this.entries.set(id, entry);
    return entry;
  }
  /** Removes a player; a pending match they were in fails (others are requeued by expire()). */
  leave(id) {
    const e = this.entries.get(id);
    if (!e) return null;
    this.entries.delete(id);
    const m = e.matchId && this.matches.get(e.matchId);
    if (m) m.deadline = 0;
    return e;
  }
  searching(mode = null) { let n = 0; for (const e of this.entries.values()) if (!e.matchId && (!mode || e.mode === mode)) n++; return n; }
  status(id) {
    const e = this.entries.get(id);
    return e ? { searching: !e.matchId, mode: e.mode, elapsed: Math.floor((this.now() - e.since) / 1000), inQueue: this.searching(e.mode), maps: [...e.maps] } : null;
  }
  accept(id, matchId) {
    const m = this.matches.get(matchId);
    if (!m || !m.players.includes(id)) return null;
    m.accepted.add(id);
    return m;
  }
  decline(id, matchId) { const m = this.matches.get(matchId); if (m && m.players.includes(id)) { m.declined.add(id); m.deadline = 0; } }

  /** Advances the queue. Returns actions: found | ready | expired. */
  tick() {
    const actions = [], now = this.now();
    // pending matches: all accepted -> ready; deadline passed -> expired (non-accepters leave the queue)
    for (const m of [...this.matches.values()]) {
      if (m.players.every(p => m.accepted.has(p) && this.entries.has(p))) {
        this.matches.delete(m.id);
        for (const p of m.players) this.entries.delete(p);
        actions.push({ type: 'ready', match: m });
      } else if (now >= m.deadline) {
        this.matches.delete(m.id);
        const dropped = m.players.filter(p => !m.accepted.has(p) || m.declined.has(p) || !this.entries.has(p));
        for (const p of m.players) { const e = this.entries.get(p); if (!e) continue; if (dropped.includes(p)) this.entries.delete(p); else e.matchId = null; }
        actions.push({ type: 'expired', match: m, dropped, requeued: m.players.filter(p => !dropped.includes(p)) });
      }
    }
    // form new matches per mode, trying the map that can seat the most waiting players
    for (const [mode, cfg] of Object.entries(this.modes)) {
      for (;;) {
        const free = [...this.entries.values()].filter(e => !e.matchId && e.mode === mode).sort((a, b) => a.since - b.since);
        if (!free.length) break;
        let best = null;
        for (const mapId of this.mapIds) {
          const group = free.filter(e => e.maps.has(mapId));
          if (!group.length) continue;
          const waited = now - group[0].since;
          const ready = group.length >= cfg.size || (group.length >= 2 && waited >= cfg.fillAfterMs) || waited >= cfg.soloAfterMs;
          if (!ready) continue;
          // prefer the longest-waiting player's maps, then bigger groups
          const score = group.length * 1000 + (group.includes(free[0]) ? 500 : 0);
          if (!best || score > best.score) best = { mapId, group: group.slice(0, cfg.size), score };
        }
        if (!best) break;
        const id = 'M' + randomBytes(4).toString('hex').toUpperCase();
        const match = { id, mapId: best.mapId, mode, players: best.group.map(e => e.id), accepted: new Set(), declined: new Set(), deadline: now + this.acceptMs, size: cfg.size };
        for (const e of best.group) e.matchId = id;
        this.matches.set(id, match);
        actions.push({ type: 'found', match });
      }
    }
    return actions;
  }
}

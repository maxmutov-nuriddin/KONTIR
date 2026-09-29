// KONTIR game server: HTTP (static + health), Socket.IO transport, matchmaker and the 64 Hz room tick loop.
import { createServer as createHttpServer } from 'node:http';
import { readFile, access, realpath } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { DT, RULES, TEAM_IDS, validCommand } from '../shared/constants.js';
import { buildMapData } from '../shared/maps.js';
import { Navigation } from './Navigation.js';
import { Room } from './Room.js';
import { MatchQueue } from './Queue.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const normalizeTeam = value => (value === 'CT' || value === 'COUNTER_TERRORIST' ? 'COUNTER_TERRORIST' : 'TERRORIST');

/** Loads manifest + GLBs once; physics (BVH) and navigation are built lazily per map. */
export class MapLibrary {
  constructor(dir) { this.dir = dir; this.manifest = null; this.cache = new Map(); this.pending = new Map(); }
  static async locate() {
    const candidates = [process.env.MAPS_DIR, resolve(here, '../client/public/maps'), resolve(here, '../dist/maps')].filter(Boolean);
    for (const dir of candidates) { try { await access(resolve(dir, 'manifest.json')); return dir; } catch { /* try next */ } }
    throw new Error('maps/manifest.json not found. Run: npm run maps');
  }
  async init() {
    this.manifest = JSON.parse(await readFile(resolve(this.dir, 'manifest.json'), 'utf8'));
    return this;
  }
  list() { return this.manifest.maps.filter(m => m.valid !== false); }
  has(id) { return this.list().some(m => m.id === id); }
  async get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const meta = this.list().find(m => m.id === id);
    if (!meta) throw new Error(`unknown map ${id}`);
    if (this.pending.has(id)) return this.pending.get(id);
    const loading = (async () => {
      const bytes = new Uint8Array(await readFile(resolve(this.dir, meta.collision || meta.file)));
      const data = buildMapData(meta, bytes);
      data.nav = new Navigation(data.collider);
      this.cache.set(id, data);
      return data;
    })();
    this.pending.set(id, loading);
    try { return await loading; } finally { this.pending.delete(id); }
  }
}

/** Room registry + public quick-match queue. */
export class Matchmaker {
  constructor(library, { maxRooms = 24 } = {}) { this.library = library; this.rooms = new Map(); this.maxRooms = maxRooms; this.pending = new Map(); this.publicPending = new Map(); }
  async create(code, mapId, options) {
    if (this.rooms.has(code)) return this.rooms.get(code);
    if (this.pending.has(code)) return this.pending.get(code);
    // Reserve capacity before awaiting disk I/O: concurrent joins share one room.
    if (this.rooms.size + this.pending.size >= this.maxRooms) throw new Error('Server band.');
    const creating = (async () => {
      const map = await this.library.get(mapId);
      const room = new Room(code, map, map.nav, options);
      this.rooms.set(code, room);
      return room;
    })();
    this.pending.set(code, creating);
    try { return await creating; } finally { this.pending.delete(code); }
  }
  /** Public room with a free slot on the requested map, else null. */
  findOpen(mapId) {
    let best = null;
    for (const room of this.rooms.values()) {
      if (!room.isPublic || room.practice || room.map.id !== mapId || room.isFull()) continue;
      if (!best || room.humans().length > best.humans().length) best = room;
    }
    return best;
  }
  async quick(mapId, options) {
    const open = this.findOpen(mapId);
    if (open) return open;
    if (this.publicPending.has(mapId)) return this.publicPending.get(mapId);
    let code;
    do { code = 'Q' + randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code) || this.pending.has(code));
    const creating = this.create(code, mapId, { ...options, isPublic: true });
    this.publicPending.set(mapId, creating);
    try { return await creating; } finally { this.publicPending.delete(mapId); }
  }
  remove(code) { this.rooms.delete(code); }
}

/** KONTIR_TIMING='{"freeze":40,"warmup":5}' shortens/lengthens phases (seconds) for tests and private servers. */
const envTiming = () => { try { return process.env.KONTIR_TIMING ? JSON.parse(process.env.KONTIR_TIMING) : undefined; } catch { return undefined; } };

export async function createGameServer({ port = Number(process.env.PORT || 3101), host = '0.0.0.0', staticRoot = resolve(here, '../dist'), quiet = false, timing = envTiming(), queue: queueOptions = {} } = {}) {
  const library = await new MapLibrary(await MapLibrary.locate()).init();
  const matchmaker = new Matchmaker(library);
  const queue = new MatchQueue({ mapIds: library.list().map(m => m.id), ...queueOptions });
  const rooms = matchmaker.rooms;
  let serverStats = { ticks: 0, worstMs: 0 };

  staticRoot = resolve(staticRoot);
  // Both lexical and real paths must stay inside the public directory (including symlinks).
  const publicFile = async (root, name) => {
    const path = resolve(root, name);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Outside public root');
    const [base, actual] = await Promise.all([realpath(root), realpath(path)]);
    if (actual !== base && !actual.startsWith(base + sep)) throw new Error('Outside public root');
    return readFile(actual);
  };
  const http = createHttpServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); decodeURIComponent(url.pathname); }
    catch { res.writeHead(400); res.end(); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, searching: queue.searching(), rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.humans().length, 0), tickRate: 1 / DT, stepMs: [...rooms.values()].map(r => +r.stats.stepMs.toFixed(3)), worstMs: +serverStats.worstMs.toFixed(2) }));
    }
    if (url.pathname.startsWith('/maps/')) { // serve maps even without a client build
      try { const data = await publicFile(resolve(library.dir), decodeURIComponent(url.pathname.slice(6))); res.writeHead(200, { 'Content-Type': MIME[extname(url.pathname)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' }); return res.end(data); }
      catch { res.writeHead(404); return res.end(); }
    }
    try {
      let path = resolve(staticRoot, '.' + decodeURIComponent(url.pathname));
      if (path !== staticRoot && !path.startsWith(staticRoot + sep)) { res.writeHead(403); return res.end(); }
      if (!extname(path)) path = resolve(staticRoot, 'index.html');
      const data = await publicFile(staticRoot, path);
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('Run npm run dev, or npm run build && npm start.'); }
  });
  const io = new Server(http, { maxHttpBufferSize: 32768, cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined });

  /** Loadout preferences from the (demo) profile: starting pistol per side. Validated, then applied to the current loadout. */
  function applyLoadout(room, player, loadout) {
    if (!loadout || typeof loadout !== 'object') return;
    const pick = (v, ok) => (ok.includes(v) ? v : undefined);
    player.loadout = { TERRORIST: pick(loadout.t, ['glock', 'p250']), COUNTER_TERRORIST: pick(loadout.ct, ['usp', 'p250']) };
    if (!player.inv.slots[1] && (room.phase === 'warmup' || room.phase === 'buy')) { const money = player.money; room.newLoadout(player); player.money = money; }
  }
  function leave(socket) {
    const code = socket.data.room, room = rooms.get(code);
    socket.data.joinVersion = (socket.data.joinVersion || 0) + 1;
    socket.data.room = null;
    if (!room) return;
    room.remove(socket.id); socket.leave(code);
  }

  io.on('connection', socket => {
    socket.data.window = performance.now(); socket.data.packets = 0;
    // ---- matchmaking (CS2-style: map pool -> search -> ACCEPT -> room)
    socket.on('queue:join', (request, ack) => {
      if (typeof ack !== 'function') return;
      if (socket.data.room) return ack({ error: 'Avval o‘yindan chiqing.' });
      if (!request || typeof request !== 'object') return ack({ error: 'Noto‘g‘ri so‘rov.' });
      const name = String(request.name ?? 'Operator').trim().replace(/[<>&"]/g, '').slice(0, 18) || 'Operator';
      const maps = Array.isArray(request.maps) ? request.maps.filter(m => typeof m === 'string').slice(0, 16) : null;
      const e = queue.join(socket.id, { name, maps, mode: request.mode === 'casual' ? 'casual' : 'competitive' });
      socket.data.queued = true; socket.data.loadout = request.loadout;
      ack({ ok: true, ...queue.status(socket.id), maps: [...e.maps] });
    });
    socket.on('queue:leave', () => { queue.leave(socket.id); socket.data.queued = false; });
    socket.on('queue:accept', matchId => { const m = queue.accept(socket.id, String(matchId)); if (m) for (const p of m.players) io.to(p).emit('queue:accepted', { matchId: m.id, accepted: m.accepted.size, total: m.players.length }); });
    socket.on('queue:decline', matchId => queue.decline(socket.id, String(matchId)));
    socket.on('maps', (_, ack) => typeof ack === 'function' && ack({ maps: library.list().map(({ id, name, subtitle }) => ({ id, name, subtitle })) }));
    socket.on('join', async (request, ack) => {
      if (typeof ack !== 'function') return;
      let ownsJoin = false;
      try {
        const now = performance.now();
        if (now - (socket.data.lastJoin ?? -10000) < 800) return ack({ error: 'Bir soniya kuting.' });
        socket.data.lastJoin = now;
        if (socket.data.joining) return ack({ error: 'Ulanish davom etmoqda.' });
        if (socket.data.room) return ack({ error: 'Avval xonadan chiqing.' });
        queue.leave(socket.id);
        if (!request || typeof request !== 'object' || Array.isArray(request)) return ack({ error: 'Noto‘g‘ri so‘rov.' });
        socket.data.joining = true; ownsJoin = true;
        const joinVersion = socket.data.joinVersion || 0;
        const practice = request?.practice === true, quick = request?.quick === true;
        if (practice && quick) return ack({ error: 'Bitta kirish usulini tanlang.' });
        const mapId = library.has(request?.mapId) ? request.mapId : library.list()[0].id;
        let room = null;
        if (quick) room = await matchmaker.quick(mapId, { timing });
        else if (!practice) {
          const code = String(request?.code ?? '').trim().toUpperCase();
          if (!/^[A-Z0-9]{4,8}$/.test(code)) return ack({ error: 'Xona kodi 4–8 harf yoki raqamdan iborat bo‘lsin.' });
          room = rooms.get(code) || null;
          if (!room) room = await matchmaker.create(code, mapId, { timing });
        }
        if (!room) {
          const code = (practice ? 'P' : 'Q') + randomBytes(3).toString('hex').toUpperCase();
          const diff = ['easy', 'medium', 'hard', 'expert'].includes(request?.difficulty) ? request.difficulty : 'medium';
          room = await matchmaker.create(code, mapId, { isPublic: quick, practice, timing, botDifficulty: diff });
        }
        while (quick && room.isFull() && socket.connected) room = await matchmaker.quick(mapId, { timing });
        if (!socket.connected || joinVersion !== (socket.data.joinVersion || 0)) return;
        if (room.practice && !practice) return ack({ error: 'Mashq xonasi shaxsiy.' });
        if (room.isFull()) return ack({ error: 'Xona to‘la (5 T + 5 CT).' });
        const name = String(request?.name ?? 'Operator').trim().replace(/[<>&"]/g, '').slice(0, 18) || 'Operator';
        const player = room.add(socket.id, name, normalizeTeam(request?.team));
        if (!player) return ack({ error: 'Tanlangan jamoa to‘la.' });
        applyLoadout(room, player, request?.loadout);
        if (practice) {
          const n = v => (Number.isInteger(v) && v >= 0 && v <= 5 ? v : 5);
          const counts = request?.bots && typeof request.bots === 'object' ? { TERRORIST: n(request.bots.t), COUNTER_TERRORIST: n(request.bots.ct) } : null;
          if (counts) counts[player.team] = Math.max(1, counts[player.team]);   // the human counts toward their side
          room.fillBots(counts); room.start();
        }
        socket.data.room = room.code; socket.join(room.code);
        ack({ ok: true, id: socket.id, code: room.code, team: player.team, snapshot: room.snapshot(socket.id) });
      } catch (error) { if (!quiet) console.error('Join failed:', error); ack({ error: 'Xonaga ulanib bo‘lmadi.' }); }
      finally { if (ownsJoin) socket.data.joining = false; }
    });
    socket.on('commands', batch => {
      const now = performance.now();
      if (now - socket.data.window > 1000) { socket.data.window = now; socket.data.packets = 0; }
      if (++socket.data.packets > 120 || !Array.isArray(batch) || batch.length > 32 || !batch.every(validCommand)) return;
      rooms.get(socket.data.room)?.enqueue(socket.id, batch);
    });
    socket.on('start', (_, ack) => {
      const room = rooms.get(socket.data.room);
      if (!room || room.host !== socket.id) return typeof ack === 'function' && ack({ error: 'Faqat xona egasi boshlaydi.' });
      if (room.phase !== 'warmup') return typeof ack === 'function' && ack({ error: 'O‘yin allaqachon boshlangan.' });
      // a host waiting alone (or with one team only) can start against bots; humans replace bots as they join
      if (room.count('TERRORIST') === 0 || room.count('COUNTER_TERRORIST') === 0 || room.humans().length < 2) room.fillBots();
      room.start(); if (typeof ack === 'function') ack({ ok: true });
    });
    socket.on('buy', (item, ack) => {
      if (typeof ack !== 'function') return;
      const now = performance.now();
      if (now - (socket.data.lastBuy ?? -1000) < 120) return ack({ error: 'Bir oz kuting.' });
      socket.data.lastBuy = now;
      ack(rooms.get(socket.data.room)?.buy(socket.id, String(item)) || { error: 'Xona topilmadi.' });
    });
    socket.on('leave', () => leave(socket));
    socket.on('disconnect', () => { queue.leave(socket.id); leave(socket); });
  });

  // ---- 64 Hz fixed-step loop (setInterval drives, an accumulator keeps simulation time exact)
  let previous = performance.now();
  const loop = setInterval(() => {
    const now = performance.now(), elapsed = Math.min(0.1, (now - previous) / 1000); previous = now;
    for (const [code, room] of rooms) {
      // No humans: stop bot physics immediately, retain the room briefly for joins.
      if (room.humans().length === 0) {
        room.emptyAt ??= now;
        if (now - room.emptyAt > 20000) matchmaker.remove(code);
        continue;
      }
      room.emptyAt = null;
      room.accumulator += elapsed;
      let steps = 0;
      while (room.accumulator >= DT && steps++ < 7) {
        const t0 = performance.now();
        room.step(); room.accumulator -= DT;
        serverStats.ticks++; serverStats.worstMs = Math.max(serverStats.worstMs * 0.999, performance.now() - t0);
        if (room.tick % RULES.snapshotEvery === 0) for (const p of room.players.values()) if (!p.bot) io.to(p.id).volatile.emit('snapshot', room.snapshot(p.id));
        for (const p of room.humans()) if (room.tick - p.lastCommandTick > 64 * 30 && room.tick - p.joinedTick > 64 * 30) { io.to(p.id).emit('kicked', { reason: 'AFK' }); io.sockets.sockets.get(p.id)?.disconnect(true); }
      }
      if (room.humans().length === 0) { room.emptySince ??= room.tick; if (room.tick - room.emptySince > 64 * 20) matchmaker.remove(code); }
    }
  }, 8);
  // ---- matchmaking pump (1 Hz): status to searchers, found / ready / expired transitions
  async function startMatch(m) {
    const alive = m.players.map(id => io.sockets.sockets.get(id)).filter(s => s?.connected && !s.data.room);
    if (!alive.length) return;
    let room;
    try {
      let code; do { code = 'M' + randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
      room = await matchmaker.create(code, m.mapId, { timing, isPublic: false });
    } catch (error) { for (const s of alive) s.emit('queue:failed', { reason: 'Server band. Qayta qidiring.' }); return; }
    room.match = { mode: m.mode, id: m.id };
    // random, balanced sides like a real matchmade game
    const order = alive.map(s => s).sort(() => Math.random() - 0.5);
    order.forEach((s, i) => {
      const e = s.data.queueName || 'Operator';
      const player = room.add(s.id, e, i % 2 ? 'COUNTER_TERRORIST' : 'TERRORIST');
      if (!player) return;
      applyLoadout(room, player, s.data.loadout);
      s.data.room = room.code; s.data.queued = false; s.join(room.code);
    });
    room.fillBots(); room.start();
    for (const s of order) {
      const p = room.players.get(s.id); if (!p) continue;
      s.emit('queue:ready', { ok: true, id: s.id, code: room.code, team: p.team, mode: m.mode, snapshot: room.snapshot(s.id) });
    }
  }
  const pump = setInterval(() => {
    for (const a of queue.tick()) {
      const { match: m } = a;
      if (a.type === 'found') {
        const meta = library.list().find(x => x.id === m.mapId);
        for (const p of m.players) {
          const s = io.sockets.sockets.get(p); if (s) s.data.queueName = queue.entries.get(p)?.name;
          io.to(p).emit('queue:found', { matchId: m.id, mapId: m.mapId, mapName: meta?.name || m.mapId, mode: m.mode, players: m.players.length, size: m.size, acceptSeconds: Math.round((m.deadline - Date.now()) / 1000) });
        }
      } else if (a.type === 'ready') startMatch(m).catch(error => { if (!quiet) console.error('match start failed', error); });
      else if (a.type === 'expired') {
        for (const p of a.dropped) { io.to(p).emit('queue:failed', { reason: 'Match qabul qilinmadi.' }); const s = io.sockets.sockets.get(p); if (s) s.data.queued = false; }
        for (const p of a.requeued) io.to(p).emit('queue:requeued', { reason: 'Kimdir qabul qilmadi — qidiruv davom etmoqda.' });
      }
    }
    for (const e of queue.entries.values()) if (!e.matchId) io.to(e.id).emit('queue:status', queue.status(e.id));
  }, queueOptions.pumpMs || 1000);
  const probes = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      const started = performance.now();
      socket.timeout(1500).emit('probe', error => {
        if (error) return;
        const p = rooms.get(socket.data.room)?.players.get(socket.id);
        if (p) p.rtt = p.rtt * 0.6 + Math.min(500, performance.now() - started) * 0.4;
      });
    }
  }, 1000);

  try {
    await new Promise((done, reject) => {
      http.once('error', reject);
      http.listen(port, host, () => { http.off('error', reject); done(); });
    });
  } catch (error) {
    clearInterval(loop); clearInterval(probes); clearInterval(pump); io.close(); throw error;
  }
  const address = http.address();
  if (!quiet) console.log(`KONTIR server: http://localhost:${address.port}  (64 tick, maps: ${library.list().map(m => m.id).join(', ')})`);
  const close = async () => { clearInterval(loop); clearInterval(probes); clearInterval(pump); await new Promise(r => io.close(r)); http.closeAllConnections?.(); };
  return { http, io, rooms, matchmaker, library, queue, port: address.port, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createGameServer();
  const stop = () => server.close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
export { TEAM_IDS };

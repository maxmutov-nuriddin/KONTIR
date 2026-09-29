// KONTIR game server: HTTP (static + health), Socket.IO transport, matchmaker and the 64 Hz room tick loop.
import { createServer as createHttpServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { DT, RULES, TEAM_IDS, validCommand } from '../shared/constants.js';
import { buildMapData } from '../shared/maps.js';
import { Navigation } from './Navigation.js';
import { Room } from './Room.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const normalizeTeam = value => (value === 'CT' || value === 'COUNTER_TERRORIST' ? 'COUNTER_TERRORIST' : 'TERRORIST');

/** Loads manifest + GLBs once; physics (BVH) and navigation are built lazily per map. */
export class MapLibrary {
  constructor(dir) { this.dir = dir; this.manifest = null; this.cache = new Map(); }
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
    const bytes = new Uint8Array(await readFile(resolve(this.dir, meta.collision || meta.file)));
    const data = buildMapData(meta, bytes);
    data.nav = new Navigation(data.collider);
    this.cache.set(id, data);
    return data;
  }
}

/** Room registry + public quick-match queue. */
export class Matchmaker {
  constructor(library, { maxRooms = 24 } = {}) { this.library = library; this.rooms = new Map(); this.maxRooms = maxRooms; }
  async create(code, mapId, options) {
    if (this.rooms.size >= this.maxRooms) throw new Error('Server band.');
    const map = await this.library.get(mapId);
    const room = new Room(code, map, map.nav, options);
    this.rooms.set(code, room);
    return room;
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
  remove(code) { this.rooms.delete(code); }
}

/** KONTIR_TIMING='{"freeze":40,"warmup":5}' shortens/lengthens phases (seconds) for tests and private servers. */
const envTiming = () => { try { return process.env.KONTIR_TIMING ? JSON.parse(process.env.KONTIR_TIMING) : undefined; } catch { return undefined; } };

export async function createGameServer({ port = Number(process.env.PORT || 3101), host = '0.0.0.0', staticRoot = resolve(here, '../dist'), quiet = false, timing = envTiming() } = {}) {
  const library = await new MapLibrary(await MapLibrary.locate()).init();
  const matchmaker = new Matchmaker(library);
  const rooms = matchmaker.rooms;
  let serverStats = { ticks: 0, worstMs: 0 };

  const http = createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.humans().length, 0), tickRate: 1 / DT, stepMs: [...rooms.values()].map(r => +r.stats.stepMs.toFixed(3)), worstMs: +serverStats.worstMs.toFixed(2) }));
    }
    if (url.pathname.startsWith('/maps/')) { // serve maps even without a client build
      try { const data = await readFile(resolve(library.dir, decodeURIComponent(url.pathname.slice(6)).replace(/^\/+/, ''))); res.writeHead(200, { 'Content-Type': MIME[extname(url.pathname)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' }); return res.end(data); }
      catch { res.writeHead(404); return res.end(); }
    }
    try {
      let path = resolve(staticRoot, '.' + decodeURIComponent(url.pathname));
      if (path !== staticRoot && !path.startsWith(staticRoot + sep)) { res.writeHead(403); return res.end(); }
      if (!extname(path)) path = resolve(staticRoot, 'index.html');
      const data = await readFile(path);
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('Run npm run dev, or npm run build && npm start.'); }
  });
  const io = new Server(http, { maxHttpBufferSize: 32768, cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined });

  function leave(socket) {
    const code = socket.data.room, room = rooms.get(code);
    socket.data.room = null;
    if (!room) return;
    room.remove(socket.id); socket.leave(code);
  }

  io.on('connection', socket => {
    socket.data.window = performance.now(); socket.data.packets = 0;
    socket.on('maps', (_, ack) => typeof ack === 'function' && ack({ maps: library.list().map(({ id, name, subtitle }) => ({ id, name, subtitle })) }));
    socket.on('join', async (request, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const now = performance.now();
        if (now - (socket.data.lastJoin ?? -10000) < 800) return ack({ error: 'Bir soniya kuting.' });
        socket.data.lastJoin = now;
        if (socket.data.room) return ack({ error: 'Avval xonadan chiqing.' });
        const practice = request?.practice === true, quick = request?.quick === true;
        const mapId = library.has(request?.mapId) ? request.mapId : library.list()[0].id;
        let room = null;
        if (quick) room = matchmaker.findOpen(mapId);
        else if (!practice) {
          const code = String(request?.code ?? '').trim().toUpperCase();
          if (!/^[A-Z0-9]{4,8}$/.test(code)) return ack({ error: 'Xona kodi 4–8 harf yoki raqamdan iborat bo‘lsin.' });
          room = rooms.get(code) || null;
          if (!room) room = await matchmaker.create(code, mapId, { timing });
        }
        if (!room) {
          const code = (practice ? 'P' : 'Q') + randomBytes(3).toString('hex').toUpperCase();
          room = await matchmaker.create(code, mapId, { isPublic: quick, practice, timing });
        }
        if (room.isFull()) return ack({ error: 'Xona to‘la (5 T + 5 CT).' });
        const name = String(request?.name ?? 'Operator').trim().replace(/[<>&"]/g, '').slice(0, 18) || 'Operator';
        const player = room.add(socket.id, name, normalizeTeam(request?.team));
        if (!player) return ack({ error: 'Tanlangan jamoa to‘la.' });
        if (practice) { room.fillBots(); room.start(); }
        socket.data.room = room.code; socket.join(room.code);
        ack({ ok: true, id: socket.id, code: room.code, team: player.team, snapshot: room.snapshot(socket.id) });
      } catch (error) { ack({ error: error.message || 'Xatolik.' }); }
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
    socket.on('disconnect', () => leave(socket));
  });

  // ---- 64 Hz fixed-step loop (setInterval drives, an accumulator keeps simulation time exact)
  let previous = performance.now();
  const loop = setInterval(() => {
    const now = performance.now(), elapsed = Math.min(0.1, (now - previous) / 1000); previous = now;
    for (const [code, room] of rooms) {
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
  }, 4);
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

  await new Promise(done => http.listen(port, host, done));
  const address = http.address();
  if (!quiet) console.log(`KONTIR server: http://localhost:${address.port}  (64 tick, maps: ${library.list().map(m => m.id).join(', ')})`);
  const close = async () => { clearInterval(loop); clearInterval(probes); await new Promise(r => io.close(r)); http.closeAllConnections?.(); };
  return { http, io, rooms, matchmaker, library, port: address.port, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await createGameServer();
  const stop = () => server.close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
export { TEAM_IDS };

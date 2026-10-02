// Username + password accounts (no e-mail). Stored as one JSON file (KONTIR_DATA dir, default ./data):
// passwords are scrypt-hashed with a per-user salt, session tokens are kept only as SHA-256 hashes.
// The server owns progression (XP, coins, rating, owned finishes); clients may only change loadout / equipped finishes.
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { MongoClient } from 'mongodb';
import { newStats, applyMatch, cleanChoices, migrateSkins } from '../shared/progress.js';
import { skinPrice, validSkin, WEAR, marketKey, marketTrade, SELL_RATE, AD_REWARD, DOUBLE_WINDOW_MS, claimAd, equippedView } from '../shared/economy.js';

const scrypt = promisify(scryptCb);
const TOKEN_TTL = 30 * 24 * 3600 * 1000;
const sha = s => createHash('sha256').update(s).digest('hex');
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export class Accounts {
  constructor(file, { now = () => Date.now(), mongoUri = process.env.MONGODB_URI } = {}) {
    this.file = file;
    this.mongoUri = (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT || process.execArgv.some(a => a.includes('test')) || file?.includes('kontir-acc-')) ? null : mongoUri;
    this.now = now;
    this.users = {};
    this.tokens = {};
    this.messages = {};
    this.market = {};
    this.saving = null;
    this.dirty = false;
    this.client = null;
    this.db = null;
    this.snap = {};   // last state known to be in MongoDB, per user and top-level field (JSON strings)
    this.pullTimer = null;
  }
  static fields(u) { const o = {}; for (const [k, v] of Object.entries(u)) o[k] = JSON.stringify(v); return o; }
  async load() {
    try {
      const d = JSON.parse(await readFile(this.file, 'utf8'));
      this.users = d.users || {};
      this.tokens = d.tokens || {};
      this.messages = d.messages || {};
      this.market = d.market || {};
    } catch { /* first run */ }

    if (this.mongoUri && process.env.NODE_ENV !== 'test') {
      try {
        this.client = new MongoClient(this.mongoUri, { serverSelectionTimeoutMS: 5000 });
        await this.client.connect();
        this.db = this.client.db('kontir');
        console.log('[KONTIR] MongoDB ga muvaffaqiyatli ulandi.');

        const userDocs = await this.db.collection('users').find().toArray();
        for (const doc of userDocs) {
          const { _id, ...rest } = doc;
          this.users[_id] = rest; this.snap[_id] = Accounts.fields(rest);
        }
        this.pullTimer = setInterval(() => this.pull().catch(() => {}), 10000); this.pullTimer.unref?.();

        const tokenDocs = await this.db.collection('tokens').find().toArray();
        for (const doc of tokenDocs) {
          const { _id, ...rest } = doc;
          this.tokens[_id] = rest;
        }

        const marketDoc = await this.db.collection('meta').findOne({ _id: 'market' }); if (marketDoc?.market) this.market = marketDoc.market;
        const messageDocs = await this.db.collection('messages').find().toArray();
        for (const doc of messageDocs) {
          const { _id, list } = doc;
          this.messages[_id] = list;
        }
      } catch (err) {
        console.error('[KONTIR] MongoDB ulanishida xatolik (mahalliy fayldan foydalaniladi):', err.message);
      }
    }
    return this;
  }
  /** Atomic, coalesced write (tmp file + rename + MongoDB sync). */
  save() {
    this.dirty = true;
    if (this.saving) return this.saving;
    this.saving = (async () => {
      while (this.dirty) {
        this.dirty = false;
        const t = this.now();
        for (const [k, v] of Object.entries(this.tokens)) if (v.exp < t) delete this.tokens[k];
        try {
          await mkdir(dirname(this.file), { recursive: true });
          await writeFile(this.file + '.tmp', JSON.stringify({ users: this.users, tokens: this.tokens, messages: this.messages, market: this.market }));
          await rename(this.file + '.tmp', this.file);
        } catch { /* ignore local file errors */ }

        if (this.db) {
          try {
            // write only the fields this server changed, so manual edits in MongoDB are never overwritten
            const userOps = [];
            for (const [id, data] of Object.entries(this.users)) {
              const cur = Accounts.fields(data), old = this.snap[id] || {}, $set = {}, $unset = {};
              for (const k of Object.keys(cur)) if (cur[k] !== old[k]) $set[k] = data[k];
              for (const k of Object.keys(old)) if (!(k in cur)) $unset[k] = '';
              const update = {}; if (Object.keys($set).length) update.$set = $set; if (Object.keys($unset).length) update.$unset = $unset;
              if (!Object.keys(update).length) continue;
              userOps.push({ updateOne: { filter: { _id: id }, update, upsert: true } });
              this.snap[id] = cur;
            }
            if (userOps.length > 0) await this.db.collection('users').bulkWrite(userOps, { ordered: false });

            const tokenOps = Object.entries(this.tokens).map(([id, data]) => ({
              replaceOne: { filter: { _id: id }, replacement: { _id: id, ...data }, upsert: true }
            }));
            if (tokenOps.length > 0) await this.db.collection('tokens').bulkWrite(tokenOps, { ordered: false });
            await this.db.collection('tokens').deleteMany({ _id: { $nin: Object.keys(this.tokens) } });

            const msgOps = Object.entries(this.messages).map(([id, list]) => ({
              replaceOne: { filter: { _id: id }, replacement: { _id: id, list }, upsert: true }
            }));
            if (msgOps.length > 0) await this.db.collection('messages').bulkWrite(msgOps, { ordered: false });
            await this.db.collection('meta').replaceOne({ _id: 'market' }, { _id: 'market', market: this.market }, { upsert: true });
          } catch (err) {
            console.error('[KONTIR] MongoDB ga saqlashda xatolik:', err.message);
          }
        }
      }
    })().finally(() => { this.saving = null; });
    return this.saving;
  }
  /** Picks up edits made directly in MongoDB: fields not changed locally since the last sync take the DB value. */
  async pull() {
    if (!this.db) return;
    for (const doc of await this.db.collection('users').find().toArray()) {
      const { _id, ...rest } = doc, u = this.users[_id];
      if (!u) { this.users[_id] = rest; this.snap[_id] = Accounts.fields(rest); continue; }
      const old = this.snap[_id] || {}, cur = Accounts.fields(u), db = Accounts.fields(rest);
      for (const k of Object.keys(db)) if (db[k] !== old[k] && cur[k] === old[k]) { u[k] = rest[k]; old[k] = db[k]; }
      this.snap[_id] = old;
    }
  }
  async close() {
    clearInterval(this.pullTimer);
    if (this.client) {
      try { await this.client.close(); } catch { /* ignore */ }
      this.client = null;
      this.db = null;
    }
  }
  public(u) { migrateSkins(u); const { salt, hash, friends, requests, lastGains, ...rest } = u; return { ...rest, ...equippedView(u.items, u.equipped), demo: false }; }
  issue(key) { const token = randomBytes(32).toString('hex'); this.tokens[sha(token)] = { user: key, exp: this.now() + TOKEN_TTL }; this.save(); return token; }

  async register(username, password) {
    username = String(username ?? '').trim(); password = String(password ?? '');
    if (!USERNAME_RE.test(username)) throw new Error('username');
    if (password.length < 6 || password.length > 64) throw new Error('password');
    const key = username.toLowerCase();
    if (this.users[key]) throw new Error('taken');
    const salt = randomBytes(16).toString('hex'), hash = (await scrypt(password, salt, 32)).toString('hex');
    if (this.users[key]) throw new Error('taken'); // raced with another register during scrypt
    this.users[key] = { name: username, salt, hash, created: this.now(), hue: Math.floor(Math.random() * 360), ...newStats() };
    return { token: this.issue(key), profile: this.public(this.users[key]) };
  }
  async login(username, password) {
    const u = this.users[String(username ?? '').trim().toLowerCase()];
    const hash = await scrypt(String(password ?? ''), u?.salt || 'x'.repeat(32), 32); // same cost for unknown users
    if (!u || !timingSafeEqual(hash, Buffer.from(u.hash, 'hex'))) throw new Error('credentials');
    return { token: this.issue(u.name.toLowerCase()), profile: this.public(u) };
  }
  resume(token) {
    const t = this.tokens[sha(String(token ?? ''))];
    if (!t || t.exp < this.now() || !this.users[t.user]) return null;
    return { key: t.user, profile: this.public(this.users[t.user]) };
  }
  logout(token) { delete this.tokens[sha(String(token ?? ''))]; this.save(); }
  update(key, choices) { const u = this.users[key]; if (!u) return null; cleanChoices(u, choices); this.save(); return this.public(u); }
  /** Buys a skin from the market: weapon + finish + wear tier (the exact float is rolled inside the tier). */
  buy(key, req) {
    const u = this.users[key]; if (!u) throw new Error('item'); migrateSkins(u);
    const { weapon, finish, tier } = req && typeof req === 'object' ? req : {};
    const w = WEAR.find(x => x.id === tier);
    if (!validSkin(weapon, finish) || !w) throw new Error('item');
    if (u.items.length >= 200) throw new Error('full');
    const wear = +(w.lo + Math.random() * (Math.min(w.hi, 1) - w.lo) * 0.999).toFixed(4);
    const price = skinPrice(weapon, finish, w.lo, this.market, this.now());     // tier list price (clean end of the tier)
    if (u.coins < price) throw new Error('coins');
    u.coins -= price; u.seq = (u.seq || 0) + 1;
    const item = { id: `i${u.seq}`, weapon, finish, wear, seed: Math.floor(Math.random() * 1000), bought: price };
    u.items.push(item); marketTrade(this.market, marketKey(weapon, finish), true, this.now());
    this.save(); return { profile: this.public(u), item };
  }
  /** Sells an owned skin back to the market at SELL_RATE of its current value (worn skins are worth less). */
  sell(key, itemId) {
    const u = this.users[key]; if (!u) throw new Error('item'); migrateSkins(u);
    const it = u.items.find(i => i.id === itemId); if (!it) throw new Error('item');
    const coins = Math.floor(skinPrice(it.weapon, it.finish, it.wear, this.market, this.now()) * SELL_RATE);
    u.items = u.items.filter(i => i !== it); for (const [w, id] of Object.entries(u.equipped)) if (id === it.id) delete u.equipped[w];
    u.coins += coins; marketTrade(this.market, marketKey(it.weapon, it.finish), false, this.now());
    this.save(); return { profile: this.public(u), coins };
  }
  /** Market multipliers for the store view. */
  marketView() { return this.market; }
  award(key, stats) {
    const u = this.users[key]; if (!u) return null; migrateSkins(u);
    const gains = applyMatch(u, stats); u.lastGains = { coins: gains.coins, at: this.now(), claimed: false };
    this.save(); return { gains, profile: this.public(u) };
  }
  /** Rewarded ad. The SERVER decides the amount: 'free' = fixed coins with a cooldown and a daily cap;
   *  'double' = the coins of the last finished match, once, shortly after it. */
  reward(key, kind) {
    const u = this.users[key]; if (!u) throw new Error('auth'); u.ads ||= {};
    let add;
    if (kind === 'double') {
      const g = u.lastGains; if (!g || g.claimed || this.now() - g.at > DOUBLE_WINDOW_MS) throw new Error('nodouble');
      g.claimed = true; add = g.coins;
    } else { const err = claimAd(u.ads, this.now()); if (err) throw new Error(err); add = AD_REWARD; }
    u.coins = (u.coins || 0) + add; this.save();
    return { profile: this.public(u), coins: add };
  }

  // ---- friends: requests (incoming list on the target), mutual friend lists, direct messages (last 50 per pair)
  rel(u) { u.friends ||= []; u.requests ||= []; return u; }
  search(key, q) {
    q = String(q ?? '').trim().toLowerCase(); if (q.length < 2) return [];
    const out = [];
    for (const [k, u] of Object.entries(this.users)) { if (k !== key && k.includes(q)) out.push(u.name); if (out.length >= 10) break; }
    return out.sort((a, b) => a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q));
  }
  /** Sends a request, or accepts at once when the other side already asked. Returns the target key. */
  request(key, name) {
    const tk = String(name ?? '').trim().toLowerCase(), me = this.users[key], them = this.users[tk];
    if (!me || !them) throw new Error('nouser');
    if (tk === key) throw new Error('self');
    this.rel(me); this.rel(them);
    if (me.friends.includes(tk)) throw new Error('already');
    if (me.requests.includes(tk)) return this.respond(key, them.name, true);
    if (!them.requests.includes(key)) { if (them.requests.length >= 100) throw new Error('full'); them.requests.push(key); }
    this.save(); return tk;
  }
  respond(key, name, accept) {
    const tk = String(name ?? '').trim().toLowerCase(), me = this.users[key], them = this.users[tk];
    if (!me || !them) throw new Error('nouser');
    this.rel(me); this.rel(them);
    me.requests = me.requests.filter(k => k !== tk);
    if (accept) { if (!me.friends.includes(tk)) me.friends.push(tk); if (!them.friends.includes(key)) them.friends.push(key); them.requests = them.requests.filter(k => k !== key); }
    this.save(); return tk;
  }
  unfriend(key, name) {
    const tk = String(name ?? '').trim().toLowerCase(), me = this.users[key], them = this.users[tk];
    if (!me || !them) throw new Error('nouser');
    this.rel(me).friends = me.friends.filter(k => k !== tk); this.rel(them).friends = them.friends.filter(k => k !== key);
    this.save(); return tk;
  }
  areFriends(a, b) { return !!this.users[a]?.friends?.includes(b); }
  pair(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
  message(key, name, text) {
    const tk = String(name ?? '').trim().toLowerCase();
    text = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
    if (!text) throw new Error('empty');
    if (!this.areFriends(key, tk)) throw new Error('notfriend');
    const list = (this.messages[this.pair(key, tk)] ||= []), msg = { from: this.users[key].name, text, at: this.now() };
    list.push(msg); if (list.length > 50) list.splice(0, list.length - 50);
    this.save(); return { to: tk, msg };
  }
  history(key, name) { const tk = String(name ?? '').trim().toLowerCase(); return this.areFriends(key, tk) ? (this.messages[this.pair(key, tk)] || []) : []; }
}

// Username + password accounts (no e-mail). Stored as one JSON file (KONTIR_DATA dir, default ./data):
// passwords are scrypt-hashed with a per-user salt, session tokens are kept only as SHA-256 hashes.
// The server owns progression (XP, coins, rating, owned finishes); clients may only change loadout / equipped finishes.
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { MongoClient } from 'mongodb';
import { newStats, applyMatch, cleanChoices, FINISH_PRICES } from '../shared/progress.js';

const scrypt = promisify(scryptCb);
const TOKEN_TTL = 30 * 24 * 3600 * 1000;
const sha = s => createHash('sha256').update(s).digest('hex');
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export class Accounts {
  constructor(file, { now = () => Date.now(), mongoUri = process.env.MONGODB_URI } = {}) {
    this.file = file;
    this.mongoUri = mongoUri;
    this.now = now;
    this.users = {};
    this.tokens = {};
    this.messages = {};
    this.saving = null;
    this.dirty = false;
    this.client = null;
    this.db = null;
  }
  async load() {
    try {
      const d = JSON.parse(await readFile(this.file, 'utf8'));
      this.users = d.users || {};
      this.tokens = d.tokens || {};
      this.messages = d.messages || {};
    } catch { /* first run */ }

    if (this.mongoUri) {
      try {
        this.client = new MongoClient(this.mongoUri, { serverSelectionTimeoutMS: 5000 });
        await this.client.connect();
        this.db = this.client.db('kontir');
        console.log('[KONTIR] MongoDB ga muvaffaqiyatli ulandi.');

        const userDocs = await this.db.collection('users').find().toArray();
        for (const doc of userDocs) {
          const { _id, ...rest } = doc;
          this.users[_id] = rest;
        }

        const tokenDocs = await this.db.collection('tokens').find().toArray();
        for (const doc of tokenDocs) {
          const { _id, ...rest } = doc;
          this.tokens[_id] = rest;
        }

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
          await writeFile(this.file + '.tmp', JSON.stringify({ users: this.users, tokens: this.tokens, messages: this.messages }));
          await rename(this.file + '.tmp', this.file);
        } catch { /* ignore local file errors */ }

        if (this.db) {
          try {
            const userOps = Object.entries(this.users).map(([id, data]) => ({
              replaceOne: { filter: { _id: id }, replacement: { _id: id, ...data }, upsert: true }
            }));
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
          } catch (err) {
            console.error('[KONTIR] MongoDB ga saqlashda xatolik:', err.message);
          }
        }
      }
    })().finally(() => { this.saving = null; });
    return this.saving;
  }
  async close() {
    if (this.client) {
      try { await this.client.close(); } catch { /* ignore */ }
      this.client = null;
      this.db = null;
    }
  }
  public(u) { const { salt, hash, friends, requests, ...rest } = u; return { ...rest, demo: false }; }
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
  buy(key, finish) {
    const u = this.users[key], price = FINISH_PRICES[finish];
    if (!u || price === undefined || finish === 'standard') throw new Error('item');
    if (u.owned.includes(finish)) throw new Error('owned');
    if (u.coins < price) throw new Error('coins');
    u.coins -= price; u.owned.push(finish); this.save();
    return this.public(u);
  }
  award(key, stats) { const u = this.users[key]; if (!u) return null; const gains = applyMatch(u, stats); this.save(); return { gains, profile: this.public(u) }; }

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

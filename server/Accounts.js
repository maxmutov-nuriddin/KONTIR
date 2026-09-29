// Username + password accounts (no e-mail). Stored as one JSON file (KONTIR_DATA dir, default ./data):
// passwords are scrypt-hashed with a per-user salt, session tokens are kept only as SHA-256 hashes.
// The server owns progression (XP, coins, rating, owned finishes); clients may only change loadout / equipped finishes.
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { newStats, applyMatch, cleanChoices, FINISH_PRICES } from '../shared/progress.js';

const scrypt = promisify(scryptCb);
const TOKEN_TTL = 30 * 24 * 3600 * 1000;
const sha = s => createHash('sha256').update(s).digest('hex');
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export class Accounts {
  constructor(file, { now = () => Date.now() } = {}) { this.file = file; this.now = now; this.users = {}; this.tokens = {}; this.saving = null; this.dirty = false; }
  async load() {
    try { const d = JSON.parse(await readFile(this.file, 'utf8')); this.users = d.users || {}; this.tokens = d.tokens || {}; } catch { /* first run */ }
    return this;
  }
  /** Atomic, coalesced write (tmp file + rename). */
  save() {
    this.dirty = true;
    if (this.saving) return this.saving;
    this.saving = (async () => {
      while (this.dirty) {
        this.dirty = false;
        const t = this.now(); for (const [k, v] of Object.entries(this.tokens)) if (v.exp < t) delete this.tokens[k];
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(this.file + '.tmp', JSON.stringify({ users: this.users, tokens: this.tokens }));
        await rename(this.file + '.tmp', this.file);
      }
    })().finally(() => { this.saving = null; });
    return this.saving;
  }
  public(u) { const { salt, hash, ...rest } = u; return { ...rest, demo: false }; }
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
}

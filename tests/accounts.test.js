import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Accounts } from '../server/Accounts.js';

const fresh = async () => new Accounts(join(await mkdtemp(join(tmpdir(), 'kontir-acc-')), 'accounts.json')).load();

test('register / login / resume with unique case-insensitive usernames', async () => {
  const a = await fresh();
  const r = await a.register('Lochin_7', 'secret1');
  assert.equal(r.profile.name, 'Lochin_7'); assert.equal(r.profile.demo, false); assert.equal(r.profile.hash, undefined);
  await assert.rejects(a.register('lochin_7', 'another'), /taken/);
  await assert.rejects(a.register('ab', 'secret1'), /username/);
  await assert.rejects(a.register('bad name', 'secret1'), /username/);
  await assert.rejects(a.register('Burgut', '123'), /password/);
  await assert.rejects(a.login('Lochin_7', 'wrong!!'), /credentials/);
  await assert.rejects(a.login('nobody', 'secret1'), /credentials/);
  const l = await a.login('LOCHIN_7', 'secret1');
  assert.equal(a.resume(l.token).profile.name, 'Lochin_7');
  a.logout(l.token); assert.equal(a.resume(l.token), null);
  await a.save();
  const raw = await readFile(a.file, 'utf8');
  assert.ok(!raw.includes('secret1') && !raw.includes(r.token), 'no plaintext password or token on disk');
  const b = await new Accounts(a.file).load();
  assert.equal(b.resume(r.token).profile.name, 'Lochin_7', 'sessions survive a restart');
});

test('server owns coins and skins; clients only equip owned finishes', async () => {
  const a = await fresh();
  await a.register('Qoplon', 'secret1');
  const key = 'qoplon';
  assert.throws(() => a.buy(key, 'gold'), /coins/);
  const p = a.buy(key, 'desert'); assert.ok(p.owned.includes('desert')); assert.equal(p.coins, 250);
  assert.throws(() => a.buy(key, 'desert'), /owned/);
  const u = a.update(key, { loadout: { t: 'p250', ct: 'deagle' }, finishes: { ak47: 'desert', awp: 'gold' } });
  assert.equal(u.loadout.t, 'p250'); assert.equal(u.loadout.ct, 'usp');
  assert.deepEqual(u.finishes, { ak47: 'desert' });
  const { gains, profile } = a.award(key, { won: true, kills: 20, deaths: 10, rounds: 20 });
  assert.equal(profile.matches, 1); assert.equal(profile.wins, 1); assert.ok(gains.xp > 0 && gains.coins > 0);
});

test('friends: search, request, accept, messages only between friends, unfriend', async () => {
  const a = await fresh();
  await a.register('Lochin', 'secret1'); await a.register('Burgut', 'secret1'); await a.register('Burgut2', 'secret1');
  assert.deepEqual(a.search('lochin', 'bur'), ['Burgut', 'Burgut2']);
  assert.deepEqual(a.search('lochin', 'b'), [], 'at least two characters');
  assert.throws(() => a.message('lochin', 'Burgut', 'salom'), /notfriend/);
  a.request('lochin', 'Burgut');
  assert.deepEqual(a.users.burgut.requests, ['lochin']);
  assert.throws(() => a.request('lochin', 'lochin'), /self/);
  a.respond('burgut', 'Lochin', true);
  assert.ok(a.areFriends('lochin', 'burgut') && a.areFriends('burgut', 'lochin'));
  assert.deepEqual(a.users.burgut.requests, []);
  a.request('burgut2', 'Lochin'); a.request('lochin', 'Burgut2');   // crossing requests become a friendship
  assert.ok(a.areFriends('lochin', 'burgut2'));
  const { msg } = a.message('lochin', 'Burgut', '  salom  ');
  assert.equal(msg.text, 'salom'); assert.equal(a.history('burgut', 'Lochin').length, 1);
  assert.equal(a.public(a.users.lochin).friends, undefined, 'friend lists are not part of the public profile');
  a.unfriend('burgut', 'Lochin');
  assert.ok(!a.areFriends('lochin', 'burgut')); assert.deepEqual(a.history('lochin', 'Burgut'), []);
});

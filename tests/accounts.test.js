import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Accounts } from '../server/Accounts.js';
import { skinPrice, AD_REWARD, AD_COOLDOWN_MS, AD_DAILY_MAX } from '../shared/economy.js';

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

test('skin market: server-priced items, equip only owned, wear grows with use, sell loses value', async () => {
  let now = Date.UTC(2026, 9, 2, 12);
  const a = new Accounts(join(await mkdtemp(join(tmpdir(), 'kontir-acc-')), 'accounts.json'), { now: () => now }); await a.load();
  await a.register('Qoplon', 'secret1'); const key = 'qoplon';
  assert.throws(() => a.buy(key, { weapon: 'knife', finish: 'fade', tier: 'fn' }), /coins/, 'a ★ knife costs far more than the starting coins');
  assert.throws(() => a.buy(key, { weapon: 'gloves', finish: 'gold', tier: 'fn' }), /item/, 'gold paint does not exist for gloves');
  const cheap = skinPrice('p250', 'desert', 0.15, a.market, now);
  const { profile, item } = a.buy(key, { weapon: 'p250', finish: 'desert', tier: 'ft' });
  assert.equal(profile.coins, 500 - cheap); assert.ok(item.wear >= 0.15 && item.wear < 0.38, 'float rolled inside Field-Tested');
  assert.ok(skinPrice('p250', 'desert', 0.15, a.market, now) > cheap, 'buying raises the market price');
  const u = a.update(key, { loadout: { t: 'p250', ct: 'deagle' }, equipped: { p250: item.id, ak47: item.id, awp: 'nope' } });
  assert.equal(u.loadout.t, 'p250'); assert.equal(u.loadout.ct, 'usp');
  assert.deepEqual(u.equipped, { p250: item.id }, 'an item can only be equipped on its own weapon'); assert.equal(u.finishes.p250, 'desert');
  const w0 = item.wear; const { gains } = a.award(key, { won: true, kills: 20, deaths: 10, rounds: 20 });
  assert.ok(gains.coins > 0); assert.ok(a.users.qoplon.items[0].wear > w0, 'equipped skin wears down after a match');
  now += 24 * 3.6e6;                                          // market demand relaxes back toward x1
  const before = a.users.qoplon.coins, { coins } = a.sell(key, item.id);
  assert.ok(coins > 0 && coins < cheap, 'selling returns less than was paid'); assert.equal(a.users.qoplon.coins, before + coins);
  assert.equal(a.users.qoplon.items.length, 0); assert.deepEqual(a.users.qoplon.equipped, {});
});

test('rewarded ads: server-fixed amount, cooldown, daily cap, double reward once per match', async () => {
  let now = Date.UTC(2026, 9, 2, 8);
  const a = new Accounts(join(await mkdtemp(join(tmpdir(), 'kontir-acc-')), 'accounts.json'), { now: () => now }); await a.load();
  await a.register('Burgut', 'secret1'); const key = 'burgut';
  assert.equal(a.reward(key, 'free').coins, AD_REWARD);
  assert.throws(() => a.reward(key, 'free'), /cooldown/);
  for (let i = 1; i < AD_DAILY_MAX; i++) { now += AD_COOLDOWN_MS; a.reward(key, 'free'); }
  now += AD_COOLDOWN_MS; assert.throws(() => a.reward(key, 'free'), /daily/);
  assert.throws(() => a.reward(key, 'double'), /nodouble/, 'no match played yet');
  const { gains } = a.award(key, { won: true, kills: 3 });
  assert.equal(a.reward(key, 'double').coins, gains.coins); assert.throws(() => a.reward(key, 'double'), /nodouble/, 'only once');
  now += 24 * 3.6e6; assert.equal(a.reward(key, 'free').coins, AD_REWARD, 'cap resets the next day');
});

test('old accounts: owned finish patterns become items', async () => {
  const a = await fresh(); await a.register('Eski', 'secret1');
  Object.assign(a.users.eski, { owned: ['standard', 'tiger', 'gold'], finishes: { deagle: 'tiger' } }); delete a.users.eski.items;
  const p = a.public(a.users.eski);
  assert.deepEqual(p.items.map(i => [i.weapon, i.finish]).sort(), [['ak47', 'gold'], ['deagle', 'tiger']]);
  assert.equal(p.finishes.deagle, 'tiger'); assert.equal(p.owned, undefined);
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

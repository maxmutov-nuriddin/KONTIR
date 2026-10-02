import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Accounts } from '../server/Accounts.js';
import { skinPrice, AD_REWARD, AD_COOLDOWN_MS, AD_DAILY_MAX, todayShop, isStarWeapon, GUN_SKIN_WEAPONS } from '../shared/economy.js';

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
  const shop = todayShop(now), knife = shop.find(o => isStarWeapon(o.weapon) && o.weapon !== 'gloves');
  assert.throws(() => a.buy(key, { ...knife, tier: 'fn' }), /coins/, 'a ★ knife costs far more than the starting coins');
  assert.throws(() => a.buy(key, { weapon: 'gloves', finish: 'gold', tier: 'fn' }), /item/, 'gold paint does not exist for gloves');
  const off = GUN_SKIN_WEAPONS.flatMap(w => ['desert', 'forest', 'urban'].map(f => ({ weapon: w, finish: f }))).find(o => !shop.some(x => x.weapon === o.weapon && x.finish === o.finish));
  assert.throws(() => a.buy(key, { ...off, tier: 'fn' }), /shop/, 'only today\'s offers are for sale');
  const g = shop.filter(o => GUN_SKIN_WEAPONS.includes(o.weapon)).sort((x, y) => skinPrice(x.weapon, x.finish, 0.15, a.market, now) - skinPrice(y.weapon, y.finish, 0.15, a.market, now))[0];
  a.users.qoplon.coins = 50000;
  const cheap = skinPrice(g.weapon, g.finish, 0.15, a.market, now);
  const { profile, item } = a.buy(key, { ...g, tier: 'ft' });
  assert.equal(profile.coins, 50000 - cheap); assert.ok(item.wear >= 0.15 && item.wear < 0.38, 'float rolled inside Field-Tested');
  assert.ok(skinPrice(g.weapon, g.finish, 0.15, a.market, now) > cheap, 'buying raises the market price');
  const other = g.weapon === 'ak47' ? 'awp' : 'ak47';
  const u = a.update(key, { loadout: { t: 'p250', ct: 'deagle' }, equipped: { [g.weapon]: item.id, [other]: item.id, awp: 'nope' } });
  assert.equal(u.loadout.t, 'p250'); assert.equal(u.loadout.ct, 'usp');
  assert.deepEqual(u.equipped, { [g.weapon]: item.id }, 'an item can only be equipped on its own weapon'); assert.equal(u.finishes[g.weapon], g.finish);
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

test('profiles: public card shows inventory and stats, a private one only the name (owner still sees all)', async () => {
  const a = await fresh();
  await a.register('alice', 'secret1'); await a.register('bob', 'secret2');
  a.users.alice.items.push({ id: 'i1', weapon: 'ak47', finish: 'tiger', wear: 0.12, seed: 3, bought: 100 });
  const open = a.view('bob', 'Alice').profile;
  assert.equal(open.private, false); assert.equal(open.items.length, 1); assert.equal(open.items[0].bought, undefined);
  assert.equal(open.salt, undefined); assert.equal(open.hash, undefined); assert.equal(open.coins, undefined);
  a.update('alice', { privateProfile: true });
  const closed = a.view('bob', 'alice').profile;
  assert.deepEqual(Object.keys(closed).sort(), ['hue', 'name', 'private']); assert.equal(closed.private, true);
  assert.equal(a.view('alice', 'alice').profile.items.length, 1);
  a.update('alice', { privateProfile: 'yes' }); assert.equal(a.users.alice.privateProfile, true, 'only booleans change the flag');
  assert.throws(() => a.view('bob', 'nobody'), /nouser/);
});

test('skins are equipped per side; legacy accounts wear the same skin on both; sold items leave both sides', async () => {
  const a = await fresh();
  await a.register('carol', 'secret3'); const u = a.users.carol;
  u.items.push({ id: 'i1', weapon: 'awp', finish: 'tiger', wear: 0.1, seed: 1 }, { id: 'i2', weapon: 'awp', finish: 'gold', wear: 0.2, seed: 2 });
  a.update('carol', { equipped: { awp: 'i1' }, equippedCT: { awp: 'i2' } });
  assert.deepEqual(a.skinsOf('carol'), { TERRORIST: { awp: { finish: 'tiger', wear: 0.1 } }, COUNTER_TERRORIST: { awp: { finish: 'gold', wear: 0.2 } } });
  const pub = a.public(u); assert.equal(pub.finishes.awp, 'tiger'); assert.equal(pub.finishesCT.awp, 'gold');
  a.update('carol', { equippedCT: { awp: 'nope' } }); assert.deepEqual(u.equippedCT, {}, 'unowned items are dropped');
  delete u.equippedCT; u.equipped = { awp: 'i2' };
  assert.equal(a.skinsOf('carol').COUNTER_TERRORIST.awp.finish, 'gold', 'legacy: CT copies the old single equip');
  a.sell('carol', 'i2'); assert.equal(u.equipped.awp, undefined); assert.equal(u.equippedCT.awp, undefined);
});

test('cosmetics: knife models go in the knife slot, agents only on their own side, the daily shop rotates', async () => {
  const { todayShop, validSkin, slotOf, skinPrice } = await import('../shared/economy.js');
  const day1 = todayShop(Date.UTC(2026, 9, 2, 3)), day1b = todayShop(Date.UTC(2026, 9, 2, 22)), day2 = todayShop(Date.UTC(2026, 9, 3, 3));
  assert.deepEqual(day1, day1b, 'the same offers all day');
  assert.notDeepEqual(day1, day2, 'new offers the next day');
  assert.ok(day1.every(o => validSkin(o.weapon, o.finish)));
  assert.ok(day1.some(o => o.weapon.startsWith('knife')) && day1.some(o => o.weapon.startsWith('agent_')));
  assert.equal(slotOf('knife_karambit'), 'knife'); assert.ok(validSkin('knife_karambit', 'vanilla')); assert.ok(!validSkin('ak47', 'vanilla'));
  assert.ok(validSkin('agent_t', 't_gold') && !validSkin('agent_t', 'ct_navy'));
  assert.equal(skinPrice('agent_ct', 'ct_navy', 0.9), skinPrice('agent_ct', 'ct_navy', 0), 'agents do not lose value to wear');
  const a = await fresh(); await a.register('dave', 'secret4'); const u = a.users.dave;
  u.items.push({ id: 'k', weapon: 'knife_karambit', finish: 'fade', wear: 0.01, seed: 1 }, { id: 't', weapon: 'agent_t', finish: 't_gold', wear: 0, seed: 2 }, { id: 'c', weapon: 'agent_ct', finish: 'ct_navy', wear: 0, seed: 3 });
  a.update('dave', { equipped: { knife: 'k', agent_t: 't', agent_ct: 'c' }, equippedCT: { knife: 'k', agent_ct: 'c', agent_t: 't' } });
  assert.deepEqual(u.equipped, { knife: 'k', agent_t: 't' }, 'a CT agent cannot be worn on T');
  assert.deepEqual(u.equippedCT, { knife: 'k', agent_ct: 'c' });
  const sk = a.skinsOf('dave');
  assert.deepEqual(sk.TERRORIST.knife, { finish: 'fade', wear: 0.01, model: 'karambit' }); assert.equal(sk.TERRORIST.agent.finish, 't_gold'); assert.equal(sk.COUNTER_TERRORIST.agent.finish, 'ct_navy');
});

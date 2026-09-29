import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, RULES, TICK_RATE, neutralInput, validCommand } from '../shared/constants.js';
import { MAPS, CollisionIndex } from '../shared/maps.js';
import { character, moveCharacter } from '../shared/movement.js';
import { rayBox, hitboxes } from '../shared/weapons.js';
import { Room } from '../server/src/room.js';
import { Prediction } from '../client/src/prediction.js';

const empty=new CollisionIndex({colliders:[]});
const input=(overrides={})=>({...neutralInput(),...overrides});
const spawn=()=>character({x:0,y:0,z:0,yaw:0});
function duel(){const r=new Room('TEST');r.add('t','Alpha','T');r.add('ct','Bravo','CT');r.start();r.phase='live';r.phaseEnd=10000;return r;}

test('inertial acceleration, friction and diagonal normalization',()=>{
  const straight=spawn(),diagonal=spawn();
  moveCharacter(straight,input({forward:1}),empty,DT);assert.ok(straight.vz<0&&straight.vz>-5.5);
  for(let i=0;i<100;i++){moveCharacter(straight,input({forward:1}),empty,DT);moveCharacter(diagonal,input({forward:1,right:1}),empty,DT);}
  assert.ok(Math.abs(Math.hypot(diagonal.vx,diagonal.vz)-Math.abs(straight.vz))<.01);
  for(let i=0;i<120;i++)moveCharacter(straight,input(),empty,DT);assert.ok(Math.abs(straight.vz)<.001);
});

test('jump, air control, landing and held-jump does not auto-hop',()=>{
  const p=spawn();moveCharacter(p,input({jump:true,forward:1}),empty,DT);assert.ok(p.y>0&&!p.grounded);
  for(let i=0;i<120;i++)moveCharacter(p,input({jump:true,right:1}),empty,DT);
  assert.equal(p.y,0);assert.equal(p.grounded,true);
  moveCharacter(p,input({jump:false}),empty,DT);moveCharacter(p,input({jump:true}),empty,DT);assert.ok(p.y>0);
});

test('static wall collision blocks running and stairs reach second-floor deck',()=>{
  const wall=new CollisionIndex({colliders:[{id:'wall',x:0,y:2,z:-2,sx:10,sy:4,sz:1}]});const p=spawn();
  for(let i=0;i<120;i++)moveCharacter(p,input({forward:1}),wall,DT);assert.ok(p.z>=-1.17);
  const index=new CollisionIndex(MAPS.sahara),stairs=character({x:65,y:0,z:21,yaw:0});
  for(let i=0;i<300;i++)moveCharacter(stairs,input({forward:1}),index,DT);
  assert.ok(stairs.y>=2.9&&stairs.z<5,`stairs reached y=${stairs.y} z=${stairs.z}`);
});

test('packet validation rejects NaN, out-of-range controls and invalid sequence',()=>{
  assert.ok(validCommand({...input(),seq:1}));
  for(const c of [{...input(),seq:-1},{...input(),seq:2,yaw:NaN},{...input(),seq:3,forward:2},{...input(),seq:4,fire:'true'}])assert.equal(validCommand(c),false);
});

test('command queue deduplicates and processes no more than one command per tick',()=>{
  const r=duel();const batch=Array.from({length:8},(_,seq)=>({...input({forward:1}),seq}));r.enqueue('t',batch);r.enqueue('t',batch);
  assert.equal(r.players.get('t').commands.length,8);r.step();assert.equal(r.players.get('t').ack,0);assert.equal(r.players.get('t').commands.length,7);
});

test('prediction replays unacknowledged commands onto server state',()=>{
  const p=new Prediction(empty),initial={phase:'live',epoch:1,players:[{id:'me',life:1,char:spawn(),ack:-1,alive:true}]};
  p.reconcile(initial,'me');for(let i=0;i<8;i++)p.command(input({forward:1}),initial,true);
  const expected={...p.character},authoritative=spawn();
  for(let i=0;i<4;i++)moveCharacter(authoritative,input({forward:1}),empty,DT);
  p.reconcile({...initial,players:[{...initial.players[0],char:authoritative,ack:3}]},'me');
  assert.equal(p.pending.length,4);assert.ok(Math.abs(p.character.z-expected.z)<1e-10);
});

test('ray tests identify head/chest/legs and solid cover blocks damage',()=>{
  const boxes=hitboxes(spawn());assert.deepEqual(boxes.map(b=>b.part),['head','chest','legs']);
  assert.equal(rayBox({x:0,y:1,z:0},{x:0,y:0,z:-1},{x:-1,y:0,z:-6},{x:1,y:2,z:-4}),4);
  const r=duel(),a=r.players.get('t'),b=r.players.get('ct');a.char=spawn();b.char=character({x:0,y:0,z:-40,yaw:0});
  r.fire(a);assert.equal(b.health,100,'center wall blocks the shot');
  r.tick+=20;a.nextShot=0;a.lastShot=-1000;b.char.z=-10;r.fire(a);assert.equal(b.alive,false,'unarmored headshot is lethal');
});

test('ammo, fire-rate and reload constraints are authoritative',()=>{
  const r=duel(),p=r.players.get('t');r.fire(p);const ammo=p.ammo;r.fire(p);assert.equal(p.ammo,ammo);
  p.reloadEnd=r.tick+100;r.tick+=20;r.fire(p);assert.equal(p.ammo,ammo);
  p.reloadEnd=0;p.ammo=0;r.fire(p);assert.equal(p.ammo,0);
});

test('plant requires continuous stationary input; defuse wins even when T eliminated',()=>{
  const r=duel(),t=r.players.get('t'),ct=r.players.get('ct'),site=r.map.sites[0];
  t.char=character({...site,y:0,yaw:0});t.input=input({interact:true});
  for(let i=0;i<80;i++)r.objectives(t);assert.ok(t.interactProgress>0);
  t.input.interact=false;r.objectives(t);assert.equal(t.interactProgress,0);
  t.input.interact=true;for(let i=0;i<Math.ceil(RULES.plantSeconds*TICK_RATE);i++)r.objectives(t);
  assert.equal(r.bomb.state,'planted');t.alive=false;r.step();assert.equal(r.phase,'live');
  ct.char=character({...site,y:0,yaw:0});ct.input=input({interact:true});
  for(let i=0;i<Math.ceil(RULES.defuseSeconds*TICK_RATE);i++)r.objectives(ct);
  assert.equal(r.bomb.state,'defused');assert.equal(r.scores.CT,1);assert.equal(r.phase,'roundEnd');
});

test('bomb timer overrides normal round timeout and pays round only once',()=>{
  const r=duel();r.phaseEnd=0;r.bomb={state:'planted',x:0,y:0,z:0,explodeTick:3};
  r.step();assert.equal(r.phase,'live');r.step();r.step();assert.equal(r.scores.T,1);assert.equal(r.phase,'roundEnd');
  r.endRound('T','duplicate');assert.equal(r.scores.T,1);
});

test('buy restrictions, round transition and match end',()=>{
  const r=duel();assert.ok(r.buy('t','smg').error);r.phase='buy';assert.ok(r.buy('t','smg').ok);assert.equal(r.players.get('t').money,1900);
  assert.ok(r.buy('t','rifle').error);r.phase='live';r.scores.T=6;r.endRound('T','test');assert.equal(r.phase,'matchEnd');
});

test('lag history is bounded and rewind never crosses a respawn life',()=>{
  const r=duel();for(let i=0;i<80;i++)r.step();assert.ok(r.history.length<=15);
  const h=r.historical(-10000);assert.ok(h);assert.equal(h.get('ct').life,r.players.get('ct').life);
});

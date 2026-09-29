import { randomInt } from 'node:crypto';
import { DT, TICK_RATE, RULES, neutralInput, clamp } from '../../shared/constants.js';
import { MAPS, CollisionIndex, colliderBounds } from '../../shared/maps.js';
import { character, moveCharacter } from '../../shared/movement.js';
import { WEAPONS, rayBox, hitboxes, shotDirection } from '../../shared/weapons.js';
import { Navigation } from './navigation.js';

export class Room {
  constructor(code,mapId='sahara',mode='competitive'){
    this.code=code;this.map=MAPS[mapId]||MAPS.sahara;this.mode=mode;
    this.index=new CollisionIndex(this.map);this.boxes=this.map.colliders.map(colliderBounds);this.nav=new Navigation(this.map);
    this.players=new Map();this.host=null;this.tick=0;this.epoch=0;this.round=0;this.phase='lobby';this.phaseEnd=0;
    this.scores={T:0,CT:0};this.bomb={state:'idle',carrier:null,x:0,y:0,z:0,explodeTick:0};
    this.history=[];this.events=[];this.eventId=0;this.result=null;this.accumulator=0;
  }
  emit(type,data){this.events.push({id:++this.eventId,type,tick:this.tick,...data});if(this.events.length>32)this.events.shift();}
  add(id,name,preferred='T',bot=false){
    const roster=[...this.players.values()];const t=roster.filter(p=>p.team==='T').length,ct=roster.length-t;
    const team=t===ct?preferred:t<ct?'T':'CT';
    const spawn=this.map.spawns[team][(team==='T'?t:ct)%5];
    const p={id,name,team,bot,char:character(spawn),health:100,armor:0,money:3200,kills:0,deaths:0,alive:true,life:0,
      weapon:'rifle',ammo:30,reserve:90,reloadEnd:0,nextShot:0,burst:0,lastShot:-10000,lastFire:false,
      commands:[],ack:-1,lastReceived:-1,lastCommandTick:this.tick,input:neutralInput(),rtt:80,
      interactProgress:0,respawnTick:0,path:[],pathTick:-1000};
    this.players.set(id,p);if(!this.host&&!bot)this.host=id;return p;
  }
  remove(id){
    const p=this.players.get(id);if(!p)return;
    if(this.bomb.carrier===id)this.dropBomb(p);
    this.players.delete(id);if(this.host===id)this.host=[...this.players.values()].find(p=>!p.bot)?.id||null;
  }
  enqueue(id,commands){
    const p=this.players.get(id);if(!p)return;
    for(const c of commands){
      if(c.seq<=p.lastReceived||c.seq>p.ack+160||p.commands.length>=128)continue;
      p.commands.push(c);p.lastReceived=c.seq;p.lastCommandTick=this.tick;
    }
  }
  start(){if(this.phase==='lobby')this.beginRound();}
  beginRound(){
    this.round++;this.epoch++;this.phase='buy';this.phaseEnd=this.tick+RULES.buySeconds*TICK_RATE;this.result=null;this.history=[];
    const counts={T:0,CT:0};
    for(const p of this.players.values()){
      p.char=character(this.map.spawns[p.team][counts[p.team]++%5]);p.alive=true;p.life++;p.health=100;p.armor=0;
      p.ammo=WEAPONS[p.weapon].magazine;p.reserve=WEAPONS[p.weapon].reserve;p.reloadEnd=0;p.nextShot=0;p.burst=0;p.lastFire=false;
      p.interactProgress=0;p.path=[];p.pathTick=-1000;
      // All commands received before this spawn belong to the previous epoch.
      if(p.commands.length)p.ack=p.commands.at(-1).seq;p.commands=[];
    }
    const carrier=[...this.players.values()].find(p=>p.team==='T'&&!p.bot)||[...this.players.values()].find(p=>p.team==='T');
    this.bomb={state:'carried',carrier:carrier?.id||null,x:0,y:0,z:0,explodeTick:0};
    this.emit('round',{round:this.round});
  }
  buy(id,item){
    const p=this.players.get(id);if(!p||this.phase!=='buy'||!p.alive)return{error:'Xarid faqat raund oldidagi buy vaqtida mumkin.'};
    if(item==='armor'){
      if(p.armor===100)return{error:'Zirh allaqachon to‘liq.'};if(p.money<650)return{error:'Mablag‘ yetarli emas.'};p.money-=650;p.armor=100;return{ok:true};
    }
    const weapon=WEAPONS[item];if(!weapon)return{error:'Noma’lum jihoz.'};if(p.money<weapon.price)return{error:'Mablag‘ yetarli emas.'};
    p.money-=weapon.price;p.weapon=item;p.ammo=weapon.magazine;p.reserve=weapon.reserve;p.reloadEnd=0;return{ok:true};
  }
  wallDistance(origin,direction,max=200){
    let distance=max;for(const b of this.boxes){const hit=rayBox(origin,direction,b.min,b.max,distance);if(hit!==null)distance=Math.min(distance,hit);}return distance;
  }
  historical(tick){
    const clamped=clamp(tick,this.tick-Math.ceil(RULES.rewindSeconds*TICK_RATE),this.tick);
    let before=null,after=null;
    for(const frame of this.history){if(frame.tick<=clamped)before=frame;if(frame.tick>=clamped){after=frame;break;}}
    if(!before)return after?.players||null;if(!after||before===after)return before.players;
    const ratio=(clamped-before.tick)/(after.tick-before.tick),result=new Map();
    for(const [id,p]of before.players){const q=after.players.get(id);if(!q){result.set(id,p);continue;}result.set(id,{...p,x:p.x+(q.x-p.x)*ratio,y:p.y+(q.y-p.y)*ratio,z:p.z+(q.z-p.z)*ratio});}
    return result;
  }
  fire(p){
    const w=WEAPONS[p.weapon];
    if(!p.alive||this.phase!=='live'||p.reloadEnd||p.ammo<=0||this.tick<p.nextShot)return;
    if(!w.automatic&&p.lastFire)return;
    if(this.tick-p.lastShot>0.3*TICK_RATE)p.burst=0;
    const recoil=w.recoil[Math.min(p.burst,w.recoil.length-1)];
    const movementSpread=Math.hypot(p.char.vx,p.char.vz)*0.003+(p.char.grounded?0:0.035);
    const origin={x:p.char.x,y:p.char.y+(p.char.crouched?1.0:1.62),z:p.char.z};
    const direction=shotDirection(p.char.yaw,p.char.pitch,recoil,w.spread+movementSpread,randomInt(0,0x7fffffff));
    let distance=this.wallDistance(origin,direction),hit=null;
    // Server-measured RTT, never a client-chosen rewind timestamp.
    const rewind=p.bot?this.tick:this.tick-Math.min(RULES.rewindSeconds,p.rtt/2000+RULES.interpolationSeconds)*TICK_RATE;
    const historic=this.historical(rewind);
    for(const target of this.players.values()){
      if(!target.alive||target.id===p.id||target.team===p.team)continue;
      const past=historic?.get(target.id)||target.char;
      if(past.life!==undefined&&past.life!==target.life)continue;
      for(const box of hitboxes(past)){
        const d=rayBox(origin,direction,box.min,box.max,distance);
        if(d!==null&&d<distance){distance=d;hit={target,part:box.part,multiplier:box.multiplier};}
      }
    }
    p.ammo--;p.burst++;p.lastShot=this.tick;p.nextShot=this.tick+Math.ceil(w.interval*TICK_RATE);
    if(hit){
      let damage=Math.round(w.damage*hit.multiplier);
      if(hit.target.armor>0&&hit.part!=='legs'){const absorbed=Math.min(hit.target.armor,Math.floor(damage*.4));hit.target.armor-=absorbed;damage-=absorbed;}
      hit.target.health=Math.max(0,hit.target.health-damage);
      if(!hit.target.health){
        hit.target.alive=false;hit.target.deaths++;p.kills++;p.money=Math.min(16000,p.money+300);hit.target.interactProgress=0;
        if(this.bomb.carrier===hit.target.id)this.dropBomb(hit.target);
        if(this.mode==='deathmatch')hit.target.respawnTick=this.tick+3*TICK_RATE;
        this.emit('kill',{killer:p.name,victim:hit.target.name,weapon:p.weapon,head:hit.part==='head'});
      }
    }
    this.emit('shot',{shooter:p.id,from:origin,to:{x:origin.x+direction.x*distance,y:origin.y+direction.y*distance,z:origin.z+direction.z*distance},hit:hit?.target.id||null,part:hit?.part||null,recoil});
  }
  dropBomb(p){this.bomb={state:'dropped',carrier:null,x:p.char.x,y:p.char.y,z:p.char.z,explodeTick:0};}
  objectives(p){
    if(this.mode==='deathmatch'||this.phase!=='live'||!p.alive){p.interactProgress=0;return;}
    const b=this.bomb,c=p.char;
    if(b.state==='dropped'&&p.team==='T'&&Math.hypot(c.x-b.x,c.y-b.y,c.z-b.z)<1.6){b.state='carried';b.carrier=p.id;}
    const stationary=Math.hypot(c.vx,c.vz)<0.25&&c.grounded;
    if(!p.input.interact||p.input.fire||p.reloadEnd||!stationary){p.interactProgress=0;return;}
    if(b.state==='carried'&&b.carrier===p.id){
      const site=this.map.sites.find(s=>Math.hypot(c.x-s.x,c.z-s.z)<s.radius&&c.y<0.5);
      if(!site){p.interactProgress=0;return;}
      p.interactProgress+=DT;
      if(p.interactProgress>=RULES.plantSeconds){this.bomb={state:'planted',carrier:null,x:c.x,y:c.y,z:c.z,site:site.id,explodeTick:this.tick+RULES.bombSeconds*TICK_RATE};p.interactProgress=0;p.money+=300;this.emit('planted',{site:site.id});}
    }else if(b.state==='planted'&&p.team==='CT'&&Math.hypot(c.x-b.x,c.y-b.y,c.z-b.z)<2){
      p.interactProgress+=DT;
      if(p.interactProgress>=RULES.defuseSeconds){b.state='defused';p.interactProgress=0;this.endRound('CT','Qurilma zararsizlantirildi');}
    }else p.interactProgress=0;
  }
  endRound(winner,reason){
    if(this.phase!=='live')return;
    this.scores[winner]++;this.result={winner,reason};
    this.phase=this.scores[winner]>=RULES.wins?'matchEnd':'roundEnd';this.phaseEnd=this.tick+RULES.intermissionSeconds*TICK_RATE;
    for(const p of this.players.values())p.money=Math.min(16000,p.money+(p.team===winner?2500:1800));
    this.emit('result',this.result);
  }
  botCommand(p){
    const cmd={...neutralInput(),yaw:p.char.yaw,pitch:0};
    if(!p.alive||this.phase!=='live')return cmd;
    const visible=[...this.players.values()].filter(q=>q.alive&&q.team!==p.team).map(q=>({q,d:Math.hypot(q.char.x-p.char.x,q.char.z-p.char.z)})).filter(({q,d})=>{
      if(d>45)return false;
      const origin={x:p.char.x,y:p.char.y+1.5,z:p.char.z},delta={x:q.char.x-origin.x,y:q.char.y+1.2-origin.y,z:q.char.z-origin.z};
      const len=Math.hypot(delta.x,delta.y,delta.z);return this.wallDistance(origin,{x:delta.x/len,y:delta.y/len,z:delta.z/len},len)>=len-.1;
    }).sort((a,b)=>a.d-b.d)[0];
    if(visible){
      const q=visible.q.char;cmd.yaw=Math.atan2(-(q.x-p.char.x),-(q.z-p.char.z));cmd.pitch=Math.atan2(q.y+1.2-(p.char.y+1.62),visible.d);
      cmd.yaw+=Math.sin(this.tick*.17+p.id.length)*0.025;cmd.fire=this.tick%40<4;cmd.reload=p.ammo===0;return cmd;
    }
    const bomb=this.bomb;let goal=this.map.sites[0];
    if(bomb.state==='planted'||bomb.state==='dropped'&&p.team==='T')goal=bomb;
    if(Math.hypot(goal.x-p.char.x,goal.z-p.char.z)<1.6){cmd.interact=true;cmd.reload=p.ammo<10;return cmd;}
    if(this.tick-p.pathTick>2*TICK_RATE||!p.path.length){p.path=this.nav.path(p.char,goal);p.pathTick=this.tick;}
    while(p.path.length&&Math.hypot(p.path[0].x-p.char.x,p.path[0].z-p.char.z)<0.7)p.path.shift();
    const target=p.path[0]||goal;cmd.yaw=Math.atan2(-(target.x-p.char.x),-(target.z-p.char.z));cmd.forward=1;cmd.walk=true;return cmd;
  }
  step(){
    this.tick++;
    if(this.phase==='buy'&&this.tick>=this.phaseEnd){this.phase='live';this.phaseEnd=this.tick+(this.mode==='deathmatch'?180:RULES.roundSeconds)*TICK_RATE;}
    if(this.phase==='roundEnd'&&this.tick>=this.phaseEnd)this.beginRound();
    for(const p of this.players.values()){
      if(p.bot)p.input=this.botCommand(p);
      else if(p.commands.length){p.input=p.commands.shift();p.ack=p.input.seq;}
      else p.input={...neutralInput(),yaw:p.char.yaw,pitch:p.char.pitch};
      let movement=p.input;
      if(this.phase!=='live'||!p.alive)movement={...neutralInput(),yaw:p.input.yaw,pitch:p.input.pitch};
      moveCharacter(p.char,movement,this.index,DT);
      if(p.reloadEnd&&this.tick>=p.reloadEnd){const w=WEAPONS[p.weapon],amount=Math.min(w.magazine-p.ammo,p.reserve);p.ammo+=amount;p.reserve-=amount;p.reloadEnd=0;}
      if(p.alive&&this.phase==='live'){
        if(p.input.reload&&!p.reloadEnd&&p.reserve>0&&p.ammo<WEAPONS[p.weapon].magazine)p.reloadEnd=this.tick+Math.ceil(WEAPONS[p.weapon].reload*TICK_RATE);
        if(p.input.fire)this.fire(p);
        this.objectives(p);
      }
      p.lastFire=p.input.fire;
      if(this.mode==='deathmatch'&&!p.alive&&this.tick>=p.respawnTick){p.alive=true;p.life++;p.health=100;p.char=character(this.map.spawns[p.team][Math.floor(this.tick/64)%5]);p.ammo=WEAPONS[p.weapon].magazine;p.reserve=WEAPONS[p.weapon].reserve;p.reloadEnd=0;}
    }
    this.history.push({tick:this.tick,players:new Map([...this.players.values()].filter(p=>p.alive).map(p=>[p.id,{...p.char,life:p.life}]))});
    while(this.history.length>Math.ceil(RULES.rewindSeconds*TICK_RATE)+2)this.history.shift();
    if(this.phase==='live'){
      if(this.mode==='deathmatch'){
        if(this.tick>=this.phaseEnd){this.phase='matchEnd';this.result={winner:'',reason:'Deathmatch yakunlandi'};}
      }else{
        const alive={T:0,CT:0};for(const p of this.players.values())if(p.alive)alive[p.team]++;
        if(this.bomb.state==='planted'&&this.tick>=this.bomb.explodeTick){this.bomb.state='exploded';this.endRound('T','Qurilma ishga tushdi');}
        else if(alive.CT===0)this.endRound('T','CT jamoasi mag‘lub bo‘ldi');
        else if(alive.T===0&&this.bomb.state!=='planted')this.endRound('CT','T jamoasi mag‘lub bo‘ldi');
        else if(this.tick>=this.phaseEnd&&this.bomb.state!=='planted')this.endRound('CT','Vaqt tugadi');
      }
    }
  }
  snapshot(viewerId){
    return {code:this.code,mapId:this.map.id,mode:this.mode,host:this.host,tick:this.tick,epoch:this.epoch,round:this.round,phase:this.phase,
      remaining:Math.max(0,(this.phaseEnd-this.tick)/TICK_RATE),scores:{...this.scores},result:this.result,
      bomb:{...this.bomb,remaining:Math.max(0,(this.bomb.explodeTick-this.tick)/TICK_RATE)},events:this.events,
      players:[...this.players.values()].map(p=>({id:p.id,name:p.name,team:p.team,bot:p.bot,char:{...p.char},health:p.health,armor:p.armor,alive:p.alive,life:p.life,
        kills:p.kills,deaths:p.deaths,weapon:p.weapon,ack:p.ack,
        ...(p.id===viewerId?{ammo:p.ammo,reserve:p.reserve,money:p.money,reload:p.reloadEnd?Math.max(0,(p.reloadEnd-this.tick)/TICK_RATE):0,interactProgress:p.interactProgress,rtt:p.rtt}:{})}))};
  }
}

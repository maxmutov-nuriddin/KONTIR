import { gsap } from 'gsap';
import { WEAPONS } from '../../shared/weapons.js';
import { MAPS } from '../../shared/maps.js';

const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const circuit='<svg viewBox="0 0 160 100"><path d="M12 78V22h33V10h66v16h35v51h-35v13H44V78Z"/><path d="M45 25v48m32-48v48m34-42v42M17 49h126"/><circle cx="29" cy="32" r="8"/><circle cx="128" cy="67" r="8"/></svg>';
export const clock=seconds=>`${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`;

export class UI {
  constructor(){
    document.querySelector('#app').innerHTML=`
      <div class="shade"></div>
      <section id="menu" class="menu">
        <header><a class="brand" href="#"><b>◩</b> KONTIR<span>TACTICAL OPERATIONS</span></a><nav><button class="active" id="play-nav">O‘YNASH</button><button id="guide-nav">QO‘LLANMA ↗</button></nav><div class="header-right"><span><i></i> WEBGL / ONLINE FPS</span><button id="settings" class="square" aria-label="Sozlamalar">⚙</button></div></header>
        <div class="side-label">01 — DEPLOYMENT</div>
        <div class="hero"><div class="eyebrow"><i></i> TAYYORGARLIK TUGADI.</div><h1>HAR BIR<br>SONIYA<br><em>HAL QILADI.</em></h1><p>Bitta jamoa. Bitta maqsad.<br>Rejangni tuz va operatsiyani boshla.</p><div class="hero-meta"><span>5 <b>VS</b> 5</span><span>ROUND BASED</span><span>64 TICK</span></div></div>
        <div class="weapon-label"><div class="small-cross">+</div><span>STANDARD ISSUE<strong>KR–47 <small>ASSAULT RIFLE</small></strong></span><b>7.62</b></div>
        <div class="op-tag"><i></i> OPERATION: FIRST LIGHT <span>EST. 2026</span></div>
        <div class="menu-bottom"><div class="maps"><div class="section-label">01 / OPERATSIYA HUDUDI <span>2 XARITA</span></div><div class="map-options"><button data-map="sahara" class="map-card selected"><div class="map-preview desert">${circuit}<span>A</span></div><div><strong>SAHARA OUTPOST</strong><small>CHO‘L / 160 × 160 M</small></div><b>↗</b></button><button data-map="harbor" class="map-card"><div class="map-preview harbor">${circuit}<span>B</span></div><div><strong>IRON HARBOR</strong><small>PORT / 160 × 160 M</small></div><b>↗</b></button></div></div><div class="deploy"><div class="section-label">02 / JANG REJIMI<div class="mode-select"><button data-mode="competitive" class="selected">COMPETITIVE</button><button data-mode="deathmatch">DEATHMATCH</button></div></div><div class="deploy-actions"><button id="practice" class="primary">MASHQNI BOSHLASH ${arrow}</button><button id="online" class="secondary" title="Do‘stlar bilan multiplayer">ONLAYN ${arrow}</button></div><div class="deploy-foot"><span><i></i> 3 BOT BILAN · TEZKOR START</span><button id="team">T JAMOASI ⇄</button></div></div></div>
        <footer><span>ORIGINAL MAPS. SHARED OBJECTIVE.</span><span>SERVER AUTHORITATIVE <b>·</b> BUILT FOR THE BROWSER</span><span>PROTOTYPE / v0.1</span></footer>
      </section>
      <section id="hud" class="hidden">
        <div class="hud-top"><div class="radar-wrap"><div class="radar-label"><span id="location-label">SAHARA</span><small id="ping">0 MS</small></div><canvas id="radar" width="180" height="180"></canvas></div><div class="match-bar"><div class="team-score t"><small>T</small><b id="t-score">0</b></div><div class="match-clock"><small id="phase">BUY TIME</small><strong id="clock">0:12</strong><span id="round">RAUND 01 / MR6</span></div><div class="team-score ct"><b id="ct-score">0</b><small>CT</small></div></div><div class="top-right"><button id="pause-button">ESC <span>MENYU</span></button><div id="killfeed"></div></div></div>
        <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div><div id="damage-flash"></div>
        <div id="objective"></div><div id="interaction"><span></span><div><i></i></div></div>
        <div id="round-banner"></div><div id="death-notice" class="hidden"><strong>OPERATSIYA DAVOM ETADI</strong><span>Keyingi raundni kuting · TAB — natijalar</span></div>
        <div class="hud-bottom"><div class="vitals"><span class="health-icon">+</span><strong id="health">100</strong><span class="armor-icon">◇</span><b id="armor">0</b><div class="money" id="money">$3200</div></div><div class="key-hints"><span><kbd>B</kbd> XARID</span><span><kbd>E</kbd> PLANT / DEFUSE</span><span><kbd>TAB</kbd> NATIJALAR</span></div><div class="ammo"><small id="weapon-name">KR-47 RIFLE</small><div><strong id="ammo">30</strong><span>/ <b id="reserve">90</b></span></div><small id="reload-status">R — QAYTA O‘QLASH</small></div></div>
        <div class="telemetry"><span id="fps">60 FPS</span><span id="chunks">0 CHUNKS</span><span>64 TICK</span></div>
        <div id="scoreboard" class="hidden"><div><small>LIVE SCOREBOARD</small><h2>JAMOA NATIJALARI</h2><table><thead><tr><th>OPERATOR</th><th>JAMOA</th><th>K</th><th>D</th></tr></thead><tbody></tbody></table></div></div>
        <div id="resume" class="hidden"><div><span>READY TO DEPLOY</span><h2>Operatsiyaga tayyormisiz?</h2><p>WASD — harakat · Sichqoncha — nishon<br>Chap tugma — otish · Shift — yurish · Space — sakrash</p><button id="lock" class="primary">JANGGA KIRISH ${arrow}</button><button id="leave" class="text-button">Bosh menyuga qaytish</button></div></div>
      </section>
      <dialog id="modal"><button id="close" aria-label="Yopish">×</button><div id="modal-content"></div></dialog>
      <div id="toast" role="status"></div><div id="loader"><b>◩ KONTIR</b><div><i></i></div><span>OPERATSIYA YUKLANMOQDA</span></div>
    `;
    this.menu=document.querySelector('#menu');this.hud=document.querySelector('#hud');this.modal=document.querySelector('#modal');this.content=document.querySelector('#modal-content');this.ctx=document.querySelector('#radar').getContext('2d');
    this.elements=Object.fromEntries(['health','armor','ammo','reserve','money','phase','clock','round','t-score','ct-score','weapon-name','reload-status','fps','chunks','ping','objective'].map(id=>[id,document.getElementById(id)]));
    this.locked=false;this.rosterKey='';this.lastPhase='';this.lastHealth=100;
    document.querySelector('#close').onclick=()=>this.modal.close();this.modal.addEventListener('click',e=>{if(e.target===this.modal&&!this.locked)this.modal.close();});
    document.querySelector('.brand').onclick=e=>e.preventDefault();
  }
  ready(){gsap.to('#loader',{autoAlpha:0,duration:.4,onComplete:()=>document.querySelector('#loader').remove()});gsap.from('.hero > *',{opacity:0,y:20,stagger:.09,duration:.7,ease:'power3.out'});gsap.from('.menu-bottom',{opacity:0,y:20,duration:.7,delay:.2});}
  dialog(html,locked=false){this.content.innerHTML=html;this.locked=locked;document.querySelector('#close').hidden=locked;if(!this.modal.open)this.modal.showModal();gsap.fromTo(this.modal,{opacity:0,y:15},{opacity:1,y:0,duration:.2});}
  toast(text){const el=document.querySelector('#toast');el.textContent=text;gsap.killTweensOf(el);gsap.set(el,{autoAlpha:1});gsap.to(el,{autoAlpha:0,delay:3.5,duration:.3});}
  showMenu(){this.modal.close();this.menu.classList.remove('hidden');this.hud.classList.add('hidden');document.body.classList.remove('playing');this.rosterKey='';this.lastPhase='';document.querySelector('#killfeed').replaceChildren();document.querySelector('#scoreboard').classList.add('hidden');}
  showGame(mapId){this.modal.close();this.menu.classList.add('hidden');this.hud.classList.remove('hidden');document.body.classList.add('playing');document.querySelector('#location-label').textContent=MAPS[mapId].name;this.lastPhase='';this.lastHealth=100;gsap.fromTo('.hud-top,.hud-bottom',{opacity:0},{opacity:1,duration:.4});}
  resume(show){document.querySelector('#resume').classList.toggle('hidden',!show);}
  controls(){this.dialog(`<small class="eyebrow">FIELD MANUAL</small><h2>Avval reja. Keyin harakat.</h2><p>Competitive: 7 raund yutgan jamoa g‘olib. T jamoasi A/B hududida qurilmani o‘rnatadi. CT himoya qiladi yoki uni zararsizlantiradi.</p><div class="control-grid"><kbd>W A S D</kbd><span>Inersiyali harakat</span><kbd>MOUSE</kbd><span>Nishon olish</span><kbd>LMB</kbd><span>O‘q uzish</span><kbd>SPACE</kbd><span>Sakrash</span><kbd>CTRL</kbd><span>Cho‘kish</span><kbd>SHIFT</kbd><span>Sekin yurish</span><kbd>R</kbd><span>Qayta o‘qlash</span><kbd>B</kbd><span>Xarid menyusi</span><kbd>E (ushlang)</kbd><span>Plant / defuse</span><kbd>TAB</kbd><span>Natijalar</span><kbd>ESC</kbd><span>Sichqonchani bo‘shatish</span></div><p class="note">Plant: 3.2 s · Defuse: 5 s · Qurilma taymeri: 35 s. Harakat qilsangiz jarayon to‘xtaydi. Bu original FPS prototipi; Counter-Strike’ning aynan nusxasi emas.</p>`);}
  lobby(state,id,start,leave){
    const key=JSON.stringify([state.host,state.players.map(p=>[p.id,p.name,p.team])]);if(this.rosterKey===key&&this.modal.open)return;this.rosterKey=key;
    this.dialog(`<small class="eyebrow">TEAM ASSEMBLY</small><h2>Jamoani yig‘ing.</h2><p>Do‘stingiz shu serverga kirib, quyidagi xona kodini yozsin.</p><div class="room-code"></div><div class="roster"></div><button id="start-match" class="primary full">${state.host===id?'OPERATSIYANI BOSHLASH':'XONA EGASI KUTILMOQDA'} ${arrow}</button><button id="leave-lobby" class="text-button">Xonadan chiqish</button>`,true);
    this.content.querySelector('.room-code').textContent=state.code;
    for(const p of state.players){const row=document.createElement('div'),name=document.createElement('span'),badge=document.createElement('b');name.textContent=p.name+(p.id===id?' (siz)':'');badge.textContent=p.team+(p.id===state.host?' / HOST':'');row.append(name,badge);this.content.querySelector('.roster').append(row);}
    document.querySelector('#start-match').disabled=state.host!==id;document.querySelector('#start-match').onclick=start;document.querySelector('#leave-lobby').onclick=leave;
  }
  buy(player,onBuy){
    this.dialog(`<small class="eyebrow">EQUIPMENT REQUISITION</small><h2>Jihozingizni tanlang.</h2><div class="balance">BALANS <strong>$${player.money}</strong></div><div class="buy-list">${Object.values(WEAPONS).map(w=>`<button data-buy="${w.id}"><span><b>${w.name}</b><small>${w.magazine} O‘Q · ${Math.round(60/w.interval)} RPM</small></span><strong>$${w.price}</strong></button>`).join('')}<button data-buy="armor"><span><b>KEVLAR ZIRH</b><small>100 ARMOR</small></span><strong>$650</strong></button></div><p class="note">Xaridni server tasdiqlaydi. Raund boshidagi 12 soniya ichida tanlang.</p>`);
    document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>onBuy(b.dataset.buy));
    gsap.from('.buy-list button',{x:-12,opacity:0,stagger:.06,duration:.25});
  }
  event(e,id){
    if(e.type==='kill'){const row=document.createElement('div');row.textContent=`${e.killer}  ${e.head?'⌖':'→'}  ${e.victim}`;document.querySelector('#killfeed').prepend(row);gsap.from(row,{opacity:0,x:15,duration:.2});setTimeout(()=>row.remove(),6000);}
    if(e.type==='shot'&&e.shooter===id&&e.hit){gsap.killTweensOf('#hitmarker');gsap.fromTo('#hitmarker',{opacity:1},{opacity:0,duration:.3});}
    if(e.type==='planted')this.toast(`Qurilma ${e.site} hududida o‘rnatildi. 35 soniya!`);
  }
  update(state,id,{fps,chunks}){
    const p=state.players.find(p=>p.id===id);if(!p)return;const el=this.elements;
    el.health.textContent=p.health;el.armor.textContent=p.armor;el.ammo.textContent=p.ammo;el.reserve.textContent=p.reserve;el.money.textContent=`$${p.money}`;
    el['t-score'].textContent=state.scores.T;el['ct-score'].textContent=state.scores.CT;el['weapon-name'].textContent=WEAPONS[p.weapon].name;
    el['reload-status'].textContent=p.reload>0?`QAYTA O‘QLASH ${p.reload.toFixed(1)}s`:'R — QAYTA O‘QLASH';
    el.phase.textContent={lobby:'LOBBY',buy:'BUY TIME',live:state.mode==='deathmatch'?'DEATHMATCH':'LIVE ROUND',roundEnd:'ROUND OVER',matchEnd:'MATCH OVER'}[state.phase];
    el.clock.textContent=clock(state.bomb.state==='planted'?state.bomb.remaining:state.remaining);el.clock.classList.toggle('danger',state.bomb.state==='planted');
    el.round.textContent=state.mode==='deathmatch'?'3 DAQIQALIK JANG':`RAUND ${String(state.round).padStart(2,'0')} / FIRST TO 7`;
    el.fps.textContent=`${Math.round(fps)} FPS`;el.chunks.textContent=`${chunks} CHUNKS`;el.ping.textContent=`${Math.round(p.rtt||0)} MS`;
    el.objective.textContent=state.mode==='deathmatch'?'':state.bomb.state==='planted'?`⚠ QURILMA ${state.bomb.site} HUDUDIDA`:state.bomb.carrier===id?'◆ QURILMA SIZDA · A YOKI B HUDUDIGA BORING':p.team==='T'?'A / B HUDUDINI EGALLANG':'A / B HUDUDINI HIMOYA QILING';
    const progress=document.querySelector('#interaction');progress.style.display=p.interactProgress>0?'block':'none';progress.querySelector('span').textContent=p.team==='T'?'O‘RNATILMOQDA…':'ZARARSIZLANTIRILMOQDA…';progress.querySelector('i').style.width=`${Math.min(100,p.interactProgress/(p.team==='T'?3.2:5)*100)}%`;
    document.querySelector('#death-notice').classList.toggle('hidden',p.alive);
    document.querySelector('#death-notice span').textContent=state.mode==='deathmatch'?'3 soniyada qaytasiz · TAB — natijalar':'Keyingi raundni kuting · TAB — natijalar';
    if(p.health<this.lastHealth){gsap.killTweensOf('#damage-flash');gsap.fromTo('#damage-flash',{opacity:.5},{opacity:0,duration:.5});}this.lastHealth=p.health;
    if(this.lastPhase!==state.phase){
      this.lastPhase=state.phase;const banner=document.querySelector('#round-banner');
      banner.textContent=state.phase==='roundEnd'?`${state.result.winner} G‘ALABA QOZONDI`:state.phase==='live'?'OPERATSIYA BOSHLANDI':state.phase==='buy'?`RAUND ${state.round} · JIHOZLANING`:'';
      gsap.killTweensOf(banner);gsap.set(banner,{opacity:banner.textContent?1:0});if(banner.textContent)gsap.to(banner,{opacity:0,duration:.5,delay:2.5});
    }
    this.drawRadar(state,p);this.scoreboard(state);
  }
  drawRadar(state,me){
    const c=this.ctx;c.clearRect(0,0,180,180);c.fillStyle='#151f20';c.fillRect(0,0,180,180);
    c.fillStyle='#65706a';for(const b of MAPS[state.mapId].colliders)c.fillRect(90+b.x-b.sx/2,90+b.z-b.sz/2,b.sx,b.sz);
    for(const s of MAPS[state.mapId].sites){c.fillStyle='#e7b65d';c.font='bold 10px Arial';c.fillText(s.id,87+s.x,94+s.z);}
    for(const p of state.players){if(!p.alive||p.team!==me.team)continue;c.fillStyle=p.id===me.id?'#ffdc81':'#92bbc6';c.beginPath();c.arc(90+p.char.x,90+p.char.z,3,0,Math.PI*2);c.fill();}
    c.strokeStyle='#ffe7aa';c.beginPath();c.moveTo(90+me.char.x,90+me.char.z);c.lineTo(90+me.char.x-Math.sin(me.char.yaw)*10,90+me.char.z-Math.cos(me.char.yaw)*10);c.stroke();
  }
  scoreboard(state){
    if(document.querySelector('#scoreboard').classList.contains('hidden'))return;
    const body=document.querySelector('#scoreboard tbody');body.replaceChildren();
    for(const p of [...state.players].sort((a,b)=>b.kills-a.kills)){const row=document.createElement('tr');for(const value of [p.name+(p.alive?'':' †'),p.team,p.kills,p.deaths]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);}
  }
  results(state,onExit){this.dialog(`<small class="eyebrow">OPERATION COMPLETE</small><h2>${state.result?.winner?`${state.result.winner} — G‘OLIB.`:'JANG YAKUNLANDI.'}</h2><div class="final-scores"><span>T <b>${state.scores.T}</b></span><span>CT <b>${state.scores.CT}</b></span></div><div class="roster"></div><button id="results-exit" class="primary full">BOSH MENYU ${arrow}</button>`,true);for(const p of [...state.players].sort((a,b)=>b.kills-a.kills)){const row=document.createElement('div');row.textContent=`${p.name} · ${p.kills} K / ${p.deaths} D`;this.content.querySelector('.roster').append(row);}document.querySelector('#results-exit').onclick=onExit;}
}

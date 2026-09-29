import './style.css';
import { UI } from './ui.js';
import { Renderer } from './rendering.js';
import { Network } from './network.js';
import { Prediction } from './prediction.js';
import { CollisionIndex, MAPS } from '../../shared/maps.js';
import { DT, neutralInput } from '../../shared/constants.js';

const ui=new UI();let renderer;
try{renderer=new Renderer(document.querySelector('#scene'));}catch(error){document.querySelector('#loader').innerHTML='<b>WebGL2 talab qilinadi.</b><span>Brauzerda grafik tezlashtirishni yoqing.</span>';throw error;}
let selectedMap='sahara',selectedMode='competitive',team='T',playing=false,joining=false,joinGeneration=0;
let state=null,id=null,prediction=null,accumulator=0,sendAccumulator=0,lastUI=0,lastEvent=0,resultShown=false,highQuality=true;
const keys=new Set(),pressed=new Set();let firing=false,firePressed=false;
const network=new Network(receive,()=>{if(playing){leave();ui.toast('Server bilan aloqa uzildi. Xonaga qayta kiring.');}});

function receive(next){
  if(!playing)return;state=next;
  const reset=prediction.reconcile(state,id);if(reset){const p=prediction.character;renderer.camera.rotation.set(p.pitch,p.yaw,0,'YXZ');}
  for(const event of state.events)if(event.id>lastEvent){lastEvent=event.id;ui.event(event,id);if(event.type==='shot')renderer.shot(event,event.shooter===id);}
  if(state.phase==='lobby'){ui.resume(false);ui.lobby(state,id,async()=>{try{await network.request('start',{});}catch(error){ui.toast(error.message);}},leave);}
  else if(ui.modal.querySelector('.room-code')){ui.modal.close();ui.resume(!renderer.controls.isLocked);}
  if(state.phase==='matchEnd'&&!resultShown){resultShown=true;renderer.controls.unlock();ui.resume(false);ui.results(state,leave);}
}

async function join(practice,details={}){
  if(joining)return;joining=true;const generation=++joinGeneration;
  document.querySelector('#practice').disabled=true;
  try{
    const result=await network.join({name:details.name||'Operator',code:details.code||'OPS001',practice,mapId:selectedMap,mode:selectedMode,team});
    if(generation!==joinGeneration){network.leave();return;}
    id=result.id;state=result.snapshot;selectedMap=state.mapId;renderer.setMap(state.mapId);
    prediction=new Prediction(new CollisionIndex(MAPS[state.mapId]));playing=true;lastEvent=state.events.at(-1)?.id||0;resultShown=false;accumulator=0;sendAccumulator=0;
    ui.showGame(state.mapId);receive(state);if(state.phase!=='lobby')ui.resume(true);
  }catch(error){if(generation===joinGeneration){ui.toast(error.message);const el=document.querySelector('#join-error');if(el)el.textContent=error.message;network.leave();}}
  finally{if(generation===joinGeneration){joining=false;document.querySelector('#practice').disabled=false;const button=document.querySelector('#join-submit');if(button)button.disabled=false;}}
}

function leave(){
  joinGeneration++;joining=false;playing=false;renderer.controls.unlock();network.leave();state=null;id=null;prediction=null;keys.clear();pressed.clear();firing=false;firePressed=false;renderer.clearActors();renderer.bombMesh.visible=false;ui.showMenu();ui.resume(false);document.querySelector('#practice').disabled=false;
}

function input(){
  const c=neutralInput();c.yaw=renderer.camera.rotation.y;c.pitch=renderer.camera.rotation.x;
  if(!renderer.controls.isLocked||ui.modal.open||document.hidden){pressed.clear();firePressed=false;return c;}
  c.forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
  c.right=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  c.jump=keys.has('Space')||pressed.has('Space');c.crouch=keys.has('ControlLeft')||keys.has('ControlRight');c.walk=keys.has('ShiftLeft')||keys.has('ShiftRight');
  c.fire=firing||firePressed;c.reload=keys.has('KeyR')||pressed.has('KeyR');c.interact=keys.has('KeyE');pressed.clear();firePressed=false;return c;
}

document.querySelector('#practice').onclick=()=>join(true);
document.querySelector('#online').onclick=()=>{
  ui.dialog('<small class="eyebrow">MULTIPLAYER</small><h2>Operatsiyaga qo‘shiling.</h2><p>Yangi xona oching yoki do‘stingiz bilan bir xil kodni kiriting.</p><form id="join-form"><label for="operator-name">OPERATOR NOMI</label><input id="operator-name" value="Operator" maxlength="18" required><label for="room-input">XONA KODI</label><input id="room-input" value="OPS001" minlength="4" maxlength="8" pattern="[A-Za-z0-9]{4,8}" required><div id="join-error" role="alert"></div><button id="join-submit" class="primary full">XONAGA KIRISH →</button></form><p class="note">Xona egasi xarita va rejimni belgilaydi. Kamida 2 o‘yinchi kerak. T / CT jamoalarini server tenglashtiradi.</p>');
  document.querySelector('#join-form').onsubmit=event=>{event.preventDefault();document.querySelector('#join-submit').disabled=true;void join(false,{name:document.querySelector('#operator-name').value,code:document.querySelector('#room-input').value});};
};
document.querySelector('#guide-nav').onclick=()=>ui.controls();document.querySelector('#play-nav').onclick=()=>ui.modal.close();
document.querySelector('#team').onclick=e=>{team=team==='T'?'CT':'T';e.target.textContent=`${team} JAMOASI ⇄`;};
document.querySelectorAll('[data-map]').forEach(button=>button.onclick=()=>{selectedMap=button.dataset.map;renderer.setMap(selectedMap);document.querySelectorAll('[data-map]').forEach(b=>b.classList.toggle('selected',b===button));});
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{selectedMode=button.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b===button));});
document.querySelector('#settings').onclick=()=>{
  ui.dialog(`<small class="eyebrow">SYSTEM CONFIGURATION</small><h2>Sizning sozlamalaringiz.</h2><div class="setting"><span>Grafika</span><button id="quality">${highQuality?'YUQORI':'TEZKOR'}</button></div><label for="sensitivity">SICHQONCHA SEZGIRLIGI</label><input id="sensitivity" type="range" min="0.2" max="1.8" step="0.05" value="${renderer.controls.pointerSpeed}"><p class="note">Tezkor rejim soyalarni o‘chiradi va piksel zichligini pasaytiradi. Raqobatbardosh rejimda motion blur va bloom o‘chiq. O‘yin klaviatura va sichqoncha uchun mo‘ljallangan.</p>`);
  document.querySelector('#quality').onclick=e=>{highQuality=!highQuality;renderer.setQuality(highQuality);e.target.textContent=highQuality?'YUQORI':'TEZKOR';};
  document.querySelector('#sensitivity').oninput=e=>renderer.controls.pointerSpeed=Number(e.target.value);
};
document.querySelector('#lock').onclick=()=>{try{renderer.controls.lock();}catch{ui.toast('Sichqoncha boshqaruvini yoqish uchun tugmani qayta bosing.');}};
document.querySelector('#leave').onclick=leave;document.querySelector('#pause-button').onclick=()=>{renderer.controls.unlock();ui.resume(true);};
renderer.controls.addEventListener('lock',()=>{ui.resume(false);keys.clear();pressed.clear();firing=false;firePressed=false;});
renderer.controls.addEventListener('unlock',()=>{keys.clear();pressed.clear();firing=false;firePressed=false;if(playing&&state?.phase!=='lobby'&&!resultShown)ui.resume(true);});
document.addEventListener('pointerlockerror',()=>ui.toast('Pointer Lock bloklandi. Brauzer oynasini faollashtirib, qayta bosing.'));

function buy(){
  const p=state?.players.find(p=>p.id===id);if(!p)return;
  if(state.phase!=='buy'){ui.toast('Xarid vaqti tugagan. Keyingi raundni kuting.');return;}
  renderer.controls.unlock();ui.buy(p,async item=>{
    try{await network.request('buy',item);ui.toast('Jihoz xarid qilindi.');ui.modal.close();ui.resume(true);}catch(error){ui.toast(error.message);}
  });
}
const controlKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyR','KeyE']);
addEventListener('keydown',event=>{
  if(event.target instanceof HTMLInputElement)return;
  if(playing&&controlKeys.has(event.code)){event.preventDefault();keys.add(event.code);if(!event.repeat&&renderer.controls.isLocked)pressed.add(event.code);}
  if(event.code==='Tab'&&playing){event.preventDefault();document.querySelector('#scoreboard').classList.remove('hidden');}
  if(!event.repeat&&event.code==='KeyB'&&playing&&!ui.modal.open)buy();
});
addEventListener('keyup',event=>{keys.delete(event.code);if(event.code==='Tab')document.querySelector('#scoreboard').classList.add('hidden');});
addEventListener('mousedown',event=>{if(event.button===0&&renderer.controls.isLocked){firing=true;firePressed=true;}});
addEventListener('mouseup',event=>{if(event.button===0)firing=false;});
addEventListener('blur',()=>{keys.clear();pressed.clear();firing=false;firePressed=false;});document.addEventListener('visibilitychange',()=>{keys.clear();pressed.clear();firing=false;firePressed=false;accumulator=0;});
ui.modal.addEventListener('cancel',event=>{if(ui.locked){event.preventDefault();leave();}});
ui.modal.addEventListener('close',()=>{if(joining&&!playing){joinGeneration++;joining=false;network.leave();document.querySelector('#practice').disabled=false;}});

let previous=performance.now(),fps=60;
renderer.renderer.setAnimationLoop(now=>{
  const raw=(now-previous)/1000;previous=now;const dt=Math.min(.1,raw);fps+=(1/Math.max(.001,raw)-fps)*.04;
  if(playing&&state&&prediction){
    accumulator+=dt;let steps=0;const alive=state.players.find(p=>p.id===id)?.alive;
    while(accumulator>=DT&&steps++<7){prediction.command(input(),state,alive);accumulator-=DT;}
    sendAccumulator+=dt;if(sendAccumulator>=DT*2){sendAccumulator%=DT*2;network.send(prediction.pending.slice(-8));}
    prediction.smooth(dt);
    if(now-lastUI>90){ui.update(state,id,{fps,chunks:renderer.chunks.loaded.size});lastUI=now;}
  }
  renderer.update({state,localId:id,localCharacter:prediction?.character,remotePlayers:network.remote(now),menu:!playing,dt,now,correction:prediction?.offset});
});
ui.ready();
Object.defineProperty(window,'__KONTIR__',{get:()=>({playing,state,id,predicted:prediction?.character,pending:prediction?.pending.length,drawCalls:renderer.renderer.info.render.calls,chunks:renderer.chunks.loaded.size})});

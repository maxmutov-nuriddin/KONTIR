import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChunkWorld } from './world/chunks.js';
import { MAPS } from '../../shared/maps.js';

const geometry=new THREE.BoxGeometry(1,1,1);
function material(color,roughness=.8){return new THREE.MeshStandardMaterial({color,roughness});}
function box(parent,m,x,y,z,sx,sy,sz){const mesh=new THREE.Mesh(geometry,m);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
const metal=new THREE.MeshStandardMaterial({color:0x273435,metalness:.7,roughness:.38});
const polymer=material(0x535b48,.8),black=material(0x161e1e),skin=material(0xba9d7c);

function weapon(){
  const root=new THREE.Group();
  box(root,metal,0,0,0,.105,.15,.43);box(root,polymer,0,.0,-.34,.12,.115,.33);
  box(root,black,0,.025,-.63,.036,.036,.3);box(root,metal,0,.025,-.805,.055,.055,.08);
  box(root,polymer,0,-.015,.34,.12,.14,.34);
  const grip=box(root,black,0,-.14,.05,.07,.24,.11);grip.rotation.x=-.2;
  const mag=box(root,black,0,-.16,-.12,.07,.23,.13);mag.rotation.x=.13;
  box(root,metal,0,.11,-.02,.08,.05,.3);box(root,black,0,.15,.09,.065,.07,.06);box(root,black,0,.115,-.48,.055,.13,.03);
  for(let i=0;i<7;i++)box(root,black,0,.069,-.23-i*.038,.123,.01,.009);
  return root;
}

function operator(team){
  const root=new THREE.Group(),cloth=material(team==='T'?0x8d7655:0x476371),vest=material(0x303c35);
  box(root,cloth,0,.96,0,.5,.65,.32);box(root,vest,0,1.03,-.09,.54,.49,.22);
  box(root,skin,0,1.55,0,.29,.3,.27);box(root,vest,0,1.7,.01,.33,.16,.3);
  const legs=[box(root,cloth,-.15,.37,0,.2,.72,.22),box(root,cloth,.15,.37,0,.2,.72,.22)];
  box(root,black,-.15,.07,-.05,.23,.14,.36);box(root,black,.15,.07,-.05,.23,.14,.36);
  box(root,cloth,-.33,1.12,-.12,.17,.46,.19);box(root,cloth,.33,1.12,-.12,.17,.46,.19);
  const gun=weapon();gun.scale.setScalar(.85);gun.position.set(.2,1.18,-.35);root.add(gun);
  root.userData={legs,materials:[cloth,vest]};return root;
}

function textTexture(text,background='#c5ac79',color='#29302a'){
  const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,512,256);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 170px Arial';ctx.fillText(text,256,140);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export class Renderer {
  constructor(canvas){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.035,500);this.camera.rotation.order='YXZ';this.scene.add(this.camera);
    this.controls=new PointerLockControls(this.camera,document.body);this.controls.pointerSpeed=.7;this.controls.minPolarAngle=.05;this.controls.maxPolarAngle=Math.PI-.05;
    this.scene.add(new THREE.HemisphereLight(0xd8e8ed,0x63543c,2.2));
    this.sun=new THREE.DirectionalLight(0xffeccb,3.2);this.sun.position.set(-40,70,30);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);
    Object.assign(this.sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:180});this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.normalBias=.03;this.scene.add(this.sun,this.sun.target);
    const generator=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=generator.fromScene(room,.05);this.scene.environment=this.environment.texture;room.dispose();generator.dispose();
    this.viewGun=weapon();this.viewGun.position.set(.25,-.24,-.43);this.camera.add(this.viewGun);
    this.muzzle=new THREE.Mesh(new THREE.OctahedronGeometry(.1),new THREE.MeshBasicMaterial({color:0xffd686,transparent:true,opacity:.9}));this.muzzle.position.set(0,.025,-.86);this.muzzle.visible=false;this.viewGun.add(this.muzzle);this.flash=0;this.kick=0;
    this.arms=new THREE.Group();box(this.arms,polymer,.27,-.38,-.15,.15,.16,.45);box(this.arms,polymer,.08,-.35,-.6,.13,.14,.45);this.camera.add(this.arms);
    this.heroGun=weapon();this.heroGun.scale.setScalar(9);this.scene.add(this.heroGun);
    this.actors=new Map();this.effects=[];this.temp=new THREE.Vector3();this.menu=true;
    this.setMap('sahara');
    addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
  }
  setMap(id){
    this.chunks?.dispose();if(this.environmentGroup){this.environmentGroup.traverse(o=>{if(o.userData.owned){o.material.map?.dispose();o.material.dispose();if(o.geometry!==geometry)o.geometry.dispose();}});this.scene.remove(this.environmentGroup);}
    this.map=MAPS[id];this.chunks=new ChunkWorld(this.scene,this.map);this.environmentGroup=new THREE.Group();this.scene.add(this.environmentGroup);
    this.scene.background=new THREE.Color(this.map.palette.sky);this.scene.fog=new THREE.FogExp2(this.map.palette.sky,.0035);
    const ground=box(this.environmentGroup,material(this.map.palette.ground),0,-.15,0,500,.3,500);ground.userData.owned=true;
    for(const site of this.map.sites){
      const plane=new THREE.Mesh(new THREE.RingGeometry(site.radius-.14,site.radius,64),new THREE.MeshBasicMaterial({color:0xe5b65a,side:THREE.DoubleSide}));plane.rotation.x=-Math.PI/2;plane.position.set(site.x,.02,site.z);plane.userData.owned=true;this.environmentGroup.add(plane);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(4,2),new THREE.MeshStandardMaterial({map:textTexture(site.id)}));label.position.set(site.x,2.8,site.z-5.5);label.userData.owned=true;this.environmentGroup.add(label);
    }
    const bombMat=new THREE.MeshStandardMaterial({color:0xdeac55,emissive:0x7d2a09,emissiveIntensity:.3});this.bombMesh=box(this.environmentGroup,bombMat,0,.16,0,.4,.32,.3);this.bombMesh.visible=false;this.bombMesh.userData.owned=true;
    this.clearActors();
  }
  clearActors(){for(const a of this.actors.values()){this.scene.remove(a);a.userData.materials.forEach(m=>m.dispose());}this.actors.clear();for(const e of this.effects){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}this.effects=[];}
  setQuality(high){this.renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:1));this.renderer.shadowMap.enabled=high;this.scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});}
  shot(event,local){
    const points=[new THREE.Vector3(event.from.x,event.from.y,event.from.z),new THREE.Vector3(event.to.x,event.to.y,event.to.z)];
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:local?0xffde99:0xe8e0c1,transparent:true,opacity:.7}));this.scene.add(line);this.effects.push({mesh:line,ttl:.075});
    if(local){this.flash=.055;this.kick=.035;}
  }
  update({state,localId,localCharacter,remotePlayers,menu,dt,now,correction}){
    this.menu=menu;this.heroGun.visible=menu;this.viewGun.visible=!menu;this.arms.visible=!menu;
    if(menu){
      this.camera.position.set(13,7,39);this.camera.lookAt(-7,4,10);
      this.heroGun.position.set(7.8,5.3,24);this.heroGun.rotation.set(.12,Math.PI*.58+Math.sin(now*.0002)*.08,-.12);
    }else if(localCharacter){
      const p=localCharacter;this.camera.position.set(p.x+(correction?.x||0),p.y+(p.crouched?1.0:1.62)+(correction?.y||0),p.z+(correction?.z||0));
      const bob=p.grounded?Math.sin(now*.012)*Math.min(.018,Math.hypot(p.vx,p.vz)*.003):0;
      this.kick*=Math.exp(-18*dt);this.viewGun.position.set(.25,-.24+bob,-.43+this.kick);this.viewGun.rotation.x=this.kick*.8;
      this.sun.position.copy(this.camera.position).add(this.temp.set(-40,70,30));this.sun.target.position.copy(this.camera.position);
      const me=state?.players.find(p=>p.id===localId);this.viewGun.visible=!!me?.alive;this.arms.visible=!!me?.alive;
      const active=new Set();
      for(const p of remotePlayers||state?.players||[]){
        if(p.id===localId)continue;active.add(p.id);let actor=this.actors.get(p.id);
        if(!actor){actor=operator(p.team);this.actors.set(p.id,actor);this.scene.add(actor);}
        actor.visible=p.alive;actor.position.set(p.char.x,p.char.y,p.char.z);actor.rotation.y=p.char.yaw;actor.scale.y=p.char.crouched?.65:1;
        const walk=Math.hypot(p.char.vx,p.char.vz)>.3;actor.userData.legs.forEach((leg,i)=>leg.rotation.x=walk?Math.sin(now*.01+i*Math.PI)*.32:0);
      }
      for(const [id,a]of this.actors)if(!active.has(id)){this.scene.remove(a);a.userData.materials.forEach(m=>m.dispose());this.actors.delete(id);}
      const b=state?.bomb;this.bombMesh.visible=b?.state==='planted'||b?.state==='dropped';if(this.bombMesh.visible)this.bombMesh.position.set(b.x,b.y+.16,b.z);
    }
    this.flash-=dt;this.muzzle.visible=this.flash>0;
    for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.ttl-=dt;if(e.ttl<=0){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();this.effects.splice(i,1);}}
    this.chunks.update(this.camera,now);this.renderer.render(this.scene,this.camera);
  }
}

import * as THREE from 'three';

const cube=new THREE.BoxGeometry(1,1,1);
function facadeTexture(industrial){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');
  ctx.fillStyle=industrial?'#b4bdb9':'#d8c5a4';ctx.fillRect(0,0,256,256);
  let seed=19;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<6000;i++){ctx.fillStyle=`rgba(52,44,29,${rand()*.1})`;ctx.fillRect(rand()*256,rand()*256,1+rand()*4,1);}
  ctx.strokeStyle=industrial?'#7b878266':'#9e866144';ctx.lineWidth=2;
  for(let y=0;y<256;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
  if(industrial)for(let x=0;x<256;x+=20){ctx.fillStyle='#5d6a6722';ctx.fillRect(x,0,3,256);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}

export class ChunkWorld {
  constructor(scene,map){
    this.scene=scene;this.map=map;this.loaded=new Map();this.data=new Map();this.lastUpdate=-1000;
    this.frustum=new THREE.Frustum();this.matrix=new THREE.Matrix4();this.temp=new THREE.Object3D();
    this.texture=facadeTexture(map.id==='harbor');
    this.materials={
      wall:new THREE.MeshStandardMaterial({color:map.palette.wall,roughness:.95,map:this.texture}),
      building:new THREE.MeshStandardMaterial({color:map.palette.wall,roughness:.95,map:this.texture}),
      crate:new THREE.MeshStandardMaterial({color:0x7d805b,roughness:.85,map:this.texture}),
      container:new THREE.MeshStandardMaterial({color:map.palette.accent,roughness:.78,map:this.texture,metalness:.15}),
      deck:new THREE.MeshStandardMaterial({color:0x8e9286,roughness:1}),
      stairs:new THREE.MeshStandardMaterial({color:0xada58f,roughness:.95}),
      rail:new THREE.MeshStandardMaterial({color:0x3d4b4c,roughness:.6,metalness:.3}),
      window:new THREE.MeshStandardMaterial({color:0x36575b,roughness:.25,metalness:.45}),
      pole:new THREE.MeshStandardMaterial({color:0x414e4e,roughness:.8}),
      trim:new THREE.MeshStandardMaterial({color:map.id==='harbor'?0x4e6268:0xb09b77,roughness:1}),
    };
    const records=[...map.colliders,...map.props];
    for(const b of map.colliders){
      if(b.kind==='building'||b.kind==='container'){
        records.push({kind:'trim',x:b.x,y:b.y+b.sy/2+.18,z:b.z,sx:b.sx+.5,sy:.35,sz:b.sz+.5});
        for(let x=-5;x<=5;x+=5)for(const side of [-1,1]){
          records.push({kind:'window',x:b.x+x,y:4.7,z:b.z+side*(b.sz/2+.025),sx:1.8,sy:2.1,sz:.05});
          records.push({kind:'trim',x:b.x+x,y:3.5,z:b.z+side*(b.sz/2+.12),sx:2.1,sy:.18,sz:.3});
        }
      }
      if(b.kind==='crate')for(const sign of [-1,1])records.push({kind:'rail',x:b.x+sign*b.sx*.35,y:b.y,z:b.z,sx:.1,sy:b.sy+.05,sz:b.sz+.06});
    }
    for(const item of records){const key=`${Math.floor(item.x/map.chunkSize)},${Math.floor(item.z/map.chunkSize)}`;if(!this.data.has(key))this.data.set(key,[]);this.data.get(key).push(item);}
  }
  load(key){
    const records=this.data.get(key);if(!records)return;
    const group=new THREE.Group(),byMaterial=new Map();
    for(const r of records){if(!byMaterial.has(r.kind))byMaterial.set(r.kind,[]);byMaterial.get(r.kind).push(r);}
    for(const [kind,list]of byMaterial){
      const mesh=new THREE.InstancedMesh(cube,this.materials[kind]||this.materials.wall,list.length);
      list.forEach((r,i)=>{this.temp.position.set(r.x,r.y,r.z);this.temp.scale.set(r.sx,r.sy,r.sz);this.temp.updateMatrix();mesh.setMatrixAt(i,this.temp.matrix);});
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
    }
    this.scene.add(group);this.loaded.set(key,{group,bounds:new THREE.Box3().setFromObject(group)});
  }
  update(camera,now){
    if(now-this.lastUpdate>250){
      this.lastUpdate=now;const cx=Math.floor(camera.position.x/this.map.chunkSize),cz=Math.floor(camera.position.z/this.map.chunkSize);
      for(const key of this.data.keys()){
        const [x,z]=key.split(',').map(Number),distance=Math.max(Math.abs(x-cx),Math.abs(z-cz));
        if(distance<=3&&!this.loaded.has(key))this.load(key);
        else if(distance>4&&this.loaded.has(key)){const chunk=this.loaded.get(key);this.scene.remove(chunk.group);chunk.group.children.forEach(m=>m.dispose());this.loaded.delete(key);}
      }
    }
    camera.updateMatrixWorld();this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.matrix);
    for(const chunk of this.loaded.values())chunk.group.visible=this.frustum.intersectsBox(chunk.bounds);
  }
  dispose(){for(const c of this.loaded.values()){this.scene.remove(c.group);c.group.children.forEach(m=>m.dispose());}this.loaded.clear();Object.values(this.materials).forEach(m=>m.dispose());this.texture.dispose();}
}

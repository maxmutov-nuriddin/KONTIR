export const WEAPONS=Object.freeze({
  pistol:{id:'pistol',name:'P9 SIDEARM',price:0,damage:24,interval:0.22,magazine:15,reserve:75,reload:1.5,spread:0.003,automatic:false,recoil:[[0,0.008],[0.002,0.011],[-0.002,0.014]]},
  rifle:{id:'rifle',name:'KR-47 RIFLE',price:2400,damage:30,interval:0.1,magazine:30,reserve:90,reload:2.3,spread:0.002,automatic:true,recoil:[[0,0.005],[0.001,0.012],[-0.001,0.018],[0.002,0.025],[0.007,0.032],[0.012,0.04],[0.016,0.044],[0.009,0.047],[-0.004,0.05],[-0.013,0.053],[-0.018,0.055],[-0.012,0.056]]},
  smg:{id:'smg',name:'VECTOR-9 SMG',price:1300,damage:19,interval:0.075,magazine:32,reserve:128,reload:1.8,spread:0.004,automatic:true,recoil:[[0,0.004],[0.002,0.009],[-0.003,0.013],[0.005,0.018],[-0.006,0.023]]},
});

export function rayBox(origin,direction,min,max,maxDistance=200){
  let near=0,far=maxDistance;
  for(const axis of ['x','y','z']){
    if(Math.abs(direction[axis])<1e-8){if(origin[axis]<min[axis]||origin[axis]>max[axis])return null;continue;}
    let a=(min[axis]-origin[axis])/direction[axis],b=(max[axis]-origin[axis])/direction[axis];
    if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;
  }
  return near;
}

export function hitboxes(p){
  const h=p.crouched?1.15:1.8;
  return [
    {part:'head',multiplier:3.5,min:{x:p.x-.19,y:p.y+h-.36,z:p.z-.19},max:{x:p.x+.19,y:p.y+h,z:p.z+.19}},
    {part:'chest',multiplier:1,min:{x:p.x-.3,y:p.y+h*.38,z:p.z-.24},max:{x:p.x+.3,y:p.y+h-.36,z:p.z+.24}},
    {part:'legs',multiplier:.7,min:{x:p.x-.25,y:p.y,z:p.z-.22},max:{x:p.x+.25,y:p.y+h*.38,z:p.z+.22}},
  ];
}

export function shotDirection(yaw,pitch,recoil,spread,seed){
  let state=seed>>>0;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296-.5;};
  const y=yaw+recoil[0]+random()*spread,p=pitch+recoil[1]+random()*spread;
  return {x:-Math.sin(y)*Math.cos(p),y:Math.sin(p),z:-Math.cos(y)*Math.cos(p)};
}

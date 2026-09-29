function makeMap(id) {
  const industrial=id==='harbor';
  const map={ id, name:industrial?'IRON HARBOR':'SAHARA OUTPOST', subtitle:industrial?'Konteynerlar. Uzun yo‘laklar. Baland platformalar.':'Qumtoshi. Tor ko‘chalar. Ochiq maydonlar.',
    size:160, chunkSize:32, palette:industrial?{ground:0x606a68,wall:0x8c9692,accent:0x487581,sky:0xa3b8bf}:{ground:0xbdae8a,wall:0xcfba91,accent:0x887450,sky:0xc8d2cc},
    colliders:[], props:[], sites:[{id:'A',x:-49,z:-28,radius:6},{id:'B',x:47,z:-34,radius:6}],
    spawns:{T:[],CT:[]}, botNodes:[{x:0,z:55},{x:-47,z:38},{x:-49,z:-28},{x:0,z:-55},{x:47,z:-34},{x:47,z:38},{x:0,z:8}] };
  const add=(x,y,z,sx,sy,sz,kind='wall')=>{const item={id:`box-${map.colliders.length}`,x,y,z,sx,sy,sz,kind};map.colliders.push(item);return item;};
  add(-81,5,0,2,10,164);add(81,5,0,2,10,164);add(0,5,-81,164,10,2);add(0,5,81,164,10,2);
  // Three lanes with cross-connections and two accessible raised decks.
  for(const x of [-25,25])for(const z of [-48,-12,27]){
    add(x,4,z,18,8,22,industrial?'container':'building');
    map.props.push({kind:'window',x:x+(x<0?-9.02:9.02),y:4,z,sx:0.08,sy:2,sz:8});
  }
  add(0,2,-22,10,4,8);add(-58,2,13,10,4,8);add(57,2,9,10,4,8);
  add(-54,1.25,-51,9,2.5,5,'crate');add(50,1.25,-56,9,2.5,5,'crate');
  add(-6,1.2,31,3,2.4,3,'crate');add(7,1.2,7,3,2.4,3,'crate');add(48,1.2,47,4,2.4,4,'crate');add(-52,1.2,47,4,2.4,4,'crate');
  for(const sign of [-1,1]) {
    const x=sign*65;
    add(x,2.8,-7,12,0.4,24,'deck');
    // Stairs ascend from z=17 to z=5 in 0.25m increments.
    for(let i=0;i<12;i++)add(x,(i+1)*0.125,16.5-i,4,(i+1)*0.25,1,'stairs');
    add(x+sign*5.6,3.6,-7,0.4,1.2,24,'rail');
  }
  if(industrial){add(3,2.1,53,12,4.2,4,'container');add(-4,1.5,-62,8,3,4,'container');}
  for(let i=0;i<5;i++){
    map.spawns.T.push({x:-10+i*4,y:0,z:68,yaw:0});
    map.spawns.CT.push({x:-10+i*4,y:0,z:-68,yaw:Math.PI});
  }
  for(let i=0;i<26;i++){const sign=i%2?1:-1;map.props.push({kind:'pole',x:sign*76,y:3,z:-70+Math.floor(i/2)*11,sx:0.16,sy:6,sz:0.16});}
  return map;
}

export const MAPS={sahara:makeMap('sahara'),harbor:makeMap('harbor')};
export function colliderBounds(b){return {min:{x:b.x-b.sx/2,y:b.y-b.sy/2,z:b.z-b.sz/2},max:{x:b.x+b.sx/2,y:b.y+b.sy/2,z:b.z+b.sz/2}};}

export class CollisionIndex {
  constructor(map){
    this.cells=new Map();this.size=16;
    for(const box of map.colliders){
      const b={...box,...colliderBounds(box)};
      for(let x=Math.floor(b.min.x/this.size);x<=Math.floor(b.max.x/this.size);x++)for(let z=Math.floor(b.min.z/this.size);z<=Math.floor(b.max.z/this.size);z++){
        const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(b);
      }
    }
  }
  query(x,z,r=1){
    const result=new Map();
    for(let cx=Math.floor((x-r)/this.size);cx<=Math.floor((x+r)/this.size);cx++)for(let cz=Math.floor((z-r)/this.size);cz<=Math.floor((z+r)/this.size);cz++)for(const b of this.cells.get(`${cx},${cz}`)||[])result.set(b.id,b);
    return [...result.values()];
  }
}

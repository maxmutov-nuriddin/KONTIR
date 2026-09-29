import { colliderBounds } from '../../shared/maps.js';

// Small server-only navigation grid. Production maps should ship a baked navmesh.
export class Navigation {
  constructor(map){
    this.cell=4;this.min=-76;this.count=39;this.blocked=new Set();
    const boxes=map.colliders.map(colliderBounds).filter(b=>b.min.y<1.8&&b.max.y>0.32);
    for(let x=0;x<this.count;x++)for(let z=0;z<this.count;z++){
      const p=this.world(x,z);
      if(boxes.some(b=>p.x+.5>b.min.x&&p.x-.5<b.max.x&&p.z+.5>b.min.z&&p.z-.5<b.max.z))this.blocked.add(`${x},${z}`);
    }
  }
  world(x,z){return{x:this.min+x*this.cell,z:this.min+z*this.cell};}
  grid(p){return{x:Math.max(0,Math.min(this.count-1,Math.round((p.x-this.min)/this.cell))),z:Math.max(0,Math.min(this.count-1,Math.round((p.z-this.min)/this.cell)))};}
  path(from,to){
    const start=this.grid(from),goal=this.grid(to);const startKey=`${start.x},${start.z}`;
    const queue=[start],came=new Map([[startKey,null]]);let found=null;
    for(let i=0;i<queue.length;i++){
      const p=queue[i];if(Math.abs(p.x-goal.x)+Math.abs(p.z-goal.z)<=1){found=p;break;}
      for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const next={x:p.x+dx,z:p.z+dz},key=`${next.x},${next.z}`;
        if(next.x<0||next.z<0||next.x>=this.count||next.z>=this.count||came.has(key)||this.blocked.has(key))continue;
        came.set(key,p);queue.push(next);
      }
    }
    if(!found)return [];
    const result=[];
    for(let p=found;p;p=came.get(`${p.x},${p.z}`))result.push(this.world(p.x,p.z));
    return result.reverse().slice(1);
  }
}

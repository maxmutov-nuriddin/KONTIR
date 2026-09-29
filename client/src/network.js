import { io } from 'socket.io-client';
import { angleDelta, RULES } from '../../shared/constants.js';

export class Network {
  constructor(onSnapshot,onDisconnect){
    this.socket=io({autoConnect:false,reconnection:false,timeout:6000});this.latest=null;this.frames=[];this.received=0;this.id=null;
    this.socket.on('probe',ack=>{if(typeof ack==='function')ack();});
    this.socket.on('snapshot',state=>{
      if(!this.id||this.latest&&state.tick<this.latest.tick)return;
      if(this.latest&&state.epoch!==this.latest.epoch)this.frames=[];
      this.latest=state;this.frames.push(state);if(this.frames.length>24)this.frames.shift();this.received=performance.now();onSnapshot(state);
    });
    this.socket.on('disconnect',reason=>{if(reason!=='io client disconnect')onDisconnect();});
  }
  async join(request){
    if(!this.socket.connected)await new Promise((resolve,reject)=>{
      const cleanup=()=>{this.socket.off('connect',ok);this.socket.off('connect_error',fail);};
      const ok=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Serverga ulanib bo‘lmadi. npm run dev ishga tushganini tekshiring.'));};
      this.socket.once('connect',ok);this.socket.once('connect_error',fail);this.socket.connect();
    });
    const result=await this.request('join',request);this.id=result.id;this.latest=result.snapshot;this.frames=[result.snapshot];this.received=performance.now();return result;
  }
  request(event,payload){return new Promise((resolve,reject)=>this.socket.timeout(6000).emit(event,payload,(error,response)=>{if(error)reject(new Error('Server javob bermadi.'));else if(response?.error)reject(new Error(response.error));else resolve(response);}));}
  send(commands){if(this.socket.connected&&commands.length)this.socket.volatile.emit('commands',commands.slice(-8));}
  leave(){this.socket.disconnect();this.id=null;this.latest=null;this.frames=[];}
  remote(now){
    if(this.frames.length<2)return this.latest?.players||[];
    const target=this.latest.tick+(now-this.received)/1000*64-RULES.interpolationSeconds*64;
    while(this.frames.length>2&&this.frames[1].tick<=target)this.frames.shift();
    const a=this.frames[0],b=this.frames[1];const alpha=Math.max(0,Math.min(1,(target-a.tick)/Math.max(1,b.tick-a.tick)));
    const old=new Map(a.players.map(p=>[p.id,p]));
    return b.players.map(p=>{
      const prev=old.get(p.id);if(!prev||prev.alive!==p.alive||Math.hypot(p.char.x-prev.char.x,p.char.y-prev.char.y,p.char.z-prev.char.z)>3)return p;
      const char={...p.char};for(const axis of ['x','y','z'])char[axis]=prev.char[axis]+(char[axis]-prev.char[axis])*alpha;
      char.yaw=prev.char.yaw+angleDelta(p.char.yaw,prev.char.yaw)*alpha;
      // Maximum 50 ms extrapolation. Beyond that, freeze rather than drift through walls.
      if(target>b.tick){const dt=Math.min(.05,(target-b.tick)/64);char.x+=char.vx*dt;char.y+=char.vy*dt;char.z+=char.vz*dt;}
      return {...p,char};
    });
  }
}

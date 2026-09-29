import { DT, neutralInput } from '../../shared/constants.js';
import { moveCharacter } from '../../shared/movement.js';

export class Prediction {
  constructor(index){this.index=index;this.pending=[];this.seq=0;this.epoch=-1;this.character=null;this.offset={x:0,y:0,z:0};}
  simulate(character,command,state,alive){
    const input=state.phase==='live'&&alive?command:{...neutralInput(),yaw:command.yaw,pitch:command.pitch};
    moveCharacter(character,input,this.index,DT);
  }
  command(input,state,alive){
    // Stop generating time when unacknowledged history fills up. Server remains authoritative.
    if(!this.character||this.pending.length>=128)return null;
    const command={...input,seq:this.seq++};this.pending.push(command);this.simulate(this.character,command,state,alive);return command;
  }
  reconcile(state,id){
    const p=state.players.find(p=>p.id===id);if(!p)return;
    if(this.epoch!==state.epoch||this.life!==p.life||!this.character){this.epoch=state.epoch;this.life=p.life;this.pending=[];this.character={...p.char};this.offset={x:0,y:0,z:0};this.seq=Math.max(this.seq,p.ack+1);return true;}
    const previous={...this.character};this.pending=this.pending.filter(c=>c.seq>p.ack);this.character={...p.char};
    for(const command of this.pending)this.simulate(this.character,command,state,p.alive);
    const error=Math.hypot(previous.x-this.character.x,previous.y-this.character.y,previous.z-this.character.z);
    if(error>2||!p.alive)this.offset={x:0,y:0,z:0};else for(const axis of ['x','y','z'])this.offset[axis]+=previous[axis]-this.character[axis];
    return false;
  }
  smooth(dt){for(const axis of ['x','y','z'])this.offset[axis]*=Math.exp(-18*dt);}
}

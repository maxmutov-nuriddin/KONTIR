import { MOVEMENT as M, clamp } from './constants.js';

export function character(spawn){return {x:spawn.x,y:spawn.y,z:spawn.z,vx:0,vy:0,vz:0,yaw:spawn.yaw,pitch:0,grounded:true,crouched:false,lastJump:false};}
const overlaps=(p,b,height)=>p.x+M.radius>b.min.x&&p.x-M.radius<b.max.x&&p.z+M.radius>b.min.z&&p.z-M.radius<b.max.z&&p.y+height>b.min.y+0.0001&&p.y<b.max.y-0.0001;

export function moveCharacter(p,input,index,dt){
  p.yaw=input.yaw;p.pitch=clamp(input.pitch,-1.54,1.54);
  const nearby=index.query(p.x,p.z,2);
  if(input.crouch)p.crouched=true;
  else if(!nearby.some(b=>overlaps(p,b,M.height)))p.crouched=false;
  const height=p.crouched?M.crouchHeight:M.height;
  const wasGrounded=p.grounded;
  const jump=input.jump&&!p.lastJump&&p.grounded&&!p.crouched;
  p.lastJump=input.jump;
  // Jump precedes friction: a correctly timed fresh press retains momentum.
  if(jump){p.vy=M.jump;p.grounded=false;}
  if(p.grounded){
    const speed=Math.hypot(p.vx,p.vz);
    const drop=Math.max(M.stopSpeed,speed)*M.friction*dt;
    const ratio=speed?Math.max(0,speed-drop)/speed:0;p.vx*=ratio;p.vz*=ratio;
  }
  const length=Math.hypot(input.forward,input.right);
  if(length>0){
    const f=input.forward/Math.max(1,length),r=input.right/Math.max(1,length);
    const wx=-Math.sin(input.yaw)*f+Math.cos(input.yaw)*r;
    const wz=-Math.cos(input.yaw)*f-Math.sin(input.yaw)*r;
    const wishSpeed=p.crouched?M.crouchSpeed:input.walk?M.walkSpeed:M.speed;
    const add=(p.grounded?wishSpeed:M.airWishCap)-(p.vx*wx+p.vz*wz);
    if(add>0){const acceleration=Math.min(add,(p.grounded?M.acceleration:M.airAcceleration)*wishSpeed*dt);p.vx+=wx*acceleration;p.vz+=wz*acceleration;}
  }
  // A safety cap bounds extreme accumulated air-strafe speed in this prototype.
  const horizontal=Math.hypot(p.vx,p.vz);if(horizontal>9){p.vx*=9/horizontal;p.vz*=9/horizontal;}
  p.vy-=M.gravity*dt;
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(p.vx),Math.abs(p.vy),Math.abs(p.vz))*dt/0.15));
  p.grounded=false;
  for(let n=0;n<steps;n++){
    const sub=dt/steps;
    for(const axis of ['x','z']){
      const velocity=axis==='x'?'vx':'vz',old=p[axis];p[axis]+=p[velocity]*sub;
      for(const b of index.query(p.x,p.z,1)){
        if(!overlaps(p,b,height))continue;
        const rise=b.max.y-p.y;
        const raised={...p,y:b.max.y+0.001};
        if(wasGrounded&&!jump&&rise>0&&rise<=M.step&&!index.query(p.x,p.z,1).some(other=>other.id!==b.id&&overlaps(raised,other,height))){p.y=raised.y;continue;}
        p[axis]=old;p[velocity]=0;break;
      }
    }
    const oldY=p.y;p.y+=p.vy*sub;
    for(const b of index.query(p.x,p.z,1)){
      if(!overlaps(p,b,height))continue;
      if(p.vy<=0&&oldY>=b.max.y-0.04){p.y=b.max.y;p.grounded=true;}
      else if(p.vy>0){p.y=b.min.y-height;}
      else p.y=oldY;
      p.vy=0;
    }
    if(p.y<=0){p.y=0;p.vy=0;p.grounded=true;}
  }
  return p;
}

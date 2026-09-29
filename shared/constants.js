export const TICK_RATE = 64;
export const DT = 1 / TICK_RATE;
export const RULES = Object.freeze({ buySeconds: 12, roundSeconds: 105, plantSeconds: 3.2, defuseSeconds: 5, bombSeconds: 35, intermissionSeconds: 5, wins: 7, maxPlayers: 10, rewindSeconds: 0.2, interpolationSeconds: 0.1 });
export const MOVEMENT = Object.freeze({ radius: 0.34, height: 1.8, crouchHeight: 1.15, eye: 1.62, speed: 5.5, walkSpeed: 2.8, crouchSpeed: 2.1, acceleration: 10, airAcceleration: 8, airWishCap: 1.3, friction: 6, stopSpeed: 2, gravity: 20, jump: 6.2, step: 0.32 });
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const neutralInput=()=>({forward:0,right:0,jump:false,crouch:false,walk:false,fire:false,reload:false,interact:false,yaw:0,pitch:0});
export function validCommand(c) {
  if(!c||!Number.isSafeInteger(c.seq)||c.seq<0)return false;
  if(!['forward','right','yaw','pitch'].every(k=>Number.isFinite(c[k])))return false;
  if(Math.abs(c.forward)>1||Math.abs(c.right)>1||Math.abs(c.yaw)>Math.PI*16||Math.abs(c.pitch)>Math.PI/2)return false;
  return ['jump','crouch','walk','fire','reload','interact'].every(k=>typeof c[k]==='boolean');
}

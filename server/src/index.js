import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { Room } from './room.js';
import { DT, RULES, validCommand } from '../../shared/constants.js';
import { MAPS } from '../../shared/maps.js';

const rooms=new Map(),root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
const http=createServer(async(req,res)=>{
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,rooms:rooms.size}));}
  try{
    const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let path=resolve(root,'.'+url);
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);return res.end();}
    if(!extname(path))path=resolve(root,'index.html');const data=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Run npm run dev, or npm run build && npm start.');}
});
const io=new Server(http,{maxHttpBufferSize:16384});

function leave(socket){
  const code=socket.data.room,room=rooms.get(code);socket.data.room=null;if(!room)return;
  room.remove(socket.id);socket.leave(code);
  if(![...room.players.values()].some(p=>!p.bot))rooms.delete(code);
}
io.on('connection',socket=>{
  socket.data.window=performance.now();socket.data.packets=0;
  socket.on('join',(request,ack)=>{
    if(typeof ack!=='function')return;
    const now=performance.now();if(now-(socket.data.lastJoin??-10000)<1000)return ack({error:'Bir soniya kuting.'});socket.data.lastJoin=now;
    if(socket.data.room)return ack({error:'Avval xonadan chiqing.'});
    const practice=request?.practice===true;
    const code=practice?randomBytes(3).toString('hex').toUpperCase():String(request?.code??'').trim().toUpperCase();
    if(!/^[A-Z0-9]{4,8}$/.test(code))return ack({error:'Xona kodi 4–8 harf yoki raqamdan iborat bo‘lsin.'});
    if(!MAPS[request?.mapId])return ack({error:'Noma’lum xarita.'});
    let room=rooms.get(code);
    if(room&&room.phase!=='lobby')return ack({error:'Bu xonada jang boshlangan. Boshqa kod tanlang.'});
    if(room&&room.players.size>=RULES.maxPlayers)return ack({error:'Xona to‘la.'});
    if(!room&&rooms.size>=24)return ack({error:'Server band.'});
    if(!room){room=new Room(code,request.mapId,request.mode==='deathmatch'?'deathmatch':'competitive');rooms.set(code,room);}
    const name=String(request?.name??'Operator').trim().slice(0,18)||'Operator';
    const player=room.add(socket.id,name,request.team==='CT'?'CT':'T');
    if(practice){room.add('bot-1','NOVA','CT',true);room.add('bot-2','GHOST','T',true);room.add('bot-3','ATLAS','CT',true);room.start();}
    socket.data.room=code;socket.join(code);
    ack({ok:true,id:socket.id,code,team:player.team,snapshot:room.snapshot(socket.id)});
  });
  socket.on('commands',batch=>{
    const now=performance.now();if(now-socket.data.window>1000){socket.data.window=now;socket.data.packets=0;}
    if(++socket.data.packets>80||!Array.isArray(batch)||batch.length>8||!batch.every(validCommand))return;
    rooms.get(socket.data.room)?.enqueue(socket.id,batch);
  });
  socket.on('start',(_,ack)=>{
    const room=rooms.get(socket.data.room);
    if(!room||room.host!==socket.id)return typeof ack==='function'&&ack({error:'Faqat xona egasi boshlaydi.'});
    if(room.players.size<2)return typeof ack==='function'&&ack({error:'Kamida ikki o‘yinchi kerak.'});
    room.start();if(typeof ack==='function')ack({ok:true});
  });
  socket.on('buy',(item,ack)=>{
    if(typeof ack!=='function')return;
    const now=performance.now();if(now-(socket.data.lastBuy??-1000)<200)return ack({error:'Bir oz kuting.'});socket.data.lastBuy=now;
    ack(rooms.get(socket.data.room)?.buy(socket.id,item)||{error:'Xona topilmadi.'});
  });
  socket.on('leave',()=>leave(socket));socket.on('disconnect',()=>leave(socket));
});
let previous=performance.now();
const timer=setInterval(()=>{
  const now=performance.now(),elapsed=Math.min(.1,(now-previous)/1000);previous=now;
  for(const room of rooms.values()){
    room.accumulator+=elapsed;let steps=0;
    while(room.accumulator>=DT&&steps++<7){
      room.step();room.accumulator-=DT;
      if(room.tick%3===0)for(const p of room.players.values())if(!p.bot)io.to(p.id).volatile.emit('snapshot',room.snapshot(p.id));
    }
  }
},5);
const probes=setInterval(()=>{
  for(const socket of io.sockets.sockets.values()){
    const started=performance.now();socket.timeout(1500).emit('probe',(error)=>{
      if(error)return;const p=rooms.get(socket.data.room)?.players.get(socket.id);if(p)p.rtt=Math.min(400,performance.now()-started);
    });
  }
},2000);
http.listen(Number(process.env.PORT||3101),'0.0.0.0',()=>console.log('KONTIR server: http://localhost:3101'));
function close(){clearInterval(timer);clearInterval(probes);io.close();http.close();}
process.on('SIGINT',close);process.on('SIGTERM',close);

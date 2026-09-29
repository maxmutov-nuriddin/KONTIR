# Tarmoq protokoli va server authority

## Transport tanlovi

MVP: Socket.IO, bir xil origin, WebSocket upgrade. Socket.IO raw WebSocket protokoli emas; oddiy WebSocket klienti Socket.IO serveriga avtomatik mos kelmaydi.

Socket.IO xabarlar tartibini saqlaydi, ammo standart yetkazish kafolati at-most-once. `volatile` real-time state uchun eskirgan transport buferini oshirmaydi, lekin tarmoqdagi TCP head-of-line muammosini bartaraf qilmaydi. Reliable buy/start so‘rovlari ack bilan, kritik persistent economy operatsiyalari esa keyinchalik request ID va idempotency bilan ishlanadi. [Rasmiy kafolatlar](https://socket.io/docs/v4/delivery-guarantees/)

WebRTC DataChannel unreliable/unordered rejimi eski snapshot bloklanishini kamaytirishi mumkin, lekin signaling, ICE/STUN/TURN va serverga ulanish topologiyasini qo‘shadi. P2Pga o‘tish server authority’ni avtomatik ta’minlamaydi. Uni alohida transport adapteri sifatida benchmarkdan keyin ko‘rib chiqing.

## Paketlar

Hozir JavaScript object payloadlar ishlatiladi. Quyidagi TypeScript shakli kontraktni ifodalaydi; runtime validation baribir kerak:

```ts
type Team = 'T' | 'CT';
type Phase = 'lobby' | 'buy' | 'live' | 'roundEnd' | 'matchEnd';

interface UserCommand {
  seq: number;                    // monotonik, session-local
  forward: number;                // -1..1
  right: number;                  // -1..1
  yaw: number;                    // radians
  pitch: number;
  jump: boolean;
  crouch: boolean;
  walk: boolean;
  fire: boolean;
  reload: boolean;
  interact: boolean;
}

interface Character {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number;
  grounded: boolean;
  crouched: boolean;
  lastJump: boolean;
}

interface PlayerSnapshot {
  id: string;
  team: Team;
  char: Character;
  life: number;                   // respawn generation
  ack: number;                    // oxirgi processed command
  alive: boolean;
  health: number;
  armor: number;
  weapon: string;
  kills: number; deaths: number;
  // Quyidagilar faqat o‘z klientiga yuboriladi:
  ammo?: number; reserve?: number;
  money?: number; reload?: number;
}
```

| Event | Yo‘nalish | Semantika |
|---|---|---|
| `join` | C → S, ack | ism/kod/xarita/rejim; server id va snapshot qaytaradi |
| `commands` | C → S, volatile | oxirgi ≤8 command; seq orqali dedup |
| `snapshot` | S → C, volatile | tick/epoch/phase, players, ack, scores, bomb, recent events |
| `start` | C → S, ack | faqat host, kamida 2 o‘yinchi |
| `buy` | C → S, ack | server mablag‘/phase/jihozni tekshiradi |
| `probe` | S → C, ack | server RTT o‘lchovi |
| `leave` | C → S | xonadan chiqish |

Inputda `dt`, `position`, `hitTarget`, `damage`, `money` va klient tanlagan rewind vaqti yo‘q. Buy qoidalarini frontend yashirgani server validation o‘rnini bosa olmaydi.

## Server tick

`server/src/index.js` high-resolution monotonic clock va accumulator ishlatadi. Timer callback kelgan vaqtni fizik `dt` qilmaydi. Bitta accepted command bitta 1/64 qadamga teng; room tickida har o‘yinchidan ko‘pi bilan bitta command olinadi. 10 ta paket yuborgan klient server vaqtini 10 marta tezlashtira olmaydi.

Command navbati cheklangan. Takrorlangan sequence tashlanadi. Batch va raqam/boolean diapazonlari ingress’da tekshiriladi. Input kelmasa neytral input; friction/gravity davom etadi. Bu oxirgi fire yoki plant inputining cheksiz ushlanib qolishini to‘xtatadi. Uzoq CPU stall’da prototip catch-up ishini cheklaydi; production’da buni tick-overrun metrikasi, capacity admission va worker scheduling bilan bartaraf eting.

Client pending history to‘lsa yangi simulyatsiya commandlarini yaratish to‘xtaydi. Bu prototipdagi oddiy himoya; production’da 2 soniyadan katta uzilish uchun reconnect/resync UX va session token kerak.

## Client-side prediction

`client/src/prediction.js` implementatsiyasi:

1. Klient 64 Hz local tickda input oladi.
2. `seq` qo‘shadi va `pending`ga saqlaydi.
3. `shared/movement.js`ni darhol ishga tushiradi.
4. Har 2 local tickda so‘nggi 8 commandni yuboradi; redundancy bitta yo‘qolgan paketni yumshatadi.
5. Server snapshotidagi `ack`gacha bo‘lgan commandlar history’dan o‘chiriladi.
6. Player state authoritative holatga qo‘yiladi.
7. Qolgan commandlar o‘sha `1/64` qadamlar bilan qayta ishlanadi.
8. Kichik vizual xato camera offset bilan yumshatiladi; katta teleport hard snap bo‘ladi.

`epoch` raund boshlanganda, `life` respawn’da o‘zgaradi. Bunday o‘zgarishda eski history replay qilinmaydi. Jump edge state va grounded holati ham snapshotning bir qismi: faqat XYZ’ni tiklash yetmaydi.

Kamera yaw/pitch foydalanuvchi inputidan keladi. Serverning kechikkan orientatsiyasini har snapshotda lokal kameraga yozmang; bu sichqoncha boshqaruvini tortib qo‘yadi. Spawn/reset bundan mustasno.

## Interpolation va extrapolation

`client/src/network.js`: server ticklari bo‘yicha snapshot buferi. Boshlang‘ich interpolation delay 100 ms. Target tick estimated current server tickdan 6.4 tick orqada. Pozitsiya lerp, yaw esa eng qisqa angular yo‘ldan interpolatsiya qilinadi.

Bufferda keyingi holat bo‘lmasa, maksimal 50 ms velocity extrapolation; keyin freeze. Respawn yoki katta masofali teleport interpolatsiya qilinmaydi. Bu extrapolation static collision sweep qilmaydi, shuning uchun devor yaqinida qisqa vizual xato bo‘lishi mumkin. Production’da sweep yoki to‘liq freeze siyosati tanlanadi.

Hozir clock estimate snapshot kelgan vaqtdan olinadi. Katta jitterda production implementatsiya ping/pong clock offset’ining robust medianini, drift smoothing va adaptive 2–3 snapshot buferini ishlatsin. Extrapolation’ni latency yo‘qotadigan “sehrli” usul deb qarash noto‘g‘ri: u faqat qisqa ma’lumot yetishmasligini taxmin qiladi.

## Lag compensation

Server 200 ms + 2 tick character history saqlaydi. Har yozuvda position, crouch va life generation bor. Shotda taxminiy render vaqti:

```text
rewind = serverTick − clamp(RTT / 2 + interpolationDelay, 0, 200ms)
```

RTT serverning `probe` ack’i bilan o‘lchanadi. Klient istagan tarixiy vaqtni yubora olmaydi. Ikki history frame orasida position interpolatsiya qilinadi. O‘lgan yoki boshqa life generationga tegishli targetga rewind zarari o‘tmaydi. Static world hozirgi/oldingi paytda bir xil bo‘lgani uchun qayta yozilmaydi; moving door/destructible qo‘shilsa ularning historical holati ham kerak.

Prototipning cheklovi: aniq command capture time / server-tick clock alignment yo‘q, RTT simmetrik deb taxmin qilinadi, input queue yoshini shot rewind aniq aks ettirmaydi. Production’da bounded client tick mapping va server verified command age qo‘shing. Hozirgi formula CS2 sub-tick emas va yuqori jitterda piksel darajasida mos hit registration kafolatlamaydi.

## Visibility va axborot xavfsizligi

Hozir demo xona ichidagi barcha player pozitsiyalarini yuboradi. UI radar faqat jamoani ko‘rsatishi anti-wallhack hisoblanmaydi: klient olgan yashirin ma’lumotni modifikatsiyalangan frontend o‘qishi mumkin.

Production’da har recipient uchun server-side visibility set kerak:

- portal/PVS kandidatlari;
- conservative line-of-sight va audio relevance;
- jamoa ma’lumotlari alohida;
- quantized last-known state va appearance events;
- spectator ruxsatlari;
- client chunk yuklanganini target visibility uchun ishonchli dalil sifatida qabul qilmaslik.

Movement verification, input frequency caps, auth/session, per-account/IP admission, message size limits, chat/name sanitation va economy idempotency qo‘shilsin. Server authority wallhack, aimbot yoki DDoS’ni o‘zi bartaraf qilmaydi.

## Acceptance tarmoq sinovlari

1. Ikki brauzer bir roomda o‘zaro harakat/fire/round holatini ko‘radi.
2. 100 ms RTT va 20 ms jitterda lokal harakat prediction bilan darhol ko‘rinadi.
3. Takroriy command processing yo‘q; 10x input spam tezlikni oshirmaydi.
4. Fire interval, reload, buy va plant server orqali cheklanadi.
5. Disconnectda player olinadi, carried qurilma tushadi, bo‘sh xonalar o‘chadi.
6. 1–5% paket yo‘qotish va 2 soniyalik uzilishda bounded queue va tiklanish tekshiriladi.
7. Server tick time va bandwidth 10-player/room yukida o‘lchanadi; o‘lchanmagan raqam “1000 player support” deb e’lon qilinmaydi.

Oxirgi bandlarning hammasi demo smoke testida qamralmagan; release uchun majburiy qo‘shimcha sinovlar.

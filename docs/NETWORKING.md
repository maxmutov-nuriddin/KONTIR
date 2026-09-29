# Tarmoq: authority, prediction va lag compensation

## Transport
Socket.IO (WebSocket). Reliable so‘rovlar (`join`, `buy`, `start`, `maps`) ack bilan; real-time oqim `volatile`:
`commands` (klient → server) va `snapshot` (server → klient). Klient hali yuborilmagan **barcha** commandlarni (sekin kadrda bir necha tick to‘planishi mumkin) va oxirgi 4 ta takroriy commandni yuboradi (paket ≤ 32), server `seq` bo‘yicha dublikatlarni tashlaydi — shuning uchun tushib qolgan volatile paket slot/Q/sakrash kabi bir martalik kiritishlarni yo‘qotmaydi.

## Tick va snapshot
* Server: **64 Hz** fixed-step (`accumulator`), `RULES.snapshotEvery = 2` → **32 Hz** snapshot.
* Har xona alohida `Room.step()`; 5v5 + 9 bot uchun ~0.2 ms/tick (testda o‘lchanadi).
* Command navbati: har tickda 1 ta (jitter to‘planganda 2 tagacha), token-bucket (`budget ≤ 4`) tezlik hackining oldini oladi.

## Command
```
seq, forward, right, yaw, pitch, jump, crouch, walk, fire, fire2, reload, interact,
slot (0..5), quick (Q), viewTick
```
`validCommand()` barcha maydonlarni qat’iy tekshiradi (tip, diapazon, butun son).

## Prediction va reconciliation
Klient har commandni darhol bajaradi: `stepPlayer` (harakat) **va** `Inventory.step` (slot, Q, otish, reload, recoil). Snapshot kelganda:
1. authoritative `char` + `inv` `ack` bo‘yicha tiklanadi,
2. `ack`dan keyingi commandlar jim (animatsiyasiz) qayta o‘ynaladi,
3. xato `offset` orqali eksponensial silliqlanadi (>2.5 m — teleport).

Inventar taymerlari **command sanog‘i** bilan o‘lchanadi (`Inventory.time`), shuning uchun klient/server soatlari kerak emas.

## Lag compensation
* `LagCompensator`: har tick `x,y,z,yaw,crouch,alive,life` yozuvi; **1000 ms** = 64 + 2 kadr ring buffer, kadr o‘z tick’ini saqlaydi (eskirgan slot hech qachon tarix deb o‘qilmaydi).
* Klient har commandga `viewTick` qo‘yadi = render qilingan (interpolyatsiyalangan) dunyo tick’i.
* Server `viewTick`ni **o‘lchangan RTT + 100 ms interpolyatsiya + 60 ms** bilan cheklaydi va bufer chegarasiga qisadi — klient o‘zboshimchalik bilan o‘tmishga qaytolmaydi.
* Nishonlar shu vaqtga interpolyatsiya qilingan holatda tekshiriladi (`life` mos bo‘lishi shart), otuvchi esa hozirgi holatda; devor masofasi BVH raycast bilan.

## Hodisalar
Snapshot `events[]` (so‘nggi 1 s, `id` bo‘yicha dedup): `shot`, `hit`, `kill`, `footstep`, `jump`, `land`, `weaponSound`, `throw`, `bounce`, `detonate`, `flash`, `planted`, `defuseStart`, `defused`, `exploded`, `roundEnd`, … Qadam/sakrash/qurol tovushlari faqat 45 m ichidagi tinglovchiga; **Shift** (silent walk) va cho‘kish `footstep` chiqarmaydi (tezlik chegarasi 135 u/s + `walk` bayrog‘i).

## Xavfsizlik chegaralari
Server barcha natijani hisoblaydi (zarar, pul, plant/defuse, granata fizikasi). Snapshot maxfiylik: raqib inventari/puli/zirhi yuborilmaydi, biroq **barcha pozitsiyalar** yuboriladi — bu wallhackdan himoya emas (visibility filtering keyingi bosqich). Rate limit: 100 paket/s, `maxHttpBufferSize` 32 KiB, AFK 30 s.

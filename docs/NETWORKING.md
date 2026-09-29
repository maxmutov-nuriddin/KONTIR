# Tarmoq: authority, prediction va lag compensation

## Transport
Socket.IO (WebSocket). Reliable so‘rovlar (`join`, `buy`, `start`, `maps`) ack bilan; real-time oqim `volatile`:
`commands` (klient → server) va `snapshot` (server → klient). Klient tasdiqlanmagan eng eski 32 ta buyruqni ketma-ket qayta yuboradi. Faqat serverning `ack` qiymati buyruqni navbatdan chiqaradi; volatile paket yo‘qolsa slot/Q/sakrash kabi bir martalik kiritish saqlanadi. Server `seq` bo‘yicha dublikatlarni tashlaydi.

## Tick va snapshot
* Server: **64 Hz** fixed-step (`accumulator`), `RULES.snapshotEvery = 2` → **32 Hz** snapshot.
* Har xona alohida `Room.step()`; 5v5 + 9 bot uchun ~0.2 ms/tick (testda o‘lchanadi).
* Har o‘yinchi server tickida aynan bir marta simulyatsiya qilinadi. Buyruq yetishmasa uzluksiz kiritish ko‘pi bilan 8 tick (125 ms) ushlab turiladi; tugma hodisalari takrorlanmaydi. Keyin neytral kiritish bilan gravitatsiya, ishqalanish va qurol taymerlari davom etadi. Navbatdagi buyruqlar dunyo vaqtini tezlashtirmaydi.
* Insonsiz xonalarda botlar va fizika to‘xtaydi; xona 20 soniyadan so‘ng o‘chiriladi.

## Command
```
seq, forward, right, yaw, pitch, jump, crouch, walk, fire, fire2, reload, interact,
slot (0..5), quick (Q), viewTick, epoch, life
```
`validCommand()` barcha maydonlarni qat’iy tekshiradi (tip, diapazon, butun son).

## Prediction va reconciliation
Klient har commandni darhol bajaradi: `stepPlayer` (harakat) **va** `Inventory.step` (slot, Q, otish, reload, recoil). Snapshot kelganda:
1. authoritative `char` + `inv` `ack` bo‘yicha tiklanadi,
2. `ack`dan keyingi commandlar jim (animatsiyasiz) qayta o‘ynaladi,
3. xato `offset` orqali eksponensial silliqlanadi (>2.5 m — teleport).

Inventar taymerlari **64 Hz simulyatsiya qadamlari** bilan o‘lchanadi (`Inventory.time`). Serverda ular buyruq kelmagan ticklarda ham davom etadi; klient snapshot bilan qayta moslashadi. `epoch`/`life` mavjud bo‘lsa eskirgan raund yoki hayot buyruqlari rad qilinadi; joriy klient ikkala maydonni ham yuboradi.

## Lag compensation
* `LagCompensator`: har tick `x,y,z,yaw,crouch,alive,life` yozuvi; **1000 ms** = 64 + 2 kadr ring buffer, kadr o‘z tick’ini saqlaydi (eskirgan slot hech qachon tarix deb o‘qilmaydi).
* Klient har commandga `viewTick` qo‘yadi = render qilingan (interpolyatsiyalangan) dunyo tick’i.
* Server `viewTick`ni **o‘lchangan RTT + 100 ms interpolyatsiya + 60 ms** bilan cheklaydi va bufer chegarasiga qisadi — klient o‘zboshimchalik bilan o‘tmishga qaytolmaydi.
* Nishonlar shu vaqtga interpolyatsiya qilingan holatda tekshiriladi (`life` mos bo‘lishi shart), otuvchi esa hozirgi holatda; devor masofasi BVH raycast bilan.

## Hodisalar
Snapshot `events[]` (so‘nggi 1 s, `id` bo‘yicha dedup): `shot`, `hit`, `kill`, `footstep`, `jump`, `land`, `weaponSound`, `throw`, `bounce`, `detonate`, `flash`, `planted`, `defuseStart`, `defused`, `exploded`, `roundEnd`, … Qadam/sakrash/qurol tovushlari faqat 45 m ichidagi tinglovchiga; **Shift** (silent walk) va cho‘kish `footstep` chiqarmaydi (tezlik chegarasi 135 u/s + `walk` bayrog‘i).

## Xavfsizlik chegaralari
Server barcha natijani hisoblaydi (zarar, pul, plant/defuse, granata fizikasi). Snapshot maxfiylik: raqib inventari/puli/zirhi yuborilmaydi, biroq **barcha pozitsiyalar** yuboriladi — bu wallhackdan himoya emas (visibility filtering keyingi bosqich). Rate limit: 120 paket/s, `maxHttpBufferSize` 32 KiB, AFK 30 s.


Granata hodisalarida `type` hodisa nomi (`throw`, `bounce`, `detonate`), `grenadeType` esa `he`, `flash` yoki `smoke`. Ikkala ma’no bitta maydonni bosib ketmaydi. Snapshotdagi eski hodisalar bir soniyadan keyin chiqariladi; server buferi 256 hodisa bilan cheklangan.

Xona yaratish va xarita yuklash davom etayotgan Promise bilan deduplikatsiya qilinadi; xona sig‘imi disk I/O oldidan band qilinadi. Tezkor ulanishlar bir xaritadagi ochiq xonani to‘ldiradi. Ulanish davomida chiqib ketgan socket o‘yinchi sifatida qo‘shilmaydi. Mashq xonalariga tashqaridan kod orqali kirish rad qilinadi.

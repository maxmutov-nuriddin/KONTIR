# Texnik arxitektura (joriy holat)

## Modullar va mas’uliyat
| Qatlam | Modul | Izoh |
|---|---|---|
| Server | `server/server.js` | Transport, matchmaker (`Matchmaker`), xarita kutubxonasi (`MapLibrary`), 64 Hz tick, snapshot, RTT probe |
| Server | `server/Room.js` | Lobby/jamoa, MR12 mashinasi, iqtisod, otish (lag comp), pichoq, granata, bomba, botlar |
| Server | `server/LagCompensator.js` | 1000 ms ring buffer + interpolyatsiya |
| Umumiy | `shared/movement.js` | Deterministik Source harakati (BVH kapsula) |
| Umumiy | `shared/inventory.js`, `weapons.js` | Slotlar, Q tarixi, recoil jadvali, zarar/hitbox |
| Umumiy | `shared/collision.js`, `glb.js`, `maps.js` | BVH, GLB I/O, xarita ma’lumoti |
| Klient | `client/PlayerController.js` | Input, kamera, sway/bob |
| Klient | `client/WeaponManager.js` | Inventar UI holati + 3D rig + animatsiya |
| Klient | `client/WorldEngine.js` | Render, yorug‘lik, soyalar, xarita, aktyorlar |

## Harakat qiymatlari (`shared/constants.js`)
Metr = unit × 0.0254. Yugurish 250, Shift 130, cho‘kish 100 u/s; `accelerate 5.5`, `airAccelerate 12`, `maxAirSpeed 30`, `friction 4`, `stopSpeed 80`, gravitatsiya 800, sakrash 301.99 u/s (≈57 u balandlik), bunny‑cap 110 %. Ko‘z balandligi 1.65 → 1.05 m (`crouchSeconds 0.2`, kamerada smoothstep).

## Raund mashinasi
`warmup → buy(15 s) → live(115 s) → post(7 s) → buy …`; 12 raunddan keyin `swapSides()`; `roundsToWin = 13`; `matchEnd` 15 s so‘ng `warmup`. Bomba `carried → planted(40 s) → exploded | defused`. Har tomon uchun `squad` (A/B) g‘alaba hisobini tomon almashuvidan mustaqil saqlaydi.

## Test strategiyasi
`tests/movement.test.js` (fizika, GLB), `inventory.test.js` (slot/Q/recoil/zarar), `server.test.js` (5v5, MR12, buy, lag comp, bomba, granata, 5v5 bot match), `network.test.js` (haqiqiy Socket.IO), `browser-smoke.mjs` (haqiqiy brauzer).


## Resurslar va vaqt chegaralari (2026-09-29)

`client/src/frame-pacer.js` render chastotasini cheklaydi: o‘yinda 30/60/90/120 FPS, menyuda ≤30 FPS, yashirin tabda render yo‘q. Simulyatsiya DT = 1/64 s bo‘lib qoladi. YUQORI rejimida 2 × 1024 soya, ULTRA rejimida 3 × 2048 soya va postprocessing; TEZKOR rejimida CSM va makro shader o‘chirilgan.

`client/src/dispose.js` sahna geometriyasi, material va teksturalarining egaligini boshqaradi. Umumiy qurol materiallari va protsedur teksturalar belgilangan keshda qoladi; shaxsiy aktyor/granata/label resurslari, eski soyalar va postprocessing passlari chiqariladi. Audio ovozlari tugaganda ularga tegishli tugunlar uziladi.

Server har o‘yinchini har tickda bir marta yangilaydi. Plant/defuse uchun vaqt, yerda turish, tezlik, masofa, balandlik va devor to‘sig‘i tekshiriladi. Bomba portlash tickida tugallanayotgan defusedan ustun turadi. Raund tugaganidan keyin uchayotgan granatalar mavjud bo‘lib qoladi; keyin o‘lgan o‘yinchi qurolini keyingi raundga olib o‘tmaydi.

Qamrov va qolgan cheklovlar: [AUDIT.md](AUDIT.md).

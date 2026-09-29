# KONTIR — Tactical Operations

Brauzerdagi **5 vs 5 server-authoritative taktik FPS** (Three.js + Node.js + Socket.IO). Counter-Strike uslubidagi harakat, qurol inventari, MR12 raundlari, bomba obyekti, lag compensation va PBR grafika. Original loyiha; Valve xaritalari/modellari kiritilmagan.

## Ishga tushirish

Node.js 22.12+:

```sh
npm install
npm run dev          # server :3101 + klient http://localhost:5190
```

Production: `npm run build && npm start` — `http://localhost:3101` (`PORT` bilan o‘zgartiriladi, `/health` server holati).

### Rejimlar

| Tugma | Nima qiladi |
|---|---|
| **MASHQ · 5v5 BOTLAR** | Bir o‘yinchi + server botlari (10 kishi), darhol buy fazasi |
| **TEZKOR O‘YIN** | Ochiq (public) xonaga joylashtiradi yoki yangisini yaratadi |
| **XONA KODI** | Do‘st bilan bir xil kod; T/CT avtomatik tenglashadi; 5+5 qat’iy limit |

## Fayllar (asosiy 4 modul)

| Fayl | Vazifasi |
|---|---|
| [`server/server.js`](server/server.js) | HTTP + Socket.IO, matchmaker (xona/tezkor o‘yin), **64 Hz** fixed-step tick loop, RTT o‘lchash, AFK, snapshot (32 Hz) |
| [`client/PlayerController.js`](client/PlayerController.js) | Kiritish → command stream, PointerLock, kamera (crouch `crouchFactor` lerp 1.65 → 1.05 m), viewmodel **sway/bob** |
| [`client/WeaponManager.js`](client/WeaponManager.js) | 5 slotli inventar, **Q quick-switch** tarixi, draw/reload/otish animatsiyasi, recoil view-punch, 3D qurol rig’lari |
| [`client/WorldEngine.js`](client/WorldEngine.js) | GLB yuklash + **three-mesh-bvh** to‘qnashuv, ACES, CSM soyalar, sky/IBL, GTAO+bloom (ULTRA), aktyorlar, effektlar |

Ularni quvvatlovchi qatlamlar:

```
shared/        server va klient bir xil ishlatadigan deterministik kod
  movement.js    Source/GoldSrc harakati (friction, accelerate, airAccelerate, crouch, jump, step-up) — BVH kapsula
  collision.js   MeshCollider: BVH raycast, kapsula push-out, floorHeight, capsuleBlocked
  inventory.js   Slotlar, Q buffer, draw/reload/fire holat mashinasi, recoil pattern
  weapons.js     Qurol jadvali (pastda), recoil, scope, drob (pellet), hitbox, zarar modeli
  glb.js         Bog‘liqliksiz GLB o‘quvchi/yozuvchi (server ham xarita o‘qiy oladi)
server/
  Room.js        5v5 xona, MR12 raund mashinasi, iqtisod, jang, granata, bomba
  LagCompensator.js  1000 ms ring buffer + interpolyatsiya (hitbox rewind)
  Bots.js, Navigation.js   Botlar (BVH’dan olingan navigatsiya grid)
client/src/      prediction, network, ui, audio + gunsynth (DSP o‘q ovozi), materials (PBR), viewmodels + hands (qo‘l/qo‘lqop), characters (IK), effects
client/viewer.html  Qurol ko‘rgichi: /viewer.html?w=ak47&mode=fp|rig|tp&team=CT
tools/           build-maps.mjs va grid asosidagi xarita generatori
```

## Boshqaruv

| Tugma | Amal |
|---|---|
| WASD | Harakat — **250 u/s** |
| **Shift** | Jimgina yurish — **130 u/s**, qadam ovozi hodisasi umuman yo‘q |
| **Ctrl** / C | Cho‘kish — **100 u/s**, kamera **1.65 → 1.05 m** silliq |
| Space | Sakrash (yangi bosish; havoda `airAccelerate = 12`, `maxAirSpeed = 30`) |
| **1–5** | Asosiy / Pistolet / Pichoq / Granata (qayta bosilsa HE→Flash→Smoke) / C4 |
| **Q** | Oxirgi qurolga qaytish (`currentSlot` ⇄ `previousSlot`) |
| Sichqoncha g‘ildiragi | Keyingi/oldingi slot |
| LMB / RMB | Otish · pichoq sanchish / kuchsiz granata |
| R · B · E · Tab | Reload · Xarid · Defuse (ushlab) · Natijalar |

## Qoidalar (competitive MR12)

Warmup → **Buy 15 s (freeze)** → **Live 1:55** → Post-round (7 s) → … 12 raunddan keyin tomonlar almashadi, pul 800 $ ga qaytadi, **13 raund** yutgan g‘olib (12–12 durang). G‘alaba: jamoani yo‘q qilish, **C4 portlashi (40 s)**, **defuse (10 s / kit 5 s)**, vaqt (CT). Plant: C4 (5-slot) bilan A/B hududida LMB’ni 3.2 s ushlab turing. Iqtisod: g‘alaba 3250 $, mag‘lubiyat 1400 → 3400 $ (ketma-ket), qurol bo‘yicha kill mukofoti.

## Xaritalar va GLB pipeline

`client/public/maps/*.glb` — server ham, klient ham **bir xil baytlardan** to‘qnashuv BVH quradi (predikta ↔ server farq qilmaydi). Repo to‘rtta xarita bilan keladi (`npm run maps` ularni `tools/maps/*.mjs` dan qayta generatsiya qiladi):

| Xarita | Uslub | Asosiy joylar |
|---|---|---|
| **SAROB** | klassik “mirage” layouti | T spawn (sharq), top mid → mid → **sniper window** (ko‘tarilgan xona), **short** → B, **connector** → jungle → A; **palace** (tomli yuqori qavat), **A ramp / tetris**, firebox/triple/sandwich; **B apartments** (tomli koridor), market → CT |
| **CHANGTEPA** | klassik “dust” layouti | **Long A** (outside long → long doors → long corner → A ramp), **catwalk/short** (mid’dan zinapoya), **mid doors** → CT mid → **B doors/window**, **upper/lower tunnels** (tomli) → B, B platformasi, xbox |
| SAHARA OUTPOST | original | uch yo‘lak, ko‘tarilgan A |
| IRON HARBOR | original | konteyner terminali |

Balandliklar (1.2 m qavat), zinapoyalar, rampalar, tomli tunnellar, mashinalar, quduq/favvora va quti to‘plamlari bor; 1.2 m lablarga sakrab chiqish mumkin (CS’dagi kabi). Har jamoada 10 tagacha spawn nuqtasi, server har raund qaysi beshtasi ishlatilishini aralashtiradi. Bot navigatsiyasi to‘qnashuv BVH’dan olinadi (devor ichidagi nuqtalar paritet testi bilan chiqarib tashlanadi). Bu layoutlar Valve fayllaridan emas — CS xaritalarining umumiy tuzilishiga qarab xotiradan qayta yig‘ilgan, o‘lchamlari taxminiy.

**De_Dust2 / De_Mirage** kabi haqiqiy `.glb` layoutlarini ulash:

1. Faylni `client/public/maps/de_dust2.glb` deb qo‘ying (Valve aktivlari repoga qo‘shilmagan — litsenziya sizda bo‘lishi kerak).
2. GLB ichida bo‘sh (empty) node’lar: `spawn_T_1..5`, `spawn_CT_1..5`, `site_A`, `site_B` (scale.x = plant radiusi).
3. Mesh nomi `decor_*`/`nocollide_*` — to‘qnashuvsiz; `clip_*` — faqat to‘qnashuv (ko‘rinmas).
4. Siqilgan (Draco/meshopt) vizual GLB bo‘lsa, siqilmagan `de_dust2.collision.glb` qo‘shing.
5. `npm run maps` — `manifest.json` yangilanadi, xarita menyuda paydo bo‘ladi.

Batafsil: [docs/MAP_PIPELINE.md](docs/MAP_PIPELINE.md).

## Do‘kon (B)

| Guruh | T | CT | Ikkalasi |
|---|---|---|---|
| Pistol | Glock-18, Tec-9 | USP-S (glushitel), Five-SeveN | P250, Desert Eagle |
| SMG | MAC-10 | MP9 | — |
| Shotgun | — | — | Nova (9 ta drob) |
| Rifle | Galil AR, AK-47 | FAMAS, M4A4 | SSG 08, AWP (scope: o‘ng tugma) |
| Granata | Molotov | Incendiary | Decoy, Flashbang, HE, Smoke |
| Jihoz | — | Defuse kit | Kevlar, Kevlar + dubulg‘a |

Molotov/Incendiary yerga tegishi bilan 7 s yonadigan zona hosil qiladi (har 0.5 s zarar; ustiga tushgan smoke o‘chiradi). Decoy egasining qurolidan soxta otish ovozlarini chiqaradi. Snayper miltiqlarida scope bo‘lmasa aniqlik juda past, otgandan keyin scope yopiladi; zoom paytida sichqoncha sezgirligi FOV bilan moslashadi.

## Qurolni tashlash va olish

- **G** — qo‘ldagi qurolni (o‘q-dorisi bilan) yoki C4 ni oldinga uloqtiradi; pichoq va granatalar tashlanmaydi.
- **E** — nishonga olingan yerdagi qurolni oladi; o‘sha slotda qurol bo‘lsa, u almashinib yerga tushadi. Ekranda “E … olish” ko‘rsatmasi chiqadi.
- Slot bo‘sh bo‘lsa, qurol ustidan yurib o‘tish kifoya (CS qoidasi). O‘lgan o‘yinchi asosiy (yo‘q bo‘lsa — pistol) qurolini tushiradi.
- Hammasi server tomonida: fizika (sakrash, ishqalanish), olish masofasi va ko‘rinish tekshiriladi; raund boshida yerdagi qurollar tozalanadi. `tests/drops.test.js`.

## Ovoz

O‘q ovozi endi oscillator “baraban” emas: `client/src/gunsynth.js` har bir qurol uchun offline DSP bilan stereo bufer yasaydi — tovushdan tez o‘qning N-to‘lqin “chaqmog‘i”, spektri 8 kHz dan tushadigan muzzle blast, filtrlangan shovqindan past chastotali bosim zarbasi, mexanizm shiqillashi (AWP/SSG bolt, Nova pump), devorlardan qaytgan aks-sadolar va qorayib boradigan “tail”; USP-S glushitel bilan. Har qurolga 3 xil variant, birinchi o‘qda to‘xtab qolmasligi uchun kerakli buferlar oldindan pishiriladi. `tests/gunsynth.test.js` spektr/dinamika xususiyatlarini tekshiradi.

## Grafika

ACESFilmic tone mapping (`exposure = 1.0`), fizik sky + PMREM IBL, **2/3 kaskadli CSM** (PCFSoft, kaskad bo‘yicha `bias/normalBias`), protsedur PBR (albedo + normal + roughness/metalness: gips, g‘isht, beton, yog‘och, konteyner gofrasi, asfalt, gazlama…), dunyo koordinatali makro-variatsiya va devor tagidagi kir, kadr uchun statik batching (material × 28 m chunk, frustum culling), alohida viewmodel o‘tishi (o‘z FOV va yorug‘ligi). Sifat darajalari: **TEZKOR** (soyasiz), **YUQORI** (2 × 1024 px soya), **ULTRA** (GTAO + bloom, 3 × 2048 px soya).

Qo‘llar: har bir qurol uchun barmoqlari egilgan qo‘lqopli qo‘l bitta geometriyaga “pishiriladi” (1 draw call), yeng tirsak nuqtasiga yo‘naltiriladi. Uchinchi shaxs operatorlar qurolni xuddi shu qo‘l pozalari bilan ushlaydi: yelka→tirsak→bilak ikki bo‘g‘inli analitik IK bilan har kadr qo‘lga yetkaziladi; qurol modeli material bo‘yicha bitta mesh’ga birlashtirilgan (keshlangan).

Standart rejim: **YUQORI + 60 FPS**, dinamik ruxsat bilan: kadr vaqti maqsaddan 20 % oshsa ruxsat 0.6× gacha pasayadi, keyin qaytadi; shunda ham past bo‘lsa sifat bir pog‘ona tushadi. Sozlamalarda 30/60/90/120 FPS tanlanadi. Menyu va pauza ekrani ko‘pi bilan 30 FPS; yashirin tabda render to‘xtaydi, ammo serverdagi o‘yin davom etadi. 30 soniya buyruqsiz qolgan socket uziladi. FPS limiti o‘yin fizikasining 64 Hz tezligini o‘zgartirmaydi. Oldindan saqlangan sifat sozlamasi saqlanadi.

Vite endi tizimning fayl hodisalaridan foydalanadi. Zarur bo‘lgan tarmoq disklari uchun `KONTIR_POLLING=1 npm run dev` bilan polling yoqiladi.

## Tekshiruv

```sh
npm test               # movement, inventory, server qoidalari, lag comp, Socket.IO integratsiya
npm run build
# Serverni avtomatik ochib/yopadigan sinov (Chrome/Playwright kerak):
CHROME_PATH="/path/to/chrome" npm run test:browser:local
# haqiqiy brauzerda (dasturiy GL sekin, shuning uchun buy fazasini cho‘zamiz):
KONTIR_TIMING='{"freeze":45,"warmup":3}' npm start &
CHROME_PATH=/path/to/chrome npm run test:browser
```

## Hozirgi cheklovlar (halol ro‘yxat)

- Valve xaritalari/modellari/ovozlari **yo‘q**: xarita GLB’ni siz beryapsiz; ovozlar protsedur (WebAudio), qurol/operator modellari primitivlardan yasalgan.
- Zarba **hitscan**, devor penetratsiyasi yo‘q; hitbox’lar yaw bo‘yicha aylantirilgan quti (animatsiya bilan bog‘liq emas).
- Snapshot barcha o‘yinchilar holatini yuboradi (anti-wallhack/visibility filtering yo‘q), login/rating/qayta ulanish sessiyasi, region matchmaker, sharding va anti-cheat production bosqichida.
- Overtime (12–12) yo‘q — durang. Tashlab yuborilgan qurollarni olish (G) yo‘q; faqat C4 tushadi va olinadi.
- Ovoz va soyalar sifati qurilmaga bog‘liq; **60+ FPS kafolat emas** (past sifat rejimi bor).


2026-09-29 audit natijalari, xavfsizlik tuzatishlari, realizm va unumdorlik o‘zgarishlari: [docs/AUDIT.md](docs/AUDIT.md).

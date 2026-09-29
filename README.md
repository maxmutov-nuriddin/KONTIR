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
  weapons.js     AK-47, M4A4, Desert Eagle, Glock-18, Knife, HE/Flash/Smoke, C4; hitbox, zarar modeli
  glb.js         Bog‘liqliksiz GLB o‘quvchi/yozuvchi (server ham xarita o‘qiy oladi)
server/
  Room.js        5v5 xona, MR12 raund mashinasi, iqtisod, jang, granata, bomba
  LagCompensator.js  1000 ms ring buffer + interpolyatsiya (hitbox rewind)
  Bots.js, Navigation.js   Botlar (BVH’dan olingan navigatsiya grid)
client/src/      prediction, network, ui, audio (protsedur), materials (PBR), viewmodels, characters, effects
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

`client/public/maps/*.glb` — server ham, klient ham **bir xil baytlardan** to‘qnashuv BVH quradi (predikta ↔ server farq qilmaydi). Repo ikkita original xaritani olib keladi (`sahara`, `harbor`; `npm run maps` ularni `tools/maps/*.mjs` dan qayta generatsiya qiladi).

**De_Dust2 / De_Mirage** kabi haqiqiy `.glb` layoutlarini ulash:

1. Faylni `client/public/maps/de_dust2.glb` deb qo‘ying (Valve aktivlari repoga qo‘shilmagan — litsenziya sizda bo‘lishi kerak).
2. GLB ichida bo‘sh (empty) node’lar: `spawn_T_1..5`, `spawn_CT_1..5`, `site_A`, `site_B` (scale.x = plant radiusi).
3. Mesh nomi `decor_*`/`nocollide_*` — to‘qnashuvsiz; `clip_*` — faqat to‘qnashuv (ko‘rinmas).
4. Siqilgan (Draco/meshopt) vizual GLB bo‘lsa, siqilmagan `de_dust2.collision.glb` qo‘shing.
5. `npm run maps` — `manifest.json` yangilanadi, xarita menyuda paydo bo‘ladi.

Batafsil: [docs/MAP_PIPELINE.md](docs/MAP_PIPELINE.md).

## Grafika

ACESFilmic tone mapping (`exposure = 1.0`), fizik sky + PMREM IBL, **3 kaskadli CSM** (PCFSoft, kaskad bo‘yicha `bias/normalBias`), protsedur PBR (albedo + normal + roughness/metalness: gips, g‘isht, beton, yog‘och, konteyner gofrasi, asfalt, gazlama…), dunyo koordinatali makro-variatsiya va devor tagidagi kir, kadr uchun statik batching (material × 28 m chunk, frustum culling), alohida viewmodel o‘tishi (o‘z FOV va yorug‘ligi). Sifat darajalari: **TEZKOR** (soyasiz), **YUQORI**, **ULTRA** (GTAO + bloom, 4096 soya).

## Tekshiruv

```sh
npm test               # movement, inventory, server qoidalari, lag comp, Socket.IO integratsiya
npm run build
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

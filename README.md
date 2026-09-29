# KONTIR — Tactical Operations

Brauzerdagi original jamoaviy FPS prototipi va uni katta loyihaga aylantirish uchun texnik topshiriq. **POYGA**dan mustaqil loyiha.

## Ishga tushirish

Node.js 22.12+ yoki Node.js 24:

```sh
cd KONTIR
npm install
npm run dev
```

**http://localhost:5190** — klient. **3101** — Node.js o‘yin serveri. Vite Socket.IO’ni bir origin orqali proksi qiladi. Serverdagi fayllarni o‘zgartirsangiz, `npm run dev`ni qayta ishga tushiring. Klient hot reload orqali yangilanadi.

### Tezkor boshlash

1. Sahara Outpost yoki Iron Harbor xaritasini tanlang.
2. Competitive yoki Deathmatch rejimini tanlang.
3. **MASHQNI BOSHLASH**: serverdagi uch bot bilan o‘yin.
4. **JANGGA KIRISH** tugmasi sichqonchani Pointer Lock orqali ushlaydi.
5. Buy vaqtida **B** orqali jihoz tanlang. Oyna yopilgach **JANGGA KIRISH**ni yana bosing.

Mashq rejimi ham authoritative Node serveridan foydalanadi. O‘yin klaviatura va sichqoncha uchun mo‘ljallangan; mobil layout mavjud, mobil sensorli FPS boshqaruvi hali yo‘q.

### Do‘st bilan onlayn

**ONLAYN**ni bosing, ism va bir xil xona kodini kiriting. Birinchi o‘yinchi host bo‘ladi. Ikkinchi o‘yinchi kirgach host boshlaydi. 10 o‘yinchigacha; T/CT avtomatik tenglashtiriladi. Yangi xonaning xarita/rejimini birinchi o‘yinchi tanlaydi. Raund boshlangan xonaga yangi o‘yinchi qabul qilinmaydi.

Bir LAN/Wi-Fi ichida Vite ko‘rsatgan `http://192.168.x.x:5190` manzilidan foydalaning. Internet orqali o‘yin uchun Node serverini HTTPS/WebSocket reverse proxy ortida joylashtirish kerak. Lokal server boshqa serverga avtomatik ulanmaydi.

### Boshqaruv

| Tugma | Amal |
|---|---|
| WASD / strelkalar | Harakat |
| Sichqoncha | Kamera va nishon |
| Chap tugma | O‘q uzish |
| Space | Sakrash; qayta sakrash uchun yangi bosish kerak |
| Shift | Sekin yurish |
| Ctrl | Cho‘kish |
| R | Qayta o‘qlash |
| B | Buy menyusi |
| E, ushlab turing | A/B ichida plant yoki qurilma yonida defuse |
| Tab | Natijalar jadvali |
| Esc | Pointer Lock’dan chiqish; serverdagi o‘yin davom etadi |

## Hozir ishlaydigan qismlar

- Three.js WebGL2 sahna, procedural qurol va operator modellari, real-time soya.
- 160 × 160 metrli 2 original xarita; zinapoya bilan chiqiladigan platformalar.
- 32 m vizual chunklar, kerakli chunklarni yaratish/bo‘shatish, frustum culling va instancing.
- Bir xil shared harakat kodi: inersiya, friction, ground/air acceleration, strafe, jump, crouch, static collision.
- 64 Hz server, taxminan 21 Hz snapshot, client prediction va ack bo‘yicha reconciliation.
- Remote interpolation, 50 ms bilan cheklangan extrapolation.
- Server RTT o‘lchoviga asoslangan 200 ms gacha hitbox rewind.
- 3 qurol, tarqalish/recoil, ammo, fire-rate, reload, head/chest/legs zarari va zirh.
- T/CT, raundlar, buy, server taymerli plant/defuse, jamoa ballari.
- Competitive: 7 g‘alabagacha; Deathmatch: 3 daqiqa, 3 soniyali respawn.
- Botlar uchun serverdagi grid navigation, ko‘rinish chizig‘i va oddiy jang logikasi.
- GSAP menyu, buy animatsiyasi, killfeed, radar va scoreboard.

## Muhim chegaralar

Bu **CS2/CS:GO’ning 100% nusxasi yoki tayyor masshtabli esports platformasi emas**. Harakat qiymatlari original, hitboxlar AABB, character collider soddalashtirilgan. Player-player collision, qurol almashtirish/inventar, granatalar, penetratsiya, haqiqiy audio aktivlar, CS2 sub-tick va professional anti-cheat hali yo‘q.

Asosiy qurollar **hitscan**: zarar server tickida hisoblanadi, tracer esa vizual effekt. Ballistik parvoz vaqti bu prototipda yo‘q. Motion blur va bloom raqobatbardosh o‘yinda aniqlik/FPS uchun default o‘chiq; post-processing yo‘li texnik qo‘llanmada berilgan.

Klient barcha statik collider metadata’larini oladi, faqat vizual chunklar dinamik boshqariladi. Hozirgi xaritalar diskdan GLB stream qilinmaydi: ular metadata’dan yaratiladi. `client/src/world/glb-streamer.js` GLB aktivlari uchun ulashga tayyor adapter, ammo demo yo‘lida ishlatilmaydi. Portal/PVS occlusion culling hali yo‘q; frustum culling uni almashtirmaydi.

Hozir server xona ichidagi barcha o‘yinchilar holatini yuboradi. Bu visibility filtering/anti-wallhack emas. Login, saqlangan reyting, qayta ulanishda sessiyani tiklash, hududlararo matchmaker va process sharding production bosqichiga qoldirilgan.

**60+ FPS kafolat emas.** Qurilma, resolution va sahnaga bog‘liq; past sifat rejimi, draw-call/FPS diagnostikasi mavjud. Nom va xarita aktivlari original; Valve’ning xaritalari/modellari qo‘shilmagan.

## Hujjatlar

- **[TECHNICAL_SPEC.md](docs/TECHNICAL_SPEC.md)** — bajariladigan texnik topshiriq, arxitektura, mezonlar va bosqichlar.
- **[NETWORKING.md](docs/NETWORKING.md)** — protokol, prediction, lag compensation, transport va xavfsizlik chegaralari.
- **[MAP_PIPELINE.md](docs/MAP_PIPELINE.md)** — Blender → GLB, chunk streaming, occlusion va xotira budjeti.

## Tekshiruv

```sh
npm test
npm run build
```

Dev server ishlab turganda, o‘rnatilgan Google Chrome bilan:

```sh
npm run test:browser
```

Brauzer tekshiruvi skrinshotlarni `test-results/`ga yozadi. Chromium uchun `npx playwright install chromium`, keyin `BROWSER_CHANNEL=chromium npm run test:browser` ishlatish mumkin.

## Production

```sh
npm run build
npm start
```

Node `dist/`ni va Socket.IO’ni **http://localhost:3101** orqali beradi. `PORT` bilan portni o‘zgartirish mumkin. `/health` server holati uchun. Xonalar RAM’da saqlanadi; server to‘xtasa holat yo‘qoladi. Production’da TLS, cheklangan originlar, autentifikatsiya, resurs kvotalari va monitoringni texnik topshiriq bo‘yicha qo‘shing.

# KONTIR — Tactical Operations

Brauzerdagi **5 vs 5 server-authoritative taktik FPS** (Three.js + Node.js + Socket.IO). Counter-Strike uslubidagi harakat, qurol inventari, MR12 raundlari, bomba obyekti, lag compensation va PBR grafika. Original loyiha; Valve xaritalari/modellari kiritilmagan.

## Ishga tushirish

Node.js 22.12+:

```sh
npm install
npm start            # o‘yinni yig‘adi va http://localhost:3101 da ishga tushiradi
```

`npm start` har safar yangi build tayyorlaydi; o‘yin vaqtida fayl o‘zgarishlari sahifani avtomatik yangilamaydi. `PORT` bilan portni o‘zgartirish mumkin, `/health` server holatini ko‘rsatadi.

Kod ustida ishlash uchun: `npm run dev` — server `:3101`, Vite klienti `http://localhost:5190` (kod o‘zgarsa avtomatik yangilanadi).

macOS’da loyihani `~/Projects/KONTIR` kabi mahalliy papkada saqlang. iCloud sinxronlaydigan Desktop/Documents papkalarida fayllar diskdan bo‘shatilsa, Node ularni o‘qishni kutib, `predev` bosqichida to‘xtab qolishi mumkin.

Oxirgi tirik o‘yinchi, kuzatuv kamerasi va ketma-ket raundlar tekshiruvi: `npm run build && npm run test:browser:rounds`. Playwright brauzeri o‘rnatilmagan bo‘lsa, kompyuterdagi Chrome bilan `BROWSER_CHANNEL=chrome npm run test:browser:rounds` ishlaydi.

### Lobbi va rejimlar (CS2 uslubida)

Bosh menyu — CS2 lobbisi kabi: yuqorida rejim yorliqlari, o‘rtada xaritalar (har biri ustdan ko‘rinish sxemasi bilan), o‘ngda partiya paneli va katta **IZLASH** tugmasi.

| Rejim | Nima qiladi |
|---|---|
| **COMPETITIVE** | Matchmaking: xaritalar puli (bir nechtasini belgilash mumkin) → qidiruv taymeri → **“O‘YININGIZ TAYYOR!”** → 20 s ichida **QABUL QILISH**. 10 kishi to‘lsa darhol; kamida 2 kishi bo‘lsa 45 s dan keyin; yolg‘iz qidiruvchi 90 s dan keyin — bo‘sh o‘rinlarga botlar. Tomonlar tasodifiy, lekin teng. |
| **CASUAL** | Xuddi shu, lekin tezroq (12 s / 20 s) |
| **MASHQ** | Siz + 9 bot, darhol |
| **XUSUSIY XONA** | Do‘stlar bilan bir xil kod (5+5 qat’iy) |

Kimdir qabul qilmasa u navbatdan chiqariladi, qolganlar navbatdagi o‘rnini yo‘qotmasdan qidirishda davom etadi. Hammasi serverda (`server/Queue.js`, testlar: `tests/queue.test.js`).

### Internetdagi haqiqiy o‘yinchilar bilan o‘ynash

Matchmaking bir serverga ulangan hamma o‘yinchilarni birlashtiradi. Notanish o‘yinchilar bilan o‘ynash uchun serverni internetga chiqarish kerak (bu repodan tashqarida — hosting sizniki):

```sh
npm ci && npm run maps && npm run build
PORT=3101 npm start          # Node 20+; WebSocket ochiq bo‘lishi kerak
```

Istalgan Node hostingi (VPS, Render, Fly.io, Railway…) ishlaydi; domen HTTPS bilan bo‘lsa Socket.IO avtomatik `wss://` ishlatadi. `/health` — navbatdagi va o‘ynayotganlar soni. Server bitta jarayonda 24 tagacha xonani 64 tick’da yuritadi.

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
| WASD | Harakat — yuksiz **250 u/s** (6,35 m/s), qurol og‘irligi bilan kamayadi (pastga qarang); orqaga 72 %, yonga 90 % |
| **Shift** | Jimgina yurish — **130 u/s**, qadam ovozi hodisasi umuman yo‘q |
| **Ctrl** / C | Cho‘kib yurish — **85 u/s**, kamera **1.65 → 1.05 m** silliq |
| Space | Sakrash — real **~0,55 m** (gravitatsiya 9,81 m/s²); havoda yo‘nalishni deyarli o‘zgartirib bo‘lmaydi |
| **1–5** | Asosiy / Pistolet / Pichoq / Granata (qayta bosilsa HE→Flash→Smoke) / C4 |
| **Q** | Oxirgi qurolga qaytish (`currentSlot` ⇄ `previousSlot`) |
| Sichqoncha g‘ildiragi | Keyingi/oldingi slot |
| LMB / RMB | Otish · pichoq sanchish / kuchsiz granata |
| R · B · E · Tab | Reload · Xarid · Defuse (ushlab) / qurol olish · Natijalar |
| **G** · **F** | Qurolni tashlash · Qurol ko‘rigi (inspect) |
| **Y** / **U** | Umumiy chat / jamoa chati |
| **Z** (+1–9) | Radio buyruqlari menyusi |
| **X** / o‘rta tugma | Ping — nishon joyiga jamoaga belgi |

### Realistik harakat va qurol og‘irligi

Har bir qurolning haqiqiy og‘irligi bor (`shared/weapons.js` → `MASS`, kg, o‘qli magazin bilan): Glock 0,9 · USP 1,0 · Deagle 2,0 · MP9 1,4 · P90 2,9 · M4A4 3,4 · AK-47 4,3 · AWP 6,9 · Negev 7,6 · C4 2,5. Tezlik koeffitsienti `loadSpeedMul(inventory)` = `1 − 0,034 × qo‘ldagi kg − 0,008 × orqadagi yuk (boshqa qurollar, granatalar, C4)`; scope bilan nishonga olinganda × 0,62. Natija: pichoq ~248, Glock ~242, M4 ~221, AK ~213, AWP ~191 u/s (xarid menyusida har qurol uchun kg va u/s ko‘rsatiladi).

- **Tezlanish** ham yukka bog‘liq: og‘ir qurol bilan tezlikni sekinroq olasiz.
- **Sakrash:** og‘ir yuk bilan pastroq (Negev ~ −8 %); ketma-ket sakrash charchatadi (keyingisi pastroq), yerda ~0,7 s dam olinsa tiklanadi. Sakrash tezlik qo‘shmaydi, qo‘nish esa tezlikning bir qismini oladi — bunny-hop va air-strafe yo‘q.
- **Ledge’lar (1,2 m)** ga endi sakrab chiqib bo‘lmaydi — zinapoya / rampadan chiqiladi.
- **Tushish shikasti:** ~3,7 m gacha zararsiz, 6 m ≈ 40 HP, ~10 m o‘ldiradi.
- **Granatalar** real gravitatsiyada, uloqtirish tezligi ~14 m/s (masofa avvalgidek).
- **Viewmodel:** og‘ir qurol sichqonchaga kechroq ergashadi, sekinroq qaytadi va yurganda ko‘proq tebranadi.

## Qoidalar (competitive MR12)

Warmup → **Buy 15 s (freeze)** → **Live 1:55** → Post-round (7 s) → … 12 raunddan keyin tomonlar almashadi, pul 800 $ ga qaytadi, **13 raund** yutgan g‘olib (12–12 bo‘lsa **overtime MR3**: 12 500 $ bilan, 4 raund yutgan g‘olib; yana teng bo‘lsa keyingi overtime). G‘alaba: jamoani yo‘q qilish, **C4 portlashi (40 s)**, **defuse (10 s / kit 5 s)**, vaqt (CT). Plant: C4 (5-slot) bilan A/B hududida LMB’ni 3.2 s ushlab turing. Iqtisod: g‘alaba 3250 $, mag‘lubiyat 1400 → 3400 $ (ketma-ket), qurol bo‘yicha kill mukofoti.

Har raund oxirida **MVP**, natijalar jadvalida **K/A/D, ADR, HS%, ★ MVP**. O‘q qurolga qarab devor/qutidan **o‘tadi** (penetratsiya chuqurligi va zarar kamayishi `shared/weapons.js` da). Server **anti-wallhack**: dushman ko‘rinmasa uning koordinatalari va quroli snapshot’ga umuman yuborilmaydi (bosh/yon “peek” nurlari va 26 tick kechikish bilan). Jamoa chat/radio/ping faqat o‘z jamoasiga yetadi.

### Akkaunt yoki demo

Birinchi ochilishda uchta tanlov: **KIRISH**, **RO‘YXATDAN O‘TISH** yoki **DEMO BILAN O‘YNASH** (yuqoridagi tugma orqali keyin ham).

- **Akkaunt** — faqat foydalanuvchi nomi (3–16 lotin harf/raqam/_, takrorlanmaydi) va parol (6+ belgi), e-mail kerak emas. XP, reyting, tangalar, sotib olingan skinlar va loadout **serverda** saqlanadi (`data/accounts.json`, `KONTIR_DATA` bilan o‘zgartiriladi). Parollar scrypt bilan xeshlanadi, sessiya tokeni 30 kun. Match mukofotini server o‘zi hisoblaydi — mijoz tangani o‘zgartira olmaydi.
- **Demo** — avtomatik ism; progress faqat shu brauzer sessiyasida, yopilganda yo‘qoladi. Demoda **skin sotib olib bo‘lmaydi**.

Til: yuqori paneldagi **UZ / RU / EN** tanlovi (brauzerda eslab qolinadi).

### Do‘stlar, yozishma, ovozli qo‘ng‘iroq

Chap paneldagi **👥** — do‘stlar oynasi (akkaunt kerak): foydalanuvchi nomi bo‘yicha qidirish, **QO‘SHISH** (so‘rov), **QABUL / RAD**, holat (lobbida / o‘yin qidirmoqda / o‘yinda / oflayn), shaxsiy xabarlar (oxirgi 50 tasi serverda saqlanadi) va **🎙 ovozli qo‘ng‘iroq**. Ovoz WebRTC orqali to‘g‘ridan-to‘g‘ri (P2P) boradi, server faqat ulanish signalini uzatadi; lobbida mikrofon ochiq (MIC tugmasi bilan o‘chiriladi), o‘yin ichida **V** ni ushlab gapiriladi. Ba’zi qat’iy NAT/korporativ tarmoqlarda TURN server bo‘lmasa ulanmasligi mumkin.

### Sozlamalar

⚙ → **UMUMIY** (grafika, FPS, ovoz), **SICHQONCHA** (sezgirlik, scope sezgirligi, Y teskari, raw input, g‘ildirak bilan qurol almashtirish, cho‘kishni bosib yoqish), **KLAVIATURA** — har bir amal uchun 2 ta tugma: katakni bosing → istalgan tugma yoki sichqoncha tugmasini bosing (Esc — bekor, Backspace — tozalash, “Standart holatga qaytarish”).

Keyingi bosqich uchun tavsiyalar ro‘yxati: [docs/ROADMAP.md](docs/ROADMAP.md).

### Haqiqiy 3D modellar

`client/public/models/{weapons,characters,props}` ga `.glb` qo‘ying → `npm run models` → o‘yin ularni avtomatik ishlatadi (yo‘q bo‘lsa protsedur modellar). Talablar va bepul manbalar: [docs/MODELS.md](docs/MODELS.md).

## Xaritalar va GLB pipeline

`client/public/maps/*.glb` — server ham, klient ham **bir xil baytlardan** to‘qnashuv BVH quradi (predikta ↔ server farq qilmaydi). Repo oltita xarita bilan keladi (`npm run maps` ularni `tools/maps/*.mjs` dan qayta generatsiya qiladi):

| Xarita | Uslub | Asosiy joylar |
|---|---|---|
| **SAROB** | klassik “mirage” layouti | T spawn (sharq), top mid → mid → **sniper window** (ko‘tarilgan xona), **short** → B, **connector** → jungle → A; **palace** (tomli yuqori qavat), **A ramp / tetris**, firebox/triple/sandwich; **B apartments** (tomli koridor), market → CT |
| **CHANGTEPA** | klassik “dust” layouti | **Long A** (outside long → long doors → long corner → A ramp), **catwalk/short** (mid’dan zinapoya), **mid doors** → CT mid → **B doors/window**, **upper/lower tunnels** (tomli) → B, B platformasi, xbox |
| **QISHLOQ** | klassik “inferno” layouti | **banana** (mashina, qopchalar) → B (favvora, coffins, new box), **apartments** (tomli) → **balcony** → A, **pit**, **library**, **arch**, mid / second mid, short |
| **OMBOR** | klassik “cache” layouti | **A main** → A (quad, konteynerlar), **mid** (white box) → **highway** → A, **vents** → B, **B main**, **checkers**, **heaven**, **sun room** |
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
| Pistol | Glock-18, Tec-9 | USP-S (glushitel), Five-SeveN | P250, CZ75-Auto, Desert Eagle, R8 Revolver |
| SMG | MAC-10 | MP9 | UMP-45, MP7, P90 |
| Og‘ir | Sawed-Off | MAG-7 | Nova, XM1014, Negev |
| Rifle | Galil AR, AK-47, SG 553 (scope) | FAMAS, M4A4, M4A1-S (glushitel), AUG (scope) | SSG 08, AWP (scope: o‘ng tugma) |
| Granata | Molotov | Incendiary | Decoy, Flashbang, HE, Smoke |
| Jihoz | — | Defuse kit | Kevlar, Kevlar + dubulg‘a |

Molotov/Incendiary yerga tegishi bilan 7 s yonadigan zona hosil qiladi (har 0.5 s zarar; ustiga tushgan smoke o‘chiradi). Decoy egasining qurolidan soxta otish ovozlarini chiqaradi. Snayper miltiqlarida scope bo‘lmasa aniqlik juda past, otgandan keyin scope yopiladi; zoom paytida sichqoncha sezgirligi FOV bilan moslashadi.

## Reload (R)

Har reload uslubi alohida animatsiya: **miltiq/SMG** — qurol yonboshlaydi, chap qo‘l magazinni ushlab chiqarib oladi (magazin qo‘l bilan birga ekrandan chiqadi), yangisini olib kelib kiritadi, bo‘sh bo‘lsa zatvorni tortadi; **pistol** — eski magazin tushib ketadi, yangisi dastaga uriladi, bo‘sh bo‘lsa slayd qo‘yib yuboriladi; **snayper** — magazin + zatvor sikli; **drobovik** — o‘q-o‘qdan (qo‘lda qizil patron ko‘rinadi), oxirida pump; **revolver** — baraban. Ovozlar (magazin chiqishi/kirishi, zatvor, slayd, patron, pump) animatsiyaning aniq nuqtalarida chalinadi; boshqa o‘yinchilarning reloadi ham xuddi shu jadval bo‘yicha eshitiladi (`client/src/reload.js`).

## Qurol ko‘rigi (F)

**F** — CS uslubidagi inspect: qurol chap yonini, keyin o‘ng yonini ko‘rsatib qaytadi (pichoq aylanadi). Otish, reload, qurol almashtirish ko‘rikni to‘xtatadi. Qurol materiallari: metall — MeshPhysical (yupqa moy qatlami / bluing yaltirog‘i), yog‘och — laklangan yong‘oq tolasi, polimer — mat, mayda donador; viewmodel uchun alohida rim-light.

## Qurolni tashlash va olish

- **G** — qo‘ldagi qurolni (o‘q-dorisi bilan) yoki C4 ni oldinga uloqtiradi; pichoq va granatalar tashlanmaydi.
- **E** — nishonga olingan yerdagi qurolni oladi; o‘sha slotda qurol bo‘lsa, u almashinib yerga tushadi. Ekranda “E … olish” ko‘rsatmasi chiqadi.
- Slot bo‘sh bo‘lsa, qurol ustidan yurib o‘tish kifoya (CS qoidasi). O‘lgan o‘yinchi asosiy (yo‘q bo‘lsa — pistol) qurolini tushiradi.
- Hammasi server tomonida: fizika (sakrash, ishqalanish), olish masofasi va ko‘rinish tekshiriladi; raund boshida yerdagi qurollar tozalanadi. `tests/drops.test.js`.

## Ovoz

O‘q ovozi endi oscillator “baraban” emas: `client/src/gunsynth.js` har bir qurol uchun offline DSP bilan stereo bufer yasaydi — tovushdan tez o‘qning N-to‘lqin “chaqmog‘i”, spektri 8 kHz dan tushadigan muzzle blast, filtrlangan shovqindan past chastotali bosim zarbasi, mexanizm shiqillashi (AWP/SSG bolt, Nova pump), devorlardan qaytgan aks-sadolar va qorayib boradigan “tail”; USP-S glushitel bilan. Har qurolga 3 xil variant, birinchi o‘qda to‘xtab qolmasligi uchun kerakli buferlar oldindan pishiriladi. `tests/gunsynth.test.js` spektr/dinamika xususiyatlarini tekshiradi.

## Grafika

ACESFilmic tone mapping (`exposure = 1.0`), fizik sky + PMREM IBL, **2/3 kaskadli CSM** (PCFSoft, kaskad bo‘yicha `bias/normalBias`), protsedur PBR (albedo + normal + roughness/metalness: gips, g‘isht, beton, yog‘och, konteyner gofrasi, asfalt, gazlama…), dunyo koordinatali makro-variatsiya va devor tagidagi kir, kadr uchun statik batching (material × 28 m chunk, frustum culling), alohida viewmodel o‘tishi (o‘z FOV va yorug‘ligi). Sifat darajalari: **TEZKOR** (sahna 75 % ruxsatda + FXAA + RCAS keskinlashtirish, soyasiz), **O‘RTA** (to‘liq ruxsat, soyasiz, to‘g‘ridan-to‘g‘ri canvasga — eng yuqori FPS), **TINIQ** (eski PC uchun tavsiya: to‘liq ruxsat, 4x MSAA, RCAS, 1 × 1024 px soya har 2-kadrda), **YUQORI** (2 × 1024 px soya, 4x MSAA), **ULTRA** (GTAO + bloom, 3 × 2048 px soya).

TEZKOR / TINIQ / YUQORI [`client/src/upscaler.js`](client/src/upscaler.js) orqali chiziladi: sahna va viewmodel bitta HalfFloat render-target’ga (kerak bo‘lsa MSAA bilan), so‘ng bitta to‘liq ekran o‘tishida bilinear kattalashtirish + FSR 1 RCAS keskinlashtirish + ACES + sRGB. Dinamik ruxsat faqat shu ichki target’ni kichraytiradi (canvas doim to‘liq ruxsatda), shuning uchun FPS tushganda ham tasvir xiralashmaydi. Canvas MSAA kontekst yaratilganda qotib qoladi — endi AA render-target’da, sifat almashtirilganda darhol ishlaydi. Float render-target qo‘llanmaydigan GPU’da avtomatik to‘g‘ridan-to‘g‘ri renderga qaytiladi.

Operatorlar ([`client/src/characters.js`](client/src/characters.js)): protsedur CS2 uslubidagi taktik operator — plate carrier / chest rig, modul cho‘ntaklar, radio va antenna, FAST shlem + quloqchinlar (CT), balaklava + ko‘zoynak (T), tizzaliklar, botinkalar. Barcha qismlar bitta qattiq skinned mesh’ga yig‘ilgan (operator = 1 draw call), 2 bosqichli LOD (≈9k / ≈1.5k uchburchak), jamoa uchun bitta PBR material: ripstop mato teksturasi, shader’dagi kamuflyaj, har-cho‘qqi roughness / metalness. T — iliq cho‘l ranglari, CT — sovuq ko‘kimtir-kulrang: uzoqdan ham farqlanadi.

Qo‘llar: har bir qurol uchun barmoqlari egilgan qo‘lqopli qo‘l bitta geometriyaga “pishiriladi” (1 draw call), yeng tirsak nuqtasiga yo‘naltiriladi. Uchinchi shaxs operatorlar qurolni xuddi shu qo‘l pozalari bilan ushlaydi: yelka→tirsak→bilak ikki bo‘g‘inli analitik IK bilan har kadr qo‘lga yetkaziladi; qurol modeli material bo‘yicha bitta mesh’ga birlashtirilgan (keshlangan).

Standart rejim: **O‘RTA**, FPS limitsiz (MAX). Dinamik ruxsat: kadr vaqti maqsaddan 20 % oshsa ichki ruxsat pasayadi (TEZKOR/TINIQ/YUQORI’da 60 % gacha, RCAS bilan tiniq; O‘RTA’da 75 %), keyin qaytadi; shunda ham FPS < 28 bo‘lsa sifat bir pog‘ona tushadi (ULTRA → YUQORI → TINIQ → O‘RTA → TEZKOR). Maqsad: tanlangan FPS limiti, MAX’da esa 60 FPS. Sozlamalarda 60/120/144/MAX tanlanadi. Menyu va pauza ekrani ko‘pi bilan 60 FPS; yashirin tabda render to‘xtaydi, ammo serverdagi o‘yin davom etadi. 30 soniya buyruqsiz qolgan socket uziladi. FPS limiti o‘yin fizikasining 64 Hz tezligini o‘zgartirmaydi. Oldindan saqlangan sifat sozlamasi saqlanadi.

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

- Valve xaritalari/modellari/ovozlari **yo‘q**: xarita GLB’ni siz beryapsiz; ovozlar protsedur (WebAudio), qurol/operator modellari protsedur (haqiqiy GLB qo‘yilsa ular ishlatiladi).
- Zarba **hitscan** (penetratsiya bor); hitbox’lar yaw bo‘yicha aylantirilgan quti (animatsiya bilan bog‘liq emas).
- Login/serverdagi akkaunt (hozir demo profil lokal), qayta ulanish sessiyasi, region matchmaker, sharding va to‘liq anti-cheat production bosqichida.
- Ovoz va soyalar sifati qurilmaga bog‘liq; **60+ FPS kafolat emas** (past sifat rejimi bor).


2026-09-29 audit natijalari, xavfsizlik tuzatishlari, realizm va unumdorlik o‘zgarishlari: [docs/AUDIT.md](docs/AUDIT.md).

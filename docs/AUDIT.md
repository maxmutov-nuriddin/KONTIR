# KONTIR audit va optimizatsiya — 2026-09-29

Audit ish papkasidagi haqiqiy KONTIR kodi, ikkala GLB xarita, Node serveri, Socket.IO protokoli va Three.js klienti ustida bajarildi. Tuzatishlar bevosita manba fayllariga kiritilgan; quyidagi hujjat diagnostika va o‘zgarish sabablarini tushuntiradi. `package-lock.json` dagi auditdan oldingi foydalanuvchi o‘zgarishi saqlandi.

## Executive diagnostic

- **Yuqori xavf — fayl o‘qish:** `/maps/` yo‘li URL-dekodlangandan keyin public katalog chegarasini tekshirmagan. Kodlangan `../` bilan katalogdan chiqish mumkin edi. Endi oddiy va symlink orqali aniqlangan haqiqiy yo‘l ham tekshiriladi; noto‘g‘ri URL 400 bilan rad qilinadi.
- **Yuqori xavf — parallel ulanish:** xona sig‘imi disk o‘qishidan oldin band qilinmagan, bir kodli parallel so‘rovlar bir-birining xonasini almashtirishi mumkin edi. Xona/xarita yuklash Promise keshi va oldindan sig‘im band qilish qo‘shildi. Tezkor o‘yinlar ham bir xaritadagi xonalarni birga to‘ldiradi.
- **Yuqori ta’sir — vaqtga bog‘langan fizika:** buyruqsiz o‘yinchi gravitatsiya, friction va reloadni bajarmagan; navbatga qarab bir tickda ikki marta simulyatsiya qilinishi mumkin edi. Endi server har o‘yinchini tickda aynan bir marta yangilaydi.
- **Iqtisodiy xato:** inventar to‘lganidan keyingi granata xaridi muvaffaqiyatli deb hisoblanib, pul yechilgan. Endi inventar haqiqatan oshgan bo‘lsagina pul yechiladi; prototipdan meros qolgan jihoz nomlari ham rad qilinadi.
- **Jang va obyekt mantiqi:** granata turi hodisa `type` maydonida yo‘qolgan, HE o‘ldirishi `killed: false` bergan, ayrim pichoq nurlari devorni noto‘g‘ri tekshirgan, defuse devor ortidan va o‘t ochish bilan bir vaqtda bajarilishi mumkin bo‘lgan.
- **CPU/GPU yuki:** FPS cheklanmagan, menyu to‘liq tezlikda render qilingan, LOW rejimi ham CSM yaratgan, katta soya/teksturalar va takroriy bot pathfinding ortiqcha ish bajargan. Grafika rejimlari, FPS cheklovi, yashirin tab va bo‘sh xona siyosati yangilandi.
- **Resurslar:** eski soya xaritalari, postprocessing passlari, aktyor/granata geometriyalari va label teksturalari yetarlicha chiqarilmagan; audio tugunlari tugaganidan keyin uzilmagan. Egalik asosida tozalash qo‘shildi.
- **Kiritish va UI:** yo‘qolgan volatile paketdagi bir martalik buyruqlar ishonchli qayta yuborilmagan, saqlangan operator nomi HTML atributiga bevosita qo‘yilgan, xarita yuklashlar ustma-ust kelishi mumkin bo‘lgan.

## Refactored & enhanced implementation

To‘liq ishlaydigan implementatsiya ushbu repodagi fayllarda. Qisqartirilgan kod yoki `TODO` o‘rniga haqiqiy o‘zgarishlar kiritilgan.

| Fayl / qatlam | O‘zgarish |
|---|---|
| `server/server.js` | Public yo‘l chegarasi, symlink tekshiruvi, URL/method validatsiyasi; bir marta xarita/xona yaratish; parallel quick-match; bekor qilingan ulanish himoyasi; mashq xonasi maxfiyligi; startup xatosida timerlarni tozalash; bo‘sh xonada simulyatsiyani to‘xtatish |
| `server/Room.js` | Bir tickda bir qadam; buyruqsiz fizika/taymer; eskirgan hayot/raund buyruqlarini rad qilish; granata xaridi; hodisa sxemasi; pichoq to‘qnashuvi; plant/defuse shartlari; bomba tushishi; raunddan keyingi o‘limda inventarni yo‘qotish |
| `server/Bots.js` | Flash paytida otishni to‘xtatish; warmup/respawnda maqsadni tiklash; yo‘l topilmaganda har tickda qayta A* ishlatmaslik |
| `server/Navigation.js` | Markazdan siljitilgan xaritalar o‘lchamini to‘g‘ri hisoblash; yurib bo‘lmaydigan boshlanish/maqsadni rad qilish |
| `shared/collision.js` | Ray yo‘nalishini normallashtirish — masofa metrda qoladi; nol yo‘nalish rad etiladi; joriy BVH parametr nomi |
| `shared/glb.js` | Umumiy/chunk uzunligi, accessor chegarasi, indeks/vertex, transform, siklik yoki takroriy node tekshiruvi; nomaqbul collision aktivlar aniq xato bilan to‘xtaydi |
| `shared/maps.js` | CT spawn uchun yozilgan `yaw = 0` ni saqlash |
| `shared/inventory.js`, `shared/constants.js` | Otish taqiqlangan fazada granata pinini bekor qilish; epoch/life validatsiyasi; taymer shartnomasini yangilash |
| `client/src/network.js`, `prediction.js` | Server tasdiqlamaguncha eng eski buyruqlarni qayta yuborish; hayot/raund identifikatorlari |
| `client/src/frame-pacer.js` | 30/60/90/120 FPS; menyu ≤30 FPS; yashirin tabda render yo‘q |
| `client/src/dispose.js` | Egalik qilinadigan geometriya/material/teksturani bir marta chiqarish; umumiy aktivlarni saqlash |
| `client/WorldEngine.js` | Yengilroq sifat profillari; LOW rejimida oddiy quyosh; pass/soya/aktyor/map resurslarini chiqarish; shader hooklarini qayta yig‘ish; ko‘p materialli GLB; chunk kaliti to‘qnashuvini yo‘qotish |
| `client/PlayerController.js` | Past FPSda kamera va qurol prujinalarini kichik qadamlarda integratsiya qilish; sezgirlikni chegaralash; Escape orqali aniq unlock |
| `client/WeaponManager.js`, `src/characters.js`, `src/viewmodels.js` | Almashtirilgan qo‘l va aktyor resurslari; cheksiz material keshi o‘rniga aktyor egaligi; olib tashlangan qurolni animatsiya qayta ko‘rsatmasligi |
| `client/src/effects.js`, `audio.js` | Granata geometriyasini tozalash; smoke vaqtini serverga moslash; ring reset; tugagan audio ovozlarining tugunlarini uzish; ovoz diapazonini tekshirish |
| `client/src/main.js`, `ui.js` | FPS sozlamasi; ketma-ket map loading va xatoda qisman yuklangan xaritani chiqarish; aloqa uzilgan yuklashni rad etish; nomni `.value` bilan qo‘yish; shop muddatini yopish; kechikkan callbackdan himoya; faqat tirik jamoadoshni kuzatish |
| `client/src/materials.js`, `vite.config.js` | 256 px protsedur teksturalar; normalStrength kesh kaliti; native file watching; dastur/Three/vendor bundlelarini ajratish |

Ishga tushirish:

```sh
npm ci
npm run dev
```

Production buildni lokal tekshirish:

```sh
npm run build
npm start
```

Tekshiruv:

```sh
npm test
npm audit
npm run build
CHROME_PATH="/path/to/chrome" npm run test:browser:local
```

`test:browser:local` vaqtinchalik loopback serverni o‘zi ochadi va test muvaffaqiyatli yoki xato bilan tugasa ham yopadi. `test:browser` oldindan ishlayotgan server bilan ishlash uchun saqlangan. Brauzer o‘rnatilgan bo‘lishi kerak.

## Realism adjustments changelog

| Oldingi holat | Yangi qoida va sababi |
|---|---|
| Paket kelmasa o‘yinchi havoda qolishi yoki reload to‘xtashi | Gravitatsiya, ishqalanish va qurol taymerlari dunyo vaqtida ishlaydi. Qisqa jitterda uzluksiz kiritish 125 ms ushlab turiladi; keyin neytral holatga o‘tadi. Sakrash/slot/Q hodisasi sun’iy takrorlanmaydi. |
| Buyruq to‘plami obyekt progressini tezlashtirishi | Har o‘yinchi uchun tickda bitta qadam. Plant/defuse muddati buyruq tezligidan mustaqil. |
| Site’ning yuqori/pastki qavatidan plant qilish | Site radiusi bilan birga balandlik farqi <1.5 m, yerda turish, sekinlik, C4 tanlovi va draw tugashi tekshiriladi. |
| Devor orqali yoki qurol otib turib defuse | Bomba bilan ko‘rish chizig‘i, masofa, harakatsizlik, otmaslik va reload qilmaslik shart. Bir vaqtda bitta defuser ishlaydi; uzilgan amal boshidan boshlanadi. |
| Portlash bilan bir tickdagi defuse tartibi tasodifiy | Portlash deadline’i avval tekshiriladi. Muddat o‘tgan bomba oxirgi buyruq bilan qutqarilmaydi. |
| Havoda tushirilgan C4 suzib qolishi | C4 gravitatsiya va substep kapsula to‘qnashuvi bilan yerga tushadi. Devordan turib uni olib bo‘lmaydi. |
| Flash botga ta’sir qilmasligi yoki kuchsiz flash oldingi ta’sirni qisqartirishi | Ko‘r bot otmaydi; yangi flash mavjud uzunroq ta’sir muddatini kamaytirmaydi. |
| Pichoq chetdagi nurda devordan urishi yoki oldingi hayotni nishonga olishi | Har bir zarba nuri uchun alohida devor masofasi va lag history `life` tekshiruvi. |
| Granata effekti/ovozi yo‘qolishi | `type` hodisa nomi, `grenadeType` granata turi bo‘lib ajratildi; HE o‘lim xabari haqiqiy zarar natijasidan olinadi. |
| Raunddan keyin granata o‘ldirgan o‘yinchi qurolini saqlashi | Uchayotgan granata o‘z vaqtida ishlashda davom etadi; o‘lgan o‘yinchi carry holatini yo‘qotadi. Keyingi raund tirik qolganlarning haqiqiy inventaridan boshlanadi. |
| Past FPSda kamera prujinasi tebranib ketishi | Renderdagi prujinalar ≤1/120 s substep bilan integratsiya qilinadi; o‘yin fizikasi 64 Hz qoladi. |

Taktik FPSning avvalgi Source uslubidagi harakat qiymatlari saqlandi: gravitatsiya 800 unit/s², 250/130/100 unit/s tezliklar, boshqariladigan havodagi strafe. Bular ataylab o‘yin mexanikasi; Yer gravitatsiyasining yoki inson biomexanikasining ilmiy simulyatsiyasi deb talqin qilinmaydi. Tasodifiy qurol tiqilishi yoki yeyilish kabi balansni tubdan o‘zgartiruvchi yangi mexanikalar qo‘shilmadi.

## CPU/GPU va qizish

| Parametr | Oldin | Hozir |
|---|---|---|
| Birinchi ishga tushish | HIGH, FPS limitsiz | LOW, 60 FPS |
| FPS tanlovi | Yo‘q | 30 / 60 / 90 / 120 |
| Menyu/pauza renderi | Monitor/renderer imkoniyati tezligida | ≤30 FPS |
| Yashirin tab | Faqat brauzer throttlingiga tayanadi | Ilova renderni ham to‘xtatadi, input tozalanadi, audio suspend qilinadi |
| HIGH soyalar | 3 × 2048² | 2 × 1024² |
| ULTRA soyalar | 3 × 4096² | 3 × 2048² |
| HIGH / ULTRA maksimal DPR | 1.5 / 2 | 1 / 1.5 |
| Standart protsedur/weapon tekstura | 512² | 256² |
| LOW soya arxitekturasi | CSM yaratilgan | CSM yo‘q, bitta oddiy directional light |
| Bo‘sh server xonasi | Bot/fizika cleanupgacha ishlaydi | Darhol to‘xtaydi, 20 s dan keyin o‘chadi |
| Dev file watch | 700 ms polling | Native hodisalar; polling faqat `KONTIR_POLLING=1` |

Soya xaritalarining jami texel soni HIGHda 83.3%, ULTRAda 75% kamaydi. 512² → 256² tekstura o‘zgarishi har bir tegishli teksturadagi texel/pixel ishini 75% kamaytiradi. Bular konfiguratsiyadan hisoblangan miqdorlar; umumiy FPS, quvvat yoki haroratning aynan shuncha yaxshilanishini bildirmaydi.

Avval saqlangan grafika tanlovi saqlanadi. Qiziyotgan qurilmada Sozlamalar → TEZKOR va 30 yoki 60 FPS orqali yukni cheklash mumkin. Yashirin multiplayer tabda server o‘yini davom etadi: tabni yashirish pauza yoki invulnerability bermaydi. 30 soniya buyruqsiz qolgan socket serverdan uziladi.

## Validatsiya dalillari

- Yakuniy avtomatik test va brauzer natijalari audit yakunida quyida qayd qilinadi.
- Regressiyalar: kodlangan katalogdan chiqish, noto‘g‘ri URL, band port, parallel xona/quick-match, sig‘im band qilish, map cache, granata xaridi, gravity/reload starvation, eski command, plant balandligi, devorli defuse, portlash deadline’i, flash, C4 tushishi, post-round inventar, siljitilgan navigatsiya, noto‘g‘ri GLB, ray masshtabi, FPS limiti, prujina barqarorligi, command retransmit va GPU resurs egaligi.
- `npm audit --json` audit vaqtida **0 ma’lum zaiflik** qaytardi. Bu ilovada hech qanday yangi/ma’lum bo‘lmagan zaiflik yo‘q degani emas.
- Brauzer sinovi Chrome + SwiftShader bilan bajariladi: bu CPU orqali dasturiy grafika, haqiqiy videokartadagi FPS yoki harorat benchmarki emas.

## Qolgan aniq chegaralar

1. Snapshot barcha o‘yinchi pozitsiyalarini yuboradi: server visibility filtering va haqiqiy anti-wallhack hali yo‘q. Faqat jamoadoshni spectate qilish klientdagi ma’lumot oqishini kamaytiradi, tarmoqdagi ma’lumotni yashirmaydi.
2. Account/auth, reyting, uzilgandan keyin sessiyani tiklash, regionlar, gorizontal sharding va ommaviy xizmat uchun abuse/DDoS himoyasi ushbu lokal match arxitekturasida mavjud emas. Internet uchun to‘liq production sertifikati berilmaydi.
3. Hitscan va oddiy yaw hitbox ishlatiladi; devor penetratsiyasi, animatsiyaga bog‘langan hitbox va umumiy qurolni tashlab olish yo‘q. Friendly fire o‘chirilgan; smoke shar modeli, C4 zarari masofaviy soddalashtirilgan model.
4. Navigatsiya bitta probe balandligi bilan ishlaydi. Ikkala berilgan xarita tekshirildi; ixtiyoriy ko‘p qavatli GLB uchun to‘liq navmesh kerak. Katta xaritaning BVH/nav qurilishi asosiy server oqimida qolgan, birinchi yuklashda qisqa pauza bo‘lishi mumkin.
5. GLB collision reader siqilgan yoki sparse geometriyani rad etadi; README’dagi kabi alohida siqilmagan collision GLB kerak. Draco vizual decoder tashqi manzilga bog‘liq.
6. Haqiqiy PC harorati, watt sarfi, uzoq davom etuvchi GPU soak yoki 24 to‘liq xona yuk testi o‘lchanmagan. 64 Hz server testi va brauzer funksional testi bularning o‘rnini bosmaydi.

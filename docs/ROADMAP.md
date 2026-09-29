# Keyingi bosqich uchun tavsiyalar (hali qilinmagan)

## Akkaunt va xavfsizlik
- Parolni tiklash: tiklash kodi (e-mail yo‘q) yoki ro‘yxatdan o‘tishda beriladigan “zaxira so‘z”.
- Parolni o‘zgartirish, barcha qurilmalardan chiqish, sessiyalar ro‘yxati.
- JSON fayl o‘rniga SQLite/PostgreSQL (ko‘p serverli hosting uchun).
- Ism filtri (haqoratli nomlar), bir IP dan ro‘yxat limiti, captcha.
- Admin panel: ban/mute, shikoyatlar (report) va ularni ko‘rib chiqish.

## Progress va iqtisod
- Kunlik/haftalik vazifalar (missions), haftalik XP bonus, kunlik kirish mukofoti.
- Keyslar va kalitlar (faqat o‘yin tangasi), skin eskirish darajasi (Factory New … Battle-Scarred), StatTrak hisoblagichi.
- Pichoq va qo‘lqop skinlari, stikerlar, agent (personaj) skinlari.
- O‘yinchilar orasida almashuv (trade) va market — faqat akkauntlar uchun.
- Mashq/bot o‘yinlari uchun kamaytirilgan mukofot (farm qilinmasligi uchun).

## Reyting va matchmaking
- Haqiqiy ELO/Glicko reyting, 10 ta kalibrovka o‘yini, reytingga qarab matchmaking.
- Premier rejimi (xarita pick/ban), liderlar jadvali (global / do‘stlar).
- Matchdan chiqib ketganlarga jarima (cooldown), qayta ulanish (reconnect) bir xil o‘ringa.
- Region tanlash (ping bo‘yicha), bir nechta server.

## Ijtimoiy
- Do‘stlar ro‘yxati, taklif yuborish, partiya (5 kishigacha birga navbatga turish).
- Shaxsiy xabarlar, klanlar, profil sahifasi (statistika, eng yaxshi qurol, xaritalar bo‘yicha foiz).
- Ovozli chat (WebRTC, jamoa ichida).

## O‘yin
- Match yozuvlari (demo/replay) va killcam.
- Deathmatch, Wingman 2v2, Arms Race, Retake rejimlari.
- Xarita muharriri (brauzerda) va hamjamiyat xaritalari.
- Server anti-cheat: aim statistikasi tahlili, tezlik/teleport tekshiruvi.
- Haqiqiy 3D modellar (qurol, uy, personaj) — tarmoq ruxsati yoki GLB fayllar bilan.

## Texnik
- Mobil qurilma uchun sensor boshqaruv, gamepad qo‘llab-quvvatlash.
- PWA (o‘rnatiladigan ilova), oflayn bot rejimi.
- Monitoring: xatolar (Sentry), server metrikalari, FPS telemetriyasi.
- CI (GitHub Actions): testlar va brauzer smoke testi har PR da.

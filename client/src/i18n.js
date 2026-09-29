// Interface language (uz / ru / en). The UI is authored in Uzbek; this module translates rendered text nodes and
// title / aria-label / placeholder attributes by exact phrase (plus a few patterns for numbered strings).
// A MutationObserver covers everything rendered later, so ui.js / main.js need no per-string changes.
const KEY = 'kontir.lang';
export const LANGS = { uz: 'O‘zbekcha', ru: 'Русский', en: 'English' };

// uz -> [ru, en]
const D = {
  'Bosh sahifa': ['Главная', 'Home'], 'Sozlamalar': ['Настройки', 'Settings'], 'To‘liq ekran': ['Полный экран', 'Fullscreen'],
  'INVENTAR': ['ИНВЕНТАРЬ', 'INVENTORY'], 'LOADOUT': ['СНАРЯЖЕНИЕ', 'LOADOUT'], 'O‘YNASH': ['ИГРАТЬ', 'PLAY'], 'DO‘KON': ['МАГАЗИН', 'STORE'], 'YANGILIKLAR': ['НОВОСТИ', 'NEWS'],
  'Qo‘llanma': ['Руководство', 'Guide'], 'DARAJA 1': ['УРОВЕНЬ 1', 'LEVEL 1'],
  'DEMO PROFIL · ma’lumotlar shu qurilmada saqlanadi': ['ДЕМО-ПРОФИЛЬ · прогресс не сохраняется', 'DEMO PROFILE · progress is not saved'],
  '5v5 · MR12 · real o‘yinchilar': ['5v5 · MR12 · реальные игроки', '5v5 · MR12 · real players'],
  'tezroq topiladi · bo‘sh joyga bot': ['быстрее поиск · боты на пустые места', 'faster search · bots fill empty seats'],
  'BOTLARGA QARSHI': ['ПРОТИВ БОТОВ', 'VS BOTS'], 'son va qiyinlikni tanlang': ['выберите число и сложность', 'choose count and difficulty'],
  'XUSUSIY XONA': ['ПРИВАТНАЯ КОМНАТА', 'PRIVATE ROOM'], 'do‘stlar bilan kod orqali': ['с друзьями по коду', 'with friends by code'],
  'XARITALAR': ['КАРТЫ', 'MAPS'], 'Hammasini tanlash': ['Выбрать все', 'Select all'], 'PARTIYA': ['ГРУППА', 'PARTY'],
  'Operator nomi': ['Имя оператора', 'Operator name'], 'KONTIR OPERATOR': ['ОПЕРАТОР KONTIR', 'KONTIR OPERATOR'],
  'BOTLAR': ['БОТЫ', 'BOTS'], 'QIYINLIK': ['СЛОЖНОСТЬ', 'DIFFICULTY'], 'OSON': ['ЛЕГКО', 'EASY'], 'O‘RTA': ['СРЕДНЕ', 'MEDIUM'], 'QIYIN': ['СЛОЖНО', 'HARD'], 'EKSPERT': ['ЭКСПЕРТ', 'EXPERT'],
  'TOMON AFZALLIGI (botlar / xona)': ['ПРЕДПОЧТИТЕЛЬНАЯ СТОРОНА (боты / комната)', 'PREFERRED SIDE (bots / room)'],
  'MASHQ': ['ТРЕНИРОВКА', 'PRACTICE'], 'TEZKOR': ['БЫСТРАЯ', 'QUICK'], 'KOD': ['КОД', 'CODE'],
  'Qidirilmoqda…': ['Поиск…', 'Searching…'], 'Bekor qilish': ['Отмена', 'Cancel'], 'IZLASH': ['НАЙТИ', 'GO'],
  'MENYU': ['МЕНЮ', 'MENU'], 'SIZ YO‘Q QILINDINGIZ': ['ВЫ УБИТЫ', 'YOU WERE ELIMINATED'], 'Keyingi raundni kuting · TAB — natijalar': ['Ждите следующий раунд · TAB — счёт', 'Wait for the next round · TAB — scoreboard'],
  'SLOT': ['СЛОТ', 'SLOT'], 'ALMASHTIRISH': ['СМЕНА', 'SWAP'], 'XARID': ['ПОКУПКА', 'BUY'], 'KO‘RIK': ['ОСМОТР', 'INSPECT'], 'TASHLASH': ['ВЫБРОСИТЬ', 'DROP'], 'OLISH / DEFUSE': ['ПОДОБРАТЬ / РАЗМИН.', 'PICK UP / DEFUSE'],
  'Operatsiyaga tayyormisiz?': ['Готовы к операции?', 'Ready for the operation?'],
  'WASD — harakat · SICHQONCHA — nishon · CHAP TUGMA — otish': ['WASD — движение · МЫШЬ — прицел · ЛКМ — огонь', 'WASD — move · MOUSE — aim · LMB — fire'],
  'SHIFT — jimgina yurish · CTRL — cho‘kish · Q — oxirgi qurol · 1–5 — slot': ['SHIFT — тихий шаг · CTRL — присесть · Q — прошлое оружие · 1–5 — слот', 'SHIFT — walk · CTRL — crouch · Q — last weapon · 1–5 — slot'],
  'JANGGA KIRISH': ['В БОЙ', 'DEPLOY'], 'Bosh menyuga qaytish': ['В главное меню', 'Back to main menu'], 'Yopish': ['Закрыть', 'Close'],
  'OPERATSIYA YUKLANMOQDA': ['ЗАГРУЗКА ОПЕРАЦИИ', 'LOADING OPERATION'], 'HAMMA': ['ВСЕ', 'ALL'], 'JAMOA': ['КОМАНДА', 'TEAM'], '(JAMOA)': ['(КОМАНДА)', '(TEAM)'], '*O‘LIK*': ['*МЁРТВ*', '*DEAD*'], 'yopish': ['закрыть', 'close'],
  'RAUND BOSHLANDI': ['РАУНД НАЧАЛСЯ', 'ROUND STARTED'], 'DURANG': ['НИЧЬЯ', 'DRAW'], 'YANGI DARAJA!': ['НОВЫЙ УРОВЕНЬ!', 'LEVEL UP!'],
  'O‘YININGIZ TAYYOR!': ['ВАША ИГРА ГОТОВА!', 'YOUR MATCH IS READY!'], 'QABUL QILISH': ['ПРИНЯТЬ', 'ACCEPT'], 'QABUL QILINDI': ['ПРИНЯТО', 'ACCEPTED'],
  'Natijalar': ['Результаты', 'Scoreboard'], 'Xonadan chiqish': ['Выйти из комнаты', 'Leave room'], 'Xarid menyusi': ['Меню покупки', 'Buy menu'],
  'Harakat (250 u/s)': ['Движение (250 u/s)', 'Move (250 u/s)'], 'Jimgina yurish (130 u/s, qadam ovozi yo‘q)': ['Тихий шаг (130 u/s, без шагов)', 'Walk (130 u/s, silent)'],
  'Cho‘kish (100 u/s)': ['Присесть (100 u/s)', 'Crouch (100 u/s)'], 'Sakrash (havoda strafe)': ['Прыжок (стрейф в воздухе)', 'Jump (air strafe)'],
  'Oxirgi qurolga qaytish': ['Прошлое оружие', 'Last weapon'], 'Qayta o‘qlash': ['Перезарядка', 'Reload'], 'Otish / pichoq sanchish · kuchsiz otish': ['Огонь / удар ножом · слабый бросок', 'Fire / stab · underhand throw'],
  'Sichqonchani bo‘shatish': ['Освободить мышь', 'Release mouse'], 'Chat: hammaga / faqat jamoaga': ['Чат: всем / команде', 'Chat: all / team'],
  'Radio buyruqlari (keyin 1–9)': ['Радиокоманды (затем 1–9)', 'Radio commands (then 1–9)'], 'Nishonga olingan joyni jamoaga belgilash (ping)': ['Отметить точку для команды (пинг)', 'Mark the aimed spot for the team (ping)'],
  'Qurolni aylantirib ko‘rish (inspect)': ['Осмотр оружия', 'Inspect weapon'], 'Qo‘ldagi qurolni (yoki C4 ni) tashlash': ['Выбросить оружие (или C4)', 'Drop weapon (or C4)'],
  'Plant (5-slot, A/B hududida ushlab turing)': ['Установка (слот 5, удерживать на A/B)', 'Plant (slot 5, hold on A/B)'],
  'Asosiy · Pistolet · Pichoq · Granata · C4': ['Основное · Пистолет · Нож · Граната · C4', 'Primary · Pistol · Knife · Grenade · C4'],
  'Grafika': ['Графика', 'Graphics'], 'FPS limiti': ['Лимит FPS', 'FPS limit'], 'OVOZ': ['ЗВУК', 'VOLUME'], 'SICHQONCHA SEZGIRLIGI': ['ЧУВСТВИТЕЛЬНОСТЬ МЫШИ', 'MOUSE SENSITIVITY'],
  'TEZKOR: soyasiz, kamroq yuklama. O‘RTA (tavsiya): tiniq (MSAA, to‘liq ruxsat), bitta soya kaskadi har 2-kadrda — qurilma qizimaydi. YUQORI: 2 × 1024 px soya. ULTRA: GTAO + bloom, 3 × 2048 px soya. Menyu 30 FPS; yashirin oynada render to‘xtaydi. Pastroq FPS limiti GPU yukini kamaytiradi.':
    ['БЫСТРО: без теней. СРЕДНЕ (рекомендуется): чётко (MSAA), один каскад теней раз в 2 кадра — устройство не греется. ВЫСОКО: тени 2 × 1024. УЛЬТРА: GTAO + bloom, тени 3 × 2048. Меню 30 FPS; в скрытой вкладке рендер останавливается.', 'FAST: no shadows. MEDIUM (recommended): sharp (MSAA), one shadow cascade every 2nd frame — stays cool. HIGH: 2 × 1024 shadows. ULTRA: GTAO + bloom, 3 × 2048 shadows. Menu runs at 30 FPS; hidden tabs stop rendering.'],
  'YUQORI': ['ВЫСОКО', 'HIGH'], 'ULTRA': ['УЛЬТРА', 'ULTRA'],
  'Jihozingizni tanlang.': ['Выберите снаряжение.', 'Choose your gear.'], 'Raund boshidagi qurollaringiz': ['Оружие в начале раунда', 'Starting weapons'],
  'BOSHLANG‘ICH PISTOLET': ['СТАРТОВЫЙ ПИСТОЛЕТ', 'STARTING PISTOL'], 'RIFLE (do‘konda ko‘rinadigani)': ['ВИНТОВКА (в магазине)', 'RIFLE (shown in the buy menu)'],
  'Tanlov har raund boshida (va do‘konda) qo‘llanadi. Skinlar INVENTAR bo‘limida.': ['Выбор применяется в начале каждого раунда. Скины — в ИНВЕНТАРЕ.', 'Applied at the start of every round. Skins are in INVENTORY.'],
  'Qurollar va skinlar': ['Оружие и скины', 'Weapons and skins'], 'SKIN TANLASH': ['ВЫБОР СКИНА', 'CHOOSE SKIN'], 'Skinlar': ['Скины', 'Skins'],
  'Sotib olingan skinlarni istalgan qurolga qo‘ying. Yangi skinlar DO‘KONda.': ['Ставьте купленные скины на любое оружие. Новые — в МАГАЗИНЕ.', 'Put owned skins on any weapon. New skins are in the STORE.'],
  'Demo tangalar (◈) har bir match uchun beriladi: qatnashish, o‘ldirish va g‘alaba. Haqiqiy pul yo‘q.': ['Монеты (◈) даются за матч: участие, убийства и победа. Реальных денег нет.', 'Coins (◈) are earned per match: playing, kills and wins. No real money.'],
  'SIZDA BOR': ['ЕСТЬ', 'OWNED'], 'Nimalar yangi': ['Что нового', 'What’s new'], 'Avval reja. Keyin harakat.': ['Сначала план. Потом действие.', 'Plan first. Then act.'],
  'Jamoani yig‘ing.': ['Соберите команду.', 'Gather your team.'], 'Xonaga qo‘shiling.': ['Присоединяйтесь к комнате.', 'Join a room.'], 'XONA KODI': ['КОД КОМНАТЫ', 'ROOM CODE'],
  'Do‘stlar quyidagi xona kodini kiritishi mumkin. Har jamoada 5 o‘rin.': ['Друзья могут ввести этот код. 5 мест в каждой команде.', 'Friends can enter this room code. 5 seats per team.'],
  'OPERATOR NOMI': ['ИМЯ ОПЕРАТОРА', 'OPERATOR NAME'], 'Brauzerda grafik tezlashtirishni yoqing.': ['Включите аппаратное ускорение в браузере.', 'Enable hardware acceleration in your browser.'],
  'WebGL2 talab qilinadi.': ['Требуется WebGL2.', 'WebGL2 is required.'], 'Bitta xaritani tanlang': ['Выберите одну карту', 'Pick one map'],
  'Bomba portladi': ['Бомба взорвалась', 'Bomb exploded'], 'Bomba zararsizlantirildi': ['Бомба обезврежена', 'Bomb defused'], 'Jamoa yo‘q qilindi': ['Команда уничтожена', 'Team eliminated'],
  'MATCH YUKLANMOQDA…': ['ЗАГРУЗКА МАТЧА…', 'LOADING MATCH…'], 'XARITA YUKLANMOQDA…': ['ЗАГРУЗКА КАРТЫ…', 'LOADING MAP…'], 'GRAFIKA TAYYORLANMOQDA…': ['ПОДГОТОВКА ГРАФИКИ…', 'PREPARING GRAPHICS…'], 'ULANMOQDA…': ['ПОДКЛЮЧЕНИЕ…', 'CONNECTING…'],
  'HIMOYA QILING': ['ЗАЩИЩАЙТЕ', 'DEFEND'], 'DEFUSE QILING': ['ОБЕЗВРЕДЬТЕ', 'DEFUSE'], 'ZARARSIZLANTIRILMOQDA…': ['ОБЕЗВРЕЖИВАНИЕ…', 'DEFUSING…'], 'O‘RNATILMOQDA…': ['УСТАНОВКА…', 'PLANTING…'],
  'R — QAYTA O‘QLASH': ['R — ПЕРЕЗАРЯДКА', 'R — RELOAD'], 'O‘YIN BOSHLANISHI KUTILMOQDA': ['ОЖИДАНИЕ НАЧАЛА ИГРЫ', 'WAITING FOR THE MATCH TO START'],
  'Xarid vaqti tugagan. Keyingi raundni kuting.': ['Время покупки вышло. Ждите следующий раунд.', 'Buy time is over. Wait for the next round.'],
  'Server bilan aloqa uzildi. Qayta kiring.': ['Связь с сервером потеряна. Войдите снова.', 'Lost connection to the server. Please rejoin.'],
  'Harakatsizlik uchun chetlatildingiz.': ['Вы исключены за бездействие.', 'Kicked for inactivity.'],
  'Pointer Lock bloklandi. Oynani faollashtirib, qayta bosing.': ['Захват мыши заблокирован. Активируйте окно и нажмите снова.', 'Pointer lock was blocked. Focus the window and click again.'],
  'MATCHNI BOSHLASH': ['НАЧАТЬ МАТЧ', 'START MATCH'], 'XONAGA KIRISH': ['ВОЙТИ В КОМНАТУ', 'JOIN ROOM'],
  // accounts
  'KIRISH': ['ВХОД', 'SIGN IN'], 'RO‘YXATDAN O‘TISH': ['РЕГИСТРАЦИЯ', 'REGISTER'], 'DEMO BILAN O‘YNASH': ['ИГРАТЬ В ДЕМО', 'PLAY AS DEMO'], 'CHIQISH': ['ВЫЙТИ', 'SIGN OUT'],
  'Foydalanuvchi nomi': ['Имя пользователя', 'Username'], 'Parol': ['Пароль', 'Password'], 'Parolni takrorlang': ['Повторите пароль', 'Repeat password'],
  'Akkaunt': ['Аккаунт', 'Account'], 'KONTIRga xush kelibsiz': ['Добро пожаловать в KONTIR', 'Welcome to KONTIR'],
  'Akkauntda XP, reyting, tangalar va skinlar serverda saqlanadi. Demo rejimda progress saqlanmaydi va skin olib bo‘lmaydi.': ['В аккаунте XP, рейтинг, монеты и скины хранятся на сервере. В демо прогресс не сохраняется и скины купить нельзя.', 'An account keeps XP, rating, coins and skins on the server. Demo progress is not saved and skins cannot be bought.'],
  'Nom: 3–16 ta lotin harf, raqam yoki _ . Parol: kamida 6 belgi. E-mail kerak emas.': ['Имя: 3–16 латинских букв, цифр или _. Пароль: от 6 символов. E-mail не нужен.', 'Username: 3–16 Latin letters, digits or _. Password: 6+ characters. No e-mail needed.'],
  'Bu nom band. Boshqasini tanlang.': ['Это имя занято. Выберите другое.', 'This username is taken. Pick another.'], 'Nom yoki parol noto‘g‘ri.': ['Неверное имя или пароль.', 'Wrong username or password.'],
  'Nom noto‘g‘ri: 3–16 ta lotin harf, raqam yoki _.': ['Неверное имя: 3–16 латинских букв, цифр или _.', 'Invalid username: 3–16 Latin letters, digits or _.'],
  'Parol 6–64 belgidan iborat bo‘lsin.': ['Пароль должен быть 6–64 символа.', 'Password must be 6–64 characters.'], 'Parollar mos emas.': ['Пароли не совпадают.', 'Passwords do not match.'],
  'Juda ko‘p urinish. Bir daqiqa kuting.': ['Слишком много попыток. Подождите минуту.', 'Too many attempts. Wait a minute.'], 'Server xatosi. Qayta urinib ko‘ring.': ['Ошибка сервера. Попробуйте снова.', 'Server error. Try again.'],
  'Skin olish uchun akkaunt kerak. Demo rejimda skinlar yo‘q.': ['Для скинов нужен аккаунт. В демо скинов нет.', 'Skins need an account. Demo mode has no skins.'],
  'DEMO · progress saqlanmaydi': ['ДЕМО · прогресс не сохраняется', 'DEMO · progress not saved'], 'AKKAUNT · serverda saqlanadi': ['АККАУНТ · хранится на сервере', 'ACCOUNT · saved on the server'],
  'SKIN UCHUN AKKAUNT KERAK': ['ДЛЯ СКИНОВ НУЖЕН АККАУНТ', 'SIGN IN FOR SKINS'], 'TIL': ['ЯЗЫК', 'LANGUAGE'], 'Til': ['Язык', 'Language'],
  'Akkauntga kirildi.': ['Вход выполнен.', 'Signed in.'], 'Akkaunt yaratildi.': ['Аккаунт создан.', 'Account created.'], 'Akkauntdan chiqildi.': ['Вы вышли из аккаунта.', 'Signed out.'],
};
// numbered / templated strings
const P = [
  [/^RAUND (\d+) · (\d+)-YARIM$/, ['РАУНД $1 · $2-Я ПОЛОВИНА', 'ROUND $1 · HALF $2']], [/^RAUND (\d+)$/, ['РАУНД $1', 'ROUND $1']], [/^DARAJA (\d+)$/, ['УРОВЕНЬ $1', 'LEVEL $1']], [/^DARAJA (\d+) · (.+)$/, ['УРОВЕНЬ $1 · $2', 'LEVEL $1 · $2']],
  [/^(.+) — RAUND SIZNIKI$/, ['$1 — РАУНД ВАШ', '$1 WIN THE ROUND']], [/^JIHOZLANING · B$/, ['ЗАКУПКА · B', 'BUY · B']], [/^(\d+) REYTING$/, ['$1 РЕЙТИНГ', '$1 RATING']],
  [/^(.+) — sotib olindi\. INVENTARdan qurolga qo‘ying\.$/, ['$1 — куплено. Поставьте в ИНВЕНТАРЕ.', '$1 — purchased. Equip it in INVENTORY.']],
];

let lang = (() => { try { const s = localStorage.getItem(KEY); if (LANGS[s]) return s; } catch { /* ignore */ } const n = (navigator.language || '').slice(0, 2); return n === 'ru' ? 'ru' : n === 'en' ? 'en' : 'uz'; })();
const originals = new WeakMap(), ATTRS = ['title', 'aria-label', 'placeholder'];
const idx = () => (lang === 'ru' ? 0 : 1);

/** Translates one Uzbek phrase into the current language (unknown phrases pass through). */
export function t(s) {
  if (lang === 'uz' || !s) return s;
  const k = s.trim(), hit = D[k];
  if (hit) return s.replace(k, hit[idx()]);
  for (const [re, out] of P) if (re.test(k)) return s.replace(k, k.replace(re, out[idx()]));
  return s;
}
function textNode(n) {
  if (!n.nodeValue || !/[A-Za-z‘’]/.test(n.nodeValue)) return;
  let o = originals.get(n);
  if (o === undefined || (n.nodeValue !== o.out)) { o = { src: n.nodeValue, out: '' }; originals.set(n, o); } // new or rewritten by the app
  o.out = t(o.src); if (n.nodeValue !== o.out) n.nodeValue = o.out;
}
function element(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const key = `data-i18n-${a}`, cur = el.getAttribute(a);
    let src = el.getAttribute(key);
    if (src === null || t(src) !== cur) { src = cur; el.setAttribute(key, src); }
    const out = t(src); if (cur !== out) el.setAttribute(a, out);
  }
}
function walk(root) {
  if (root.nodeType === 3) return textNode(root);
  if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE' || root.tagName === 'CANVAS') return;
  element(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) (n.nodeType === 3 ? textNode(n) : element(n));
}
let observer = null;
export function startI18n() {
  document.documentElement.lang = lang;
  if (lang === 'uz' || observer) return; // the source language needs no observer until the player switches
  walk(document.body);
  observer = new MutationObserver(list => {
    observer.disconnect();
    for (const m of list) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') element(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
    observer.observe(document.body, OPTS);
  });
  observer.observe(document.body, OPTS);
}
const OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
export const getLang = () => lang;
export function setLang(l) {
  if (!LANGS[l] || l === lang) return;
  lang = l; try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  // re-translate from the stored Uzbek originals
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  observer?.disconnect();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) { const o = originals.get(n); if (o && n.nodeValue === o.out) { o.out = t(o.src); n.nodeValue = o.out; } else textNode(n); }
    else for (const a of ATTRS) { const src = n.getAttribute(`data-i18n-${a}`); if (src !== null) n.setAttribute(a, t(src)); }
  }
  if (observer) observer.observe(document.body, OPTS); else startI18n();
}

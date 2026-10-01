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
  'Grafika': ['Графика', 'Graphics'], 'FPS limiti': ['Лимит FPS', 'FPS limit'], 'OVOZ': ['ЗВУК', 'VOLUME'], 'SICHQONCHA SEZGIRLIGI': ['ЧУВСТВИТЕЛЬНОСТЬ МЫШИ', 'MOUSE SENSITIVITY'], 'SICHQONCHA SEZGIRLIGI ': ['ЧУВСТВИТЕЛЬНОСТЬ МЫШИ ', 'MOUSE SENSITIVITY '],
  'TEZKOR: sahna 75 % ruxsatda, FSR uslubida keskinlashtiriladi — eng zaif noutbuklar uchun. O‘RTA: to‘liq ruxsat, soyasiz, eng yuqori FPS. TINIQ (eski PC uchun tavsiya): to‘liq ruxsat, 4x MSAA, keskinlashtirish va yengil soya — FPS tushsa ruxsat avtomatik pasayadi, tasvir esa tiniq qoladi. YUQORI: 2 × 1024 px soya. ULTRA: GTAO + bloom, 3 × 2048 px soya.':
    ['БЫСТРО: сцена в 75 % разрешения с резкостью в стиле FSR — для самых слабых ноутбуков. СРЕДНЕ: полное разрешение без теней, максимум FPS. ЧЁТКО (рекомендуется для старых ПК): полное разрешение, 4x MSAA, резкость и лёгкие тени — при падении FPS разрешение снижается автоматически, а картинка остаётся чёткой. ВЫСОКО: тени 2 × 1024. УЛЬТРА: GTAO + bloom, тени 3 × 2048.',
     'FAST: scene at 75 % resolution with FSR-style sharpening — for the weakest laptops. MEDIUM: full resolution, no shadows, highest FPS. CRISP (recommended for old PCs): full resolution, 4x MSAA, sharpening and light shadows — if FPS drops the resolution scales down automatically while the image stays sharp. HIGH: 2 × 1024 shadows. ULTRA: GTAO + bloom, 3 × 2048 shadows.'],
  'TINIQ': ['ЧЁТКО', 'CRISP'],
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
  // settings
  'UMUMIY': ['ОБЩИЕ', 'GENERAL'], 'SICHQONCHA': ['МЫШЬ', 'MOUSE'], 'KLAVIATURA': ['КЛАВИАТУРА', 'KEYBOARD'], 'SCOPE SEZGIRLIGI': ['ЧУВСТВИТЕЛЬНОСТЬ В ПРИЦЕЛЕ', 'SCOPED SENSITIVITY'],
  'Y o‘qini teskari qilish': ['Инвертировать ось Y', 'Invert Y axis'], 'Raw input (OS tezlashtirishsiz)': ['Raw input (без ускорения ОС)', 'Raw input (no OS acceleration)'],
  'G‘ildirak bilan qurol almashtirish': ['Смена оружия колесом', 'Mouse wheel switches weapons'], 'Cho‘kish — bosib yoqish/o‘chirish': ['Присед — переключение', 'Toggle crouch'],
  'Oldinga': ['Вперёд', 'Forward'], 'Orqaga': ['Назад', 'Back'], 'Chapga': ['Влево', 'Left'], 'O‘ngga': ['Вправо', 'Right'], 'Sakrash': ['Прыжок', 'Jump'], 'Cho‘kish': ['Присесть', 'Crouch'], 'Jimgina yurish': ['Тихий шаг', 'Walk'],
  'Otish': ['Огонь', 'Fire'], 'Ikkinchi otish / scope': ['Альт. огонь / прицел', 'Secondary fire / scope'], 'Olish / defuse': ['Подобрать / разминировать', 'Use / defuse'], 'Oxirgi qurol': ['Прошлое оружие', 'Last weapon'],
  'Qurolni tashlash': ['Выбросить оружие', 'Drop weapon'], 'Qurol ko‘rigi': ['Осмотр оружия', 'Inspect weapon'], 'Asosiy qurol': ['Основное оружие', 'Primary'], 'Pistolet': ['Пистолет', 'Pistol'], 'Pichoq': ['Нож', 'Knife'], 'Granata': ['Граната', 'Grenade'],
  'Umumiy chat': ['Общий чат', 'All chat'], 'Jamoa chati': ['Командный чат', 'Team chat'], 'Radio': ['Радио', 'Radio'], 'Ping': ['Пинг', 'Ping'], 'Ovozli gapirish (ushlab turing)': ['Голосовой чат (удерживать)', 'Push to talk (hold)'],
  'Katakni bosing, keyin tugma yoki sichqoncha tugmasini bosing. Esc — bekor, Backspace — tozalash.': ['Нажмите на ячейку, затем клавишу или кнопку мыши. Esc — отмена, Backspace — очистить.', 'Click a cell, then press a key or mouse button. Esc cancels, Backspace clears.'],
  'Standart holatga qaytarish': ['Сбросить по умолчанию', 'Reset to defaults'], 'Grafika xotirasi tiklanmoqda…': ['Восстановление графики…', 'Restoring graphics…'], 'Grafika tiklandi.': ['Графика восстановлена.', 'Graphics restored.'],
  // friends / voice
  'Do‘stlar': ['Друзья', 'Friends'], 'DO‘STLAR': ['ДРУЗЬЯ', 'FRIENDS'], 'SO‘ROVLAR': ['ЗАЯВКИ', 'REQUESTS'], 'QABUL': ['ПРИНЯТЬ', 'ACCEPT'], 'RAD': ['ОТКЛОНИТЬ', 'DECLINE'], 'QO‘SHISH': ['ДОБАВИТЬ', 'ADD'],
  'DO‘ST': ['ДРУГ', 'FRIEND'], 'YUBORILGAN': ['ОТПРАВЛЕНО', 'SENT'], 'LOBBIDA': ['В ЛОББИ', 'IN LOBBY'], 'O‘YIN QIDIRMOQDA': ['ИЩЕТ ИГРУ', 'SEARCHING'], 'O‘YINDA': ['В ИГРЕ', 'IN GAME'], 'OFLAYN': ['НЕ В СЕТИ', 'OFFLINE'],
  'Foydalanuvchi nomini qidiring': ['Поиск по имени пользователя', 'Search by username'], 'Xabar yozing…': ['Напишите сообщение…', 'Type a message…'], 'Xabar': ['Сообщение', 'Message'], 'Ovozli qo‘ng‘iroq': ['Голосовой звонок', 'Voice call'], 'O‘chirish': ['Удалить', 'Remove'],
  'Hali do‘stlar yo‘q. Yuqorida nom bo‘yicha qidiring.': ['Пока нет друзей. Найдите игрока по имени выше.', 'No friends yet. Search by username above.'], 'Hech kim topilmadi.': ['Никого не найдено.', 'Nobody found.'],
  'Do‘stlar, yozishma va ovozli qo‘ng‘iroq uchun akkaunt kerak.': ['Для друзей, сообщений и голосовых звонков нужен аккаунт.', 'Friends, messages and voice calls need an account.'],
  'So‘rov yuborildi.': ['Заявка отправлена.', 'Request sent.'], 'Do‘st qo‘shildi.': ['Друг добавлен.', 'Friend added.'], 'Bunday o‘yinchi topilmadi.': ['Игрок не найден.', 'Player not found.'], 'Allaqachon do‘stingiz.': ['Уже в друзьях.', 'Already friends.'],
  'O‘zingizni qo‘sha olmaysiz.': ['Нельзя добавить себя.', 'You cannot add yourself.'], 'Faqat do‘stlarga yozish mumkin.': ['Писать можно только друзьям.', 'You can only message friends.'],
  'Mikrofonga ruxsat berilmadi.': ['Нет доступа к микрофону.', 'Microphone access denied.'], 'Qo‘ng‘iroq tugadi.': ['Звонок завершён.', 'Call ended.'], 'Ovozli ulanish o‘rnatilmadi (tarmoq/NAT).': ['Не удалось установить голосовую связь (сеть/NAT).', 'Voice connection failed (network/NAT).'],
  'MIC': ['МИК', 'MIC'], 'MIC O‘CHIQ': ['МИК ВЫКЛ', 'MIC OFF'], 'TUGATISH': ['ЗАВЕРШИТЬ', 'HANG UP'],
  'yoki': ['или', 'or'],
  'Partiyaga taklif': ['Пригласить в пати', 'Invite to party'], 'Taklif yuborildi.': ['Приглашение отправлено.', 'Invite sent.'], 'QO‘SHILISH': ['ПРИСОЕДИНИТЬСЯ', 'JOIN'],
  'Do‘st onlayn emas.': ['Друг не в сети.', 'Friend is offline.'], 'U allaqachon partiyada.': ['Уже в пати.', 'Already in a party.'], 'Partiya to‘la (5).': ['Пати заполнено (5).', 'Party is full (5).'],
  'Partiya lideriga qo‘shilmoqda…': ['Присоединение к лидеру пати…', 'Joining your party leader…'], 'Partiyadan chiqish': ['Покинуть пати', 'Leave party'], 'Do‘st taklif qilish': ['Пригласить друга', 'Invite a friend'],
  'PAUZA · ESC — davom etish': ['ПАУЗА · ESC — продолжить', 'PAUSED · ESC — resume'], 'O‘yin to‘xtatildi': ['Игра на паузе', 'Game paused'], 'DAVOM ETISH': ['ПРОДОЛЖИТЬ', 'RESUME'],
  'Sichqonchani yoqish uchun ekranni bosing.': ['Нажмите на экран, чтобы захватить мышь.', 'Click the screen to capture the mouse.'],
  'Parolni ko‘rsatish': ['Показать пароль', 'Show password'],
  '⚙ SOZLAMALAR': ['⚙ НАСТРОЙКИ', '⚙ SETTINGS'],
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
  [/^RAUND (\d+) · (\d+)-YARIM$/, ['РАУНД $1 · $2-Я ПОЛОВИНА', 'ROUND $1 · HALF $2']], [/^RAUND (\d+) · (\d+)-YARIM · (\d+) GA$/, ['РАУНД $1 · $2-Я ПОЛОВИНА · ДО $3', 'ROUND $1 · HALF $2 · FIRST TO $3']], [/^RAUND (\d+)$/, ['РАУНД $1', 'ROUND $1']], [/^DARAJA (\d+)$/, ['УРОВЕНЬ $1', 'LEVEL $1']], [/^DARAJA (\d+) · (.+)$/, ['УРОВЕНЬ $1 · $2', 'LEVEL $1 · $2']],
  [/^(.+) — RAUND SIZNIKI$/, ['$1 — РАУНД ВАШ', '$1 WIN THE ROUND']], [/^JIHOZLANING · B$/, ['ЗАКУПКА · B', 'BUY · B']], [/^(\d+) REYTING$/, ['$1 РЕЙТИНГ', '$1 RATING']],
  [/^(\d+) \/ (\d+) ONLAYN$/, ['$1 / $2 В СЕТИ', '$1 / $2 ONLINE']], [/^📞 (.+) qo‘ng‘iroq qilmoqda$/, ['📞 $1 звонит', '📞 $1 is calling']], [/^📞 (.+) — chaqirilmoqda…$/, ['📞 $1 — вызов…', '📞 $1 — calling…']], [/^🎙 (.+) — ulanmoqda…$/, ['🎙 $1 — подключение…', '🎙 $1 — connecting…']],
  [/^FPS past: grafika (.+) rejimiga o‘tkazildi\.$/, ['Низкий FPS: графика переключена на $1.', 'Low FPS: graphics switched to $1.']],
  [/^(.+) javob bermadi\.$/, ['$1 не отвечает.', '$1 did not answer.']], [/^(.+) band\.$/, ['$1 занят(а).', '$1 is busy.']], [/^(.+) qo‘ng‘iroqni rad etdi\.$/, ['$1 отклонил(а) звонок.', '$1 declined the call.']],
  [/^(.+) — sotib olindi\. INVENTARdan qurolga qo‘ying\.$/, ['$1 — куплено. Поставьте в ИНВЕНТАРЕ.', '$1 — purchased. Equip it in INVENTORY.']],
];

export function normalizeLang(l) {
  if (!l) return 'ru';
  const c = String(l).slice(0, 2).toLowerCase();
  if (c === 'ru' || c === 'be' || c === 'uk' || c === 'kk') return 'ru';
  if (c === 'uz') return 'uz';
  return 'en';
}

let lang = (() => {
  try {
    const yl = typeof window !== 'undefined' && window.ysdk?.environment?.i18n?.lang;
    if (yl) return normalizeLang(yl);
  } catch { /* ignore */ }
  try { const s = localStorage.getItem(KEY); if (LANGS[s]) return s; } catch { /* ignore */ }
  const n = (typeof navigator !== 'undefined' ? (navigator.language || '') : '').slice(0, 2);
  return n === 'ru' ? 'ru' : n === 'en' ? 'en' : 'uz';
})();
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

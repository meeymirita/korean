# Список картинок для нового дизайна: что сгенерировать и как

Файл для владельца: здесь всё, что нужно нарисовать (сгенерировать) для тёмно-розового дизайна, с готовыми подсказками (промптами). Код ждёт файлы **под теми же именами и в тех же папках**: положил новый файл на место старого, и сайт подхватит его сам, править код не нужно.
Решение владельца 2026-11-19: картинки делает владелец; в дизайне, который делает Claude, места под иллюстрации оставлены пустыми и перечислены в разделе «Где вернуть картинки».

## 0. Общие правила

- **Формат:** `.webp` с прозрачным фоном (для фонов `.webp` без прозрачности). Экспорт: качество 85–90.
- **Палитра:** винно-розовая, как в `urimal-landing.html`: тёмное вино `#2a0a18`, почти чёрный `#0b0508`, ярко-розовый `#ff6fae`, светло-розовый `#ffd1e3`, акцент `#ff9cc6`, глубокий малиновый `#c2186b`. Белый только для бликов.
- **Свет:** розовое свечение (glow) по контуру, мягкие блики, без жёстких чёрных контуров: картинки лежат на тёмном фоне.
- **Без текста и надписей** (кроме цифр там, где это помечено), без японских и китайских знаков (решение владельца), хангыль можно.
- **Один стиль на весь набор.** Генерируй пачкой в одном чате, начинай с одной и той же «шапки стиля» (ниже) и добавляй только предмет.
- Размер указан для файла, который кладётся в проект; генерируй в 2 раза больше и уменьшай.

### Шапка стиля A: стикеры и иконки (вставляй в начало каждого промпта)

```
Glossy kawaii sticker icon, soft rounded 3D shapes with a subtle inner glow, cute and minimal,
palette: deep wine #2a0a18, hot pink #ff6fae, pale pink #ffd1e3, raspberry #c2186b, small white highlights,
soft pink outer glow, no hard black outline, centered, transparent background, no text, no watermark.
Subject:
```

### Шапка стиля B: персонажи и сцены

```
Soft stylized 3D illustration, cinematic night mood, deep wine and near-black background tones (#0b0508, #2a0a18),
hot pink (#ff6fae) and pale pink (#ffd1e3) rim light and glow, cherry blossom petals, gentle bokeh,
cute friendly character design, consistent with the same character across images, no text, no watermark.
Subject:
```

### Шапка стиля C: фоны

```
Wide atmospheric background, dark wine and near-black gradient (#0b0508 to #2a0a18) with soft hot-pink (#ff6fae) light bloom
and blurred cherry blossoms, calm and quiet, large empty area in the center for interface, no characters, no text.
Subject:
```

## 1. Иконки интерфейса `frontend/src/assets/icons/` (44 файла)

Где: `<Icon name="…" />`, меню, быстрый доступ, ярлыки, магазин. Размер: **256×256**, стиль A. Имя файла: `<имя>.webp`.

| Файл | Что нарисовать | Размер |
|---|---|---|
| `arrows` | two curved arrows in a loop (repeat) | 256×256 |
| `back` | left arrow | 256×256 |
| `bell` | notification bell | 256×256 |
| `bread` | round loaf of bread (mascot "Хлебушек") | 256×256 |
| `bulb` | light bulb | 256×256 |
| `calendar` | calendar page | 256×256 |
| `chart` | bar chart | 256×256 |
| `chat` | speech bubble | 256×256 |
| `check` | check mark | 256×256 |
| `coin` | gold coin with a star | 256×256 |
| `fire` | flame (day streak) | 256×256 |
| `flag-kr` | small flag of South Korea (taegeuk, simplified) | 256×256 |
| `gear` | cog | 256×256 |
| `goldstar` | gold star | 256×256 |
| `key` | key | 256×256 |
| `lock` | padlock | 256×256 |
| `moon` | crescent moon | 256×256 |
| `notebook` | notebook | 256×256 |
| `party` | party popper | 256×256 |
| `picture` | framed picture | 256×256 |
| `plant-bloom` | plant in bloom with pink flower | 256×256 |
| `plant-bud` | plant with a bud | 256×256 |
| `plant-seed` | seed in soil | 256×256 |
| `plant-sprout` | young sprout | 256×256 |
| `plant-wilted` | wilted plant | 256×256 |
| `puzzle` | puzzle piece | 256×256 |
| `question` | question mark | 256×256 |
| `search` | magnifier | 256×256 |
| `shop-box` | gift box | 256×256 |
| `shop-chest` | treasure chest | 256×256 |
| `shop-double` | "x2" coin multiplier badge | 256×256 |
| `shop-fifty` | badge with "50" | 256×256 |
| `shop-hint` | one light bulb with a plus | 256×256 |
| `shop-hints` | three light bulbs (hint pack) | 256×256 |
| `shop-second` | clock with a plus (second chance) | 256×256 |
| `shop-shield` | shield with a heart | 256×256 |
| `shop-skip` | forward arrow (skip) | 256×256 |
| `shop-yuna` | girl character Yuna head sticker | 256×256 |
| `sprout` | sprout | 256×256 |
| `stopwatch` | stopwatch | 256×256 |
| `sun` | sun | 256×256 |
| `target` | dartboard with arrow | 256×256 |
| `user` | person silhouette | 256×256 |
| `wrench` | wrench | 256×256 |

Промпт: `<шапка A> <предмет из таблицы>`. Пример: «…Subject: flame, day streak symbol».

## 2. Иконки игр `frontend/src/assets/game/icons/` (28 файлов)

Где: страница «Игра на слова», карточки режимов. Размер: **256×256**, стиль A.

| Файл | Что нарисовать | Размер |
|---|---|---|
| `board` | game board with tiles | 256×256 |
| `book` | open book | 256×256 |
| `card` | flash card | 256×256 |
| `cat-q` | cat with a question mark | 256×256 |
| `clock` | clock | 256×256 |
| `comet` | comet | 256×256 |
| `croissant` | croissant | 256×256 |
| `dice` | dice | 256×256 |
| `dict` | dictionary book | 256×256 |
| `eraser` | eraser | 256×256 |
| `grammar` | book with a ruler (grammar) | 256×256 |
| `han` | hangul letter "한" on a tile | 256×256 |
| `heart` | heart | 256×256 |
| `hearts` | two hearts | 256×256 |
| `home` | house | 256×256 |
| `macaron` | macaron | 256×256 |
| `mail` | envelope | 256×256 |
| `pen` | pen | 256×256 |
| `pencil` | pencil | 256×256 |
| `rocket` | rocket | 256×256 |
| `sakura` | cherry blossom | 256×256 |
| `sparkle` | sparkles | 256×256 |
| `speech` | speech bubble with "ㄱ" | 256×256 |
| `star` | star | 256×256 |
| `sun` | sun | 256×256 |
| `telescope` | telescope | 256×256 |
| `trophy` | trophy | 256×256 |
| `wand` | magic wand | 256×256 |

## 3. Котики `frontend/src/assets/cats/` и `assets/game/cat-wow.webp`

Где: пустые экраны, подсказки (компонент `Cat.vue`). Размер: **512×512**, стиль B, один и тот же белый котёнок с розовыми щеками и розовым бантиком.

| Файл | Эмоция |
|---|---|
| `cats/cat-happy.webp` | радуется, глаза-дуги |
| `cats/cat-sad.webp` | грустит, ушки опущены |
| `cats/cat-think.webp` | думает, лапка у подбородка |
| `cats/cat-read.webp` | читает книжку |
| `cats/cat-water.webp` | поливает росток из лейки |
| `cats/cat-cheer.webp` | ликует, лапки вверх |
| `game/cat-wow.webp` | удивлён, большие глаза (341×360) |
| `home/dash/cat-wave.webp` | машет лапкой (350×400) |
| `home/dash/cat-sleep.webp` | спит клубком (400×360, сейчас не показывается) |

Промпт: `<шапка B> a small white kitten with pink cheeks and a pink bow, <эмоция>`.

## 4. Звания `frontend/src/assets/levels/rank-<N>.webp` (21 файл, 200×200)

Где: значок звания в кабинете, шапке игры, отчёте. Стиль A, **по одному значку-медали на звание**, чем выше звание, тем богаче и ярче свечение (от тусклой искры до сияющей вечности).

| Файл | Звание | Что нарисовать |
|---|---|---|
| `rank-1.webp` | Искра | tiny spark |
| `rank-5.webp` | Огонёк | small flame |
| `rank-10.webp` | Свеча | lit candle |
| `rank-15.webp` | Факел | torch |
| `rank-20.webp` | Звезда | five-point star |
| `rank-25.webp` | Луна | crescent moon |
| `rank-30.webp` | Рассвет | sunrise over horizon |
| `rank-35.webp` | Созвездие | constellation of connected stars |
| `rank-40.webp` | Солнце | radiant sun |
| `rank-45.webp` | Метеор | meteor with tail |
| `rank-50.webp` | Комета | comet |
| `rank-55.webp` | Северное сияние | aurora ribbons |
| `rank-60.webp` | Млечный Путь | milky way spiral band |
| `rank-65.webp` | Галактика | spiral galaxy |
| `rank-70.webp` | Туманность | nebula cloud |
| `rank-75.webp` | Сверхновая | supernova burst |
| `rank-80.webp` | Космос | planet with ring |
| `rank-85.webp` | Вселенная | swirling universe orb |
| `rank-90.webp` | Бесконечность | glowing infinity sign |
| `rank-95.webp` | Легенда | crown of stars |
| `rank-100.webp` | Вечность | radiant eternal flame crown with halo |

Промпт: `<шапка A> round medal badge, <что нарисовать>, the higher the rank the richer and brighter the glow`.

## 5. Юна (героиня) `frontend/src/assets/home/yuna*.webp`

Где: страницы раздела (сейчас убраны из дизайна, вернуть по списку в разделе 9). Один и тот же персонаж: девушка Юна, тёмные волосы с розовыми прядями, белая худи; стиль B.

| Файл | Размер | Сцена |
|---|---|---|
| `home/yuna.webp` | 1100×734 | сидит у окна с цветущей сакурой, рядом котик (главная, сейчас не используется) |
| `home/yuna-today.webp` | 1000×333 | широкая лента: Юна с чек-листом, фон тёмный, место справа пустое |
| `home/yuna-checklist.webp` | 1500×500 | широкая лента: Юна отмечает галочки |
| `home/yuna-review.webp` | 1600×534 | широкая лента: Юна повторяет карточки |
| `home/yuna-book.webp` | 1372×1146 | Юна с большой книгой (слова) |
| `home/yuna-garden.webp` | 550×1100 | вертикально: Юна в саду воспоминаний |
| `home/yuna-grammar.webp` | 1100×2200 | вертикально: Юна у доски с правилами |
| `game/yuna-sit.webp` | 1100×718 | Юна сидит, играет (страница игры) |
| `home/dash/bg-yuna.webp` | 1100×1005 | Юна на фоне главной раздела (карточка приветствия) |

Промпт: `<шапка B> Yuna, a young woman with dark hair and pink highlights in a white hoodie, <сцена>, wide empty dark area for interface`.

## 6. Быстрый доступ на главной раздела `frontend/src/assets/home/dash/q-*.webp` (6 файлов, 160×160)

`q-fire` (огонь), `q-notes` (заметки), `q-bread` (хлебушек), `q-arrows` (повторение), `q-sprout` (росток), `q-puzzle` (пазл). Стиль A.

## 7. Фоны

| Файл | Размер | Что |
|---|---|---|
| `game/bg.webp` | 1254×1254 (лучше 2400×1350) | вечерний храм среди облаков и сакуры, сумерки, розовое свечение (сейчас светлый день) |
| `upload/bg.webp` | 1672×941 | спокойный фон страницы загрузки картинок |
| `dict/bg.webp`, `dict/bg-sm.webp` | | **больше не нужны**: словарь переехал на общий фон, файлы удалить |

Промпт: `<шапка C> a quiet temple with pagoda roofs among clouds and cherry blossoms at dusk` (для `game/bg`), `<шапка C> blurred cherry blossom branches` (для `upload/bg`).

## 8. Музыкальный плеер `frontend/src/assets/player/` (27 файлов)

Стиль A, прозрачный фон. Размеры: кнопки и иконки **192×192**, обложки **512×512**, персонажи **512×512**.

| Файл | Что нарисовать |
|---|---|
| `control_play`, `control_pause` | треугольник «играть», две полоски «пауза» |
| `control_next_track`, `control_previous_track` | «вперёд» и «назад» |
| `control_shuffle`, `control_repeat` | перемешать, повтор |
| `control_volume`, `control_mute` | динамик с волнами, динамик перечёркнутый |
| `control_more`, `control_add`, `control_equalizer` | три точки, плюс, эквалайзер |
| `icon_music_note`, `icon_playlist`, `icon_headphones`, `icon_close`, `icon_download`, `icon_minimize` | нота, список, наушники, крестик, стрелка вниз, чёрточка |
| `headphones_decor`, `vinyl_music_decor` | украшение: наушники, винил |
| `character_01`, `character_17`, `character_21` | котик с наушниками, спящий котик, котик слушает |
| `cover_sakura_city`, `cover_namsan_tower`, `cover_seoul_palace`, `cover_moon_sakura`, `cover_sunset` | обложки: сакура над городом, башня Намсан, дворец в Сеуле, луна и сакура, закат |

## 9. Файлы вне `assets/` (кладутся в `frontend/public/`)

| Файл | Размер | Что |
|---|---|---|
| `og-image.png` | 1200×630 | превью ссылки: тёмный винный фон, розовое свечение, ✳︎ и слово «우리말» крупно, подпись «Тихое пространство для корейского» (текст допустим именно здесь) |
| `icon-512.png`, `icon-192.png`, `apple-touch-icon.png` | 512 / 192 / 180 | розовая ✳︎ на винном фоне `#2a0a18`, скруглённый квадрат, без прозрачности |
| `favicon-32.png` | 32×32 | то же, упрощённо |
| `favicon.svg` | вектор | розовая ✳︎ (уже подходит) |
| `tg/tg-login.png`, `tg-remind.png`, `tg-digest.png`, `tg-lesson.png`, `tg-backup.png`, `tg-alert.png`, `tg-study.png`, `tg-banner.png` | 1280×640 | баннеры Telegram, винный фон, розовое свечение, по центру значок темы (замок, колокольчик, свиток, книга, диск, восклицание, часы, ✳︎); после замены поднять `BANNER_VERSION` в `backend/src/notify/notify.service.ts` |

Промпт баннера: `<шапка C> 1280x640 banner, centered glossy pink icon of <значок>, empty space on the left and right`.

## 10. Скриншоты «О платформе» `frontend/src/assets/about/` (72 файла)

Не рисуются: собираются скриптом `node scripts/about-shots.mjs` на демо-данных после того, как все страницы получат новый вид (последний этап плана `docs/redesign-plan.md`). Пока на них старый светлый вид.

## 11. Где вернуть картинки (ведёт Claude, обновляется по ходу дизайна)

Картинки, убранные из вёрстки при переделке, записаны здесь: страница → место → файл. Когда файл нарисован, верни тег.

| Страница / компонент | Место | Файл |
|---|---|---|
| главная `/` | фон за заголовком (по макету его нет, оставлено как есть) | `home/yuna.webp` (не показывается) |
| «Сегодня» (`views/korean/TodayView.vue`), вкладка «Сегодня» | широкая лента вверху (`<img class="td-banner">`) | `home/yuna-today.webp` |
| «Сегодня», вкладка «Список» | Юна над списком (`<img class="td-yuna">`) | `home/yuna-checklist.webp` |
| «Слова» (`views/korean/WordsView.vue`) | Юна с книгой в шапке (`<img class="words-yuna">`) | `home/yuna-book.webp` |
| «Повторение» (`views/korean/ReviewView.vue`) | Юна рядом с заголовком (`<img class="rv-yuna">`) | `home/yuna-review.webp` |
| Игра на слова (`views/GameHomeView.vue`) | котик в меню (`<img class="gx-cat gx-cat-nav">`) | `game/cat-wow.webp` |
| Игра на слова | Юна сидит под списком игр (`<img class="gh-sit">`) | `game/yuna-sit.webp` |
| Игра на слова | фон страницы: сейчас винные пятна света из `shell-pink.css`; когда будет `game/bg.webp`, вернуть `import bg` и `:style="{ '--gx-bg': `url(${bg})` }"` | `game/bg.webp` |
| Главная раздела (`components/korean/DashboardHome.vue`) | картинка-подложка блоков «hero» и «quote» (`fallback`), котик у «Фразы дня» (`<img class="phrase-cat">`) | `home/dash/bg-yuna.webp`, `home/dash/cat-wave.webp` |
| Вся тема «Розовая» (`assets/shell-pink.css`) | фон `html` без картинки; в светлой теме по-прежнему `game/bg.webp` | `game/bg.webp` |

Иконки (`assets/icons`, `assets/game/icons`, `assets/home/dash/q-*`, плеер) в вёрстке оставлены: они маленькие и несут смысл (меню, кнопки). Положи новые файлы под теми же именами, старые заменятся.

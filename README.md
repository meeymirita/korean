<p align="center">
  <img src="public/Vue.png" alt="Vue.js" width="480">
</p>

# Магия воспоминаний
## Стек

- Vue 3 (Composition API, `<script setup>`)
- TypeScript
- Vite
- Pinia — хранилища меню и цитат
- Vue Router

## Запуск

```sh
npm install
npm run dev
```

Сборка и проверка типов:

```sh
npm run build
npm run preview
```

## Страницы

| Адрес | Что это |
| --- | --- |
| `/` | главная: меню, цитаты, счётчик дней с 1 июня |
| `/korean/today` | «Сегодня»: случайные слова, правило дня и задания |
| `/korean/words` | словарь с поиском по переводу, корейскому, чтению и примеру |
| `/korean/grammar`, `cheat`, `talk`, `hangul`, `alphabet`, `reading`, `sentences`, `numbers`, `review` | остальные разделы корейского |
| `/game` | игра на слова «Хлебушек» |

## Структура

```
public/                 картинки
src/
  assets/               base.css (главная), study.css (корейский и игра), fonts.css
  components/
    SideBar.vue         заголовок и меню главной
    DaysCounter.vue     счётчик дней с 1 июня
    korean/             карточки букв, окно грамматики, шапка раздела
  composables/          состояние окна грамматики
  data/
    menu.ts, quotes.ts  меню и цитаты главной
    alphabet.ts         буквы и таблица слогов
    korean/             словарь, грамматика, страницы-справочники, задания «Сегодня»
  game/                 данные, логика и разметка игры «Хлебушек»
  views/
    HomeView.vue        главная
    GameView.vue        игра
    korean/             страницы раздела «Корейский»
  router/index.ts       маршруты
```

## Как менять содержимое

- **Пункты меню** — `src/data/menu.ts`: `to` — внутренний адрес, `href` — внешняя ссылка в новой вкладке.
- **Новые слова** — массив `RAW` в `src/data/korean/dictionary.ts` (поля `n, k, r, t, s`) и категория в `CAT` в том же файле.
- **Грамматика** — массив `G` в `src/data/korean/grammar.ts`.
- **Дата отсчёта дней** — константа `START` в `src/components/DaysCounter.vue`.
- **Цитаты** — `src/data/quotes.ts`.
- **Автопереключение цитат** — константы `AUTOPLAY` и `INTERVAL` (секунды) в `src/components/QuoteBlock.vue`.

Сайт — одностраничное приложение, поэтому на хостинге все адреса должны отдавать `index.html`.

## Контакты

По всем вопросам — Telegram [@meeymirita](https://t.me/meeymirita).

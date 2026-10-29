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
| `/korean/progress` | прогресс: уровень, серия дней, цель дня, выученные слова, достижения, копия |
| `/korean/trainers` | тренажёры: «найди пару» и «напиши перевод» (слова, глаголы, прилагательные, вопросы) |
| `/korean/grammar`, `cheat`, `talk`, `hangul`, `alphabet`, `reading`, `sentences`, `numbers`, `review` | остальные разделы корейского (в «Словах» и «Примерах» предложение раскрывается в разбор) |
| `/game` | игра на слова «Хлебушек» |

## Структура

```
public/                 картинки
server/index.mjs        сервер прогресса (Node без зависимостей), данные в server/data/ (в git не попадает)
src/
  assets/               base.css (главная), study.css (корейский и игра), fonts.css
  components/
    SideBar.vue         заголовок и меню главной
    DaysCounter.vue     счётчик дней с 1 июня
    SideMenu.vue        меню с группами слева на главной
    GuideModal.vue      окно «Что здесь есть» со слайдером и быстрыми переходами
    korean/             карточки букв, окно грамматики, шапка раздела
  composables/          состояние окна грамматики
  stores/progress.ts    общий прогресс (очки, дни, слова), хранение в браузере и на сервере
  data/
    menu.ts, quotes.ts  меню и цитаты главной
    alphabet.ts         буквы и таблица слогов
    korean/             словарь, грамматика, справочники, задания «Сегодня», тренажёры,
                        разбор предложений (parse.ts) и их переводы (translations.ts)
    guide.ts            слайды и быстрые переходы для окна на главной
    levels.ts           40 уровней, звания, цель дня
    achievements.ts     достижения
  game/                 данные, логика, генератор предложений (build.ts) и разметка игры «Хлебушек»
  views/
    HomeView.vue        главная
    GameView.vue        игра
    korean/             страницы раздела «Корейский»
  router/index.ts       маршруты
```

## Прогресс и сервер

Каждый верный ответ (игра, тренажёры, «Сегодня») даёт очки; слово считается выученным после трёх верных ответов
подряд. Прогресс хранится в браузере, а при желании ещё и на сервере (`server/index.mjs`): один JSON-файл
`server/data/progress.json` и копии по дням в `server/data/backups/` (последние 30).

Запуск сервера (нужен Node, пакеты ставить не надо):

```sh
PROGRESS_TOKEN=придумай-секрет npm run server        # слушает 127.0.0.1:3001
```

В разработке `npm run dev` сам проксирует `/api` на этот сервер. На хостинге наружу его выставляет Caddy:

```
example.ru {
    handle /api/* {
        reverse_proxy 127.0.0.1:3001
    }
    handle {
        root * /путь/к/проекту/dist
        try_files {path} /index.html
        file_server
    }
}
```

Чтобы сервер работал постоянно: `pm2 start server/index.mjs --name progress` (переменную `PROGRESS_TOKEN` задать
в окружении pm2) или systemd-юнит с `Environment=PROGRESS_TOKEN=...`. Затем на странице «Прогресс» ввести тот же токен
и нажать «Подключить». Свежая версия (по `updated`) побеждает, после каждого ответа изменения уходят на сервер
через секунду-две. Файл `server/data/` не коммитится.

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

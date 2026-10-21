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

## Структура

```
public/              картинки (frieren.png, dona.jpg, Vue.png)
src/
  assets/base.css    глобальные стили
  components/
    SideBar.vue      заголовок и меню
    QuoteBlock.vue   слайдер цитат с автопереключением
    QuoteDots.vue    точки-индикаторы слайдера
    ContactBar.vue   плашка с контактом в Telegram
    icons/IconArrow.vue
  data/              данные: menu.ts, quotes.ts
  stores/            Pinia-хранилища, отдают данные из data/
  views/HomeView.vue главная страница
  router/index.ts    маршруты
```

## Как менять содержимое

- **Пункты меню** — `src/data/menu.ts`. Пункт без `href` остаётся заглушкой, с `href` открывает внешнюю ссылку в новой вкладке.
- **Цитаты** — `src/data/quotes.ts`, каждая цитата — пара «текст, пояснение».
- **Автопереключение цитат** — константы `AUTOPLAY` и `INTERVAL` (секунды) в `src/components/QuoteBlock.vue`.

## Контакты

По всем вопросам — Telegram [@meeymirita](https://t.me/meeymirita).

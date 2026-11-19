---
name: new-page
description: Добавить новую страницу на платформу 우리말 со всеми обязательными связками (SEO, крошки, справка, О платформе). Используй, когда просят новую страницу или раздел.
---

# Новая страница

Правка в одном месте требует правки во всех связанных: смотри карту «что менялось → где ещё это живёт» в скилле `after-change`.

Пути `src/...` от `frontend/`. Сначала коротко предложи вариант и дождись «давай».

1. Файл в `src/pages/` (тонкая обёртка над `views/`). Закрытая токеном: `definePageMeta({ private: true })`.
2. Запись в `src/data/seo.ts`: заголовок до 75 знаков, описание 60–190, закрытая страница с `noindex`. Sitemap и robots Nuxt строит сам; тег `yandex-verification` в `nuxt.config.ts` не удалять.
3. Пункт в `src/data/korean/crumbs.ts` (хлебные крошки).
4. Запись в шторку «Что здесь есть» (`src/data/guide.ts`); раздел в `src/data/korean/sections.ts`, если он в меню.
5. SSR: в модуле и в `setup` нельзя трогать `window`, `document`, `localStorage`, `matchMedia` (только в `onMounted`, обработчиках или под `import.meta.client`); состояние запроса в `useState`; случайное только от зерна (`withSeed`).
6. Запросы только `fetchT`; при SSR `useFetch` с `baseURL: runtimeConfig.apiBase` и `timeout`. Подтверждения `askConfirm`, опасное `askTokenDo`, результат `useToastStore`. Окна с `position: fixed` в `<Teleport to="body">`.
7. Состояние, которое переживает обновление: `usePersisted` или `useQueryParam`.
8. Дизайн по макетам: пастельный розово-голубой, Archivo / Noto Sans KR, без смайликов, название **우리말**. Не менять стек и дизайн.
9. Слайд и скриншот в «О платформе» (`src/data/about.ts`, `scripts/about-shots.mjs`, только на демо-данных), запись в `HISTORY`, `docs/home-and-theme.md`.
10. Проверка вёрстки: `TOKEN=… WIDTHS=320,390,768 node scripts/check-layout.mjs`, ссылки: `node scripts/check-links.mjs`. Дальше `after-change`.

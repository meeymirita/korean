# Сервер: NestJS + PostgreSQL (`backend/`)

База PostgreSQL 17 (`DATABASE_URL`), доступ через Prisma Client (`backend/prisma/schema.prisma`, миграции `backend/prisma/migrations/`, применяются при старте контейнера `prisma migrate deploy`); простые чтения и записи через модели, прежние запросы идут через `Db.all/get/run` (параметры `?` переводятся в `$1…`). Нужен Node 22.18+ или 24.12+. Слушает `127.0.0.1:3001` (в Docker `0.0.0.0` внутри контейнера, наружу только на loopback), его выставляет Caddy. Стек, запуск и обновление: `docs/docker.md`.

## Запуск и настройки
- `npm run server:build`, `npm run server`; в разработке `npm run server:dev`. Тесты сервера: `npm run test:nest` (и общие `tests/*.test.mjs` на настоящем сервере через `tests/_server.mjs`).
- В Docker настройки берутся из корневого `.env` (`bash scripts/init-env.sh`), при прямом запуске из `backend/.env` или окружения: `DATABASE_URL`, `REDIS_URL` (необязателен), `MEILISEARCH_URL` и `MEILISEARCH_MASTER_KEY` (необязательны), `TRUST_PROXY`, `PROGRESS_TOKEN` (обязателен, `openssl rand -base64 24`), `PORT`, `DATA_DIR`, почта `SMTP_*`,
  `BACKUP_*`, `REMINDER_MAIL_TO`, `OPENROUTER_API_KEY`, `DISABLE_2FA`, `SWAGGER`, `YADISK_*`, `OWNER_SESSION_HOURS` (`docs/disk-and-telegram.md`), `TELEGRAM_*` (`docs/telegram.md`).
- **`/api/health`** открыт: проверяет, что база читается (`200 {"ok":true}`, иначе `503`). На нём держится откат в `scripts/deploy.sh`.
- **Swagger:** `SWAGGER=1 npm run server` → `http://127.0.0.1:3001/api/docs`. Только локально: страница отдаётся мимо проверки токена, на боевом сервере `SWAGGER` не ставить.

## Устройство (`backend/src/`)
| Папка | Что делает |
|---|---|
| `main.ts`, `app.module.ts`, `config.ts` | запуск, модули, настройки и лимиты |
| `security.ts` | заголовки, лимиты частоты, блокировка подбора токена, таймауты |
| `db/` | соединение, **все таблицы (`SCHEMA`) и миграции**, ежедневная копия базы |
| `auth/` | вход по токену (`auth.guard.ts`, `@Public()`, `@Owner()`), повторный токен (`confirm.service.ts`), двухфакторный вход |
| `progress/` | прогресс: `POST /api/ops`, `GET /api/progress`; монетки и магазин (`coins.ts`, `shop.service.ts`, `docs/shop.md`) |
| `guests/`, `notes/`, `plans/`, `sets/` | гостевые токены, заметки, календарь и файлы, наборы «Сегодня» |
| `images/` | картинки: загрузка, миниатюры (`sharp`), назначение `kind`, очистка ненужных |
| `siteimg/`, `public/` | замена картинок сайта (режим редактирования); визитка `/me` |
| `chat/` | помощник-чат (`docs/chat.md`) |
| `digest/`, `reminders/`, `lesson/`, `mail/` | письма: подборка, напоминание заниматься (свои дни недели в `days`), напоминание о созвоне с учителем (день недели, время сообщения `time` и время самого созвона `callTime`; не смотрит на ответы за день); отправка и оформление (SMTP) |
| `notify/` | Telegram: отправка в темы группы, очистка, сообщение в General (`docs/telegram.md`) |
| `yadisk/`, `video/`, `pic/` | Яндекс.Диск (копии, зеркало картинок), раздача видео и картинок грамматики 302-ссылкой на Диск (`docs/disk-and-telegram.md`) |
| `jobs/`, `search/` | фоновые задачи (BullMQ или таймер), поиск Meilisearch |
| `dict/` | большой словарь: индекс krdict в Meilisearch, `/api/dict/search`, `list`, `folders`, `word/:слово`, `collections`, `collection/:slug` (подборки), `sitemap` (адреса слов и подборок для карты сайта), `visit` (учёт захода, открытый, до 600 записей в минуту) — всё открытое; `status`, `reindex`, `visits` (итоги заходов за период) — только владелец; подробно `docs/dict.md` |
| `admin/`, `logs/`, `events/` | просмотр базы, архив и статус копий (`docs/backup.md`), журналы, журнал событий |

## Таблицы базы
`meta` (очки, профиль, настройки, метки), `answers` (каждый ответ, `detail` JSON `{q, a, y, g, n}`: вопрос, верный ответ, что выбрал, правило, «как отвечал» до 600 знаков), `words` (статистика слова), `days`, `study_time`, `guests` (хэши токенов),
`notes`, `new_words` (записанные слова и заметки из формы на странице «Слова», не словарь), `images`, `plans`, `plan_files`, `today_sets`, `sessions` (сеансы после кода из письма), `site_images`, `coin_log` (уникальный `ref` против двойных выплат), `nb_items` (прежняя «Тетрадь», раздел убран 2026-11-05, данные в базе сохранены и ничем не используются), `events` (последние 2000), `dict_visits` (заходы на большой словарь и подборки: день, страница, человек или робот поисковика, имя сайта-источника; без адресов посетителей, старше 400 дней стирается).
Структуру меняют только миграцией Prisma (`npm --prefix backend run db:dev`, потом тест на копии данных), руками базу трогать не нужно. Перенос со старой SQLite выполнен 2026-11-05, его скрипты удалены (остались в истории git, `docs/docker.md`).

## API
Все запросы с `Authorization: Bearer токен`, кроме `/api/health`, `GET /api/public/*` и чтения `/api/site-images`. Роли: владелец делает всё; гость получает пустые ответы,
его записи игнорируются, картинки, база и токены ему закрыты (403); просроченный гостевой токен даёт 401 `expired`. Полный список со схемами: Swagger.
- `GET /api/progress`, `POST /api/ops` (пачка до 500 действий: `answer`, `profile`, `settings`, `time`, `round`, `mood`, `reset`, `import`; любое неверное отменяет пачку, 400;
  `reset`, `import` требуют `X-Confirm-Token`).
- `/api/new-words` (GET, POST, PUT `:id`, DELETE `:id`; только владелец; `POST/DELETE /api/new-words/token` создают и отзывают временный токен на 10 минут, которым можно только `GET /api/new-words`, остальное 403), `/api/notes`, `/api/images` (JPEG, PNG, GIF, WebP до 50 МБ, всего до 1 ГБ, тип по содержимому, SVG нельзя; `kind`: `gallery`, `note`, `cover`), `/api/plans`, `/api/sets`, `/api/guests`.
- `/api/session` (сеанс входа на `OWNER_SESSION_HOURS`), `/api/notify/*` (темы Telegram, `docs/telegram.md`), `/api/shop*`, `/api/chat`, `/api/digest`, `/api/reminder` (свои дни недели `days`), `/api/lesson` (напоминание о созвоне: день недели, время сообщения и время созвона), `/api/backup/*`, `/api/logs/app|caddy`, `/api/db/tables`, `/api/site-images*`, `/api/public/*`, `/api/2fa/*`.
- `GET /api/report/clock?days=`, `GET /api/report/weeks`: ответы по часу дня и «эта неделя vs прошлая» (владелец, для «Прогресс и аналитика» в кабинете).
  `GET /api/report/answers` без `source` — ответы по всем разделам сразу (общий «Дневник ошибок»).

## Защита
- Заголовки безопасности на каждый ответ (`nosniff`, `DENY`, CSP `default-src 'none'`, HSTS), `X-Powered-By` выключен. Отчёты о нарушении CSP страниц сайта принимает открытый `POST /api/csp-report` (в журнал событий, `docs/hosting.md`).
- **Подбор токена:** 10 неверных подряд с одного адреса блокируют адрес на 15 минут (429 даже с верным токеном). Заблокировал себя: подожди или `docker compose restart backend`.
- **Частота:** 600 запросов в минуту с адреса, загрузки картинок и создание гостей 40 в минуту. Адрес клиента берётся из `X-Forwarded-For` только от loopback (Caddy).
- **Таймауты:** заголовки 15 с, запрос 30 с, загрузка картинки 180 с; JSON до 4 МБ. Картинки: ограничение разрешения (защита от «бомб»), квота 1 ГБ.
- **Повторный токен** (`X-Confirm-Token`) для сброса, загрузки копии, создания гостя и очистки тем Telegram; неверный считается подбором.
- Временный токен входящих: `POST /api/new-words/token` (только владелец) выдаёт 48 hex-знаков на 10 минут, в `meta` ключ `inbox_token` хранит `{h: sha256, exp}`; проверка в `AuthGuard` после обычных токенов (`AuthService.isInboxToken`), маршруты помечены `@InboxRead`, метод только GET. Новый токен отменяет прежний, `DELETE .../token` отзывает. Постоянного токена в `.env` нет.
- Токен сравнивается без утечки по времени, гостевые токены хранятся хэшами (sha256).
- Зависимости: `webpack` и `multer` закреплены в `overrides` у `backend/package.json`; менял зависимости, проверь `npx npm@10 ci --dry-run` (старый npm на хостинге иначе падает).
  Раз в месяц `npm audit` и `npm outdated`.

## Двухфакторный вход (код из Telegram или письма)
Включается владельцем в «Настройки → Защита кодом из Telegram». После верного токена сервер просит код из 4 цифр: он приходит в тему «Вход» Telegram-группы (`docs/telegram.md`), запасом письмом.
- Без сеанса любой запрос получает `401 {"error":"2fa"}`; сайт показывает окно кода (`POST /api/2fa/send`, `/verify`), сеанс (живёт `OWNER_SESSION_HOURS` часов, по умолчанию 4; без этой настройки 30 дней; в базе хэш) идёт заголовком `Bearer <токен> <сеанс>`. Гостей это не касается.
- Код живёт 10 минут, одноразовый, 5 неверных попыток сжигают его, новое письмо не чаще раза в 30 секунд, неверный код считается подбором.
- Включение безопасно: код приходит на новый адрес, защита включается после подтверждения. Выключение и «выйти везде» просят токен ещё раз.
- Проверка почты: `npm --prefix backend run mail:check [адрес]`. **Аварийный выход:** `DISABLE_2FA=1` в `.env` проекта и `docker compose up -d backend`.
- Код: `auth/twofa.service.ts`, `mail/mail.service.ts`; сайт `composables/useTwoFa.ts`, `AuthGate.vue`, `cabinet/TwoFaBlock.vue`.

## Как смотреть, что в базе
На сервере `docker compose exec postgres psql -U korean korean`; ночные дампы в томе `app-data` (`/data/backups`, 30 штук).

**Сообщения в журнал (2026-11-10).** Сервисы пишут ошибки и предупреждения через `logError` и `logWarn` (`backend/src/log.ts`: Logger Nest с меткой `App`), а не через `console.*`. `console` оставлен в `main.ts` (до запуска Nest) и в двух строках `dict.service.ts` уровня log, который у Nest выключен. Молчаливые `.catch(() => undefined)` оставлены только там, где сбой ожидаем и ничего не ломает: удаление файла, которого может не быть, разбор чужого JSON, запись отчёта CSP, удаление старого сообщения Telegram, очередь личного поиска (ошибку пишет сама задача), необязательная навигация слова. Сбой синхронизации картинок с Диском, удаления файла на Диске и записи метки индекса словаря теперь пишется в журнал.

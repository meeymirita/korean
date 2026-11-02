# План: backend/ + frontend/ (для себя — как продолжать без остановки)

Этот файл в git (в корне репозитория), не в `правки/`: по нему продолжать работу в новой сессии, когда владелец
скажет «делай по плану без остановки» — без уточняющих вопросов, шаг за шагом, до полного рабочего состояния
(зелёные тесты, зелёная сборка, коммит и пуш на каждом смысловом шаге).

## Правило про долгие тесты (обязательно, прежде чем что-то запускать)

`npm test` однажды уже зависал на 7+ минут из-за одного файла без `after(close)` — процесс не падал, просто не
завершался, и это легко принять за «просто долго работает». **Правило:**

- Запускать `npm test` через `Bash` с `run_in_background: true` **напрямую** (без собственного `&` в команде —
  двойной фон даёт ложную нотификацию «завершено», когда на самом деле только запустился; это уже было, см.
  историю сессии 2026-11-02).
- Обычный полный прогон — 50–90 секунд. Если прошло **больше 2 минут** и нотификации о завершении всё ещё нет:
  1. `pgrep -fa "node --test"` — если процесс жив, смотреть `ps -o pid,etimes,pcpu -p <pid>`: **низкий %CPU
     (около 0) при большом `etimes`** — верный признак зависания, а не медленной работы.
  2. Смотреть последний файл в логе (`tail` лога прогона): зависший файл — тот, после которого нет строки
     завершения (`✔`/`✖ <имя> (мс)`).
  3. Открыть этот файл и проверить: если он импортирует `load` из `tests/_load.mjs` — есть ли `after(close)`.
     Это самая частая причина (готовый диагноз, не гадать).
  4. Убить зависший процесс (`kill <pid>`), исправить, перезапустить **только этот файл**
     (`node --test tests/ИМЯ.test.mjs`, можно с `timeout 60 ...` — на этой машине (Linux) `timeout` есть), и
     только потом снова весь `npm test`.
- Для разовой проверки одного файла всегда можно обернуть в `timeout N node --test tests/ИМЯ.test.mjs`, чтобы не
  ждать вручную.

## Статус

Шаг 1 (перенос файлов) сделан, закоммичен и запушен в `nuxt`: коммит `9aa37fc` «Split the project into backend/
and frontend/ folders». `npm test` — 518/518 зелёных, `npx vue-tsc --build` и `npm run build` из `frontend/` —
чисто. Подробности шага 1 — `docs/changelog.md`, запись «2026-11-02 (позже), перенос server/ → backend/ +
frontend/».

Текущая структура: `backend/` (NestJS, как был `server/`, свой `package.json`/`node_modules`), `frontend/`
(Nuxt-сайт, свой `package.json`/`node_modules`), в корне — тесты/`package.json` (только для тестов: `vite`,
`typescript`, `@types/node`; `pinia`/`vue` — симлинки на копии `frontend/node_modules` через
`scripts/link-test-deps.mjs`, запускается сам в `postinstall`, иначе у Pinia две раздельные копии и
`setActivePinia()` в тестах не действует — уже ловили как 127 упавших тестов), `docs/`, `scripts/`, `.github/`.

## Осталось (шаг 2, по порядку — не останавливаться между пунктами, коммит после каждого пункта отдельно)

### 1. `.github/workflows/ci.yml`
Сейчас: `cache-dependency-path` только `package-lock.json` + `server/package-lock.json`; один `npm ci` + `npm
--prefix server ci`; `npx vue-tsc --build` и `npm run build` запускаются из корня (а `tsconfig.json` и Nuxt теперь
в `frontend/`); `npm audit` только для корня и `server`.
Нужно:
- `cache-dependency-path`: `package-lock.json`, `frontend/package-lock.json`, `backend/package-lock.json`.
- Установка пакетов: `npm ci` (корень) && `npm --prefix frontend ci` && `npm --prefix backend ci`.
- Типы: `cd frontend && npx vue-tsc --build` (или `npm --prefix frontend run type-check`, но это `nuxt typecheck`,
  не то же самое — решить при реализации, что ближе к прежнему поведению; прежде был голый `vue-tsc --build`).
- Сборка: `npm --prefix frontend run build`.
- Тесты: `npm test` (не меняется, остаётся в корне).
- Уязвимости: добавить `npm --prefix frontend audit --omit=dev --audit-level=high` (раньше это покрывал общий
  корневой audit, теперь у frontend свои пакеты отдельно) вместе с уже бывшими корневым и `--prefix backend`.

### 2. `scripts/deploy.sh`
Переименовать `server` → `backend` везде; и важное отличие от простого rename:
- `BUILD_SITE_CMD` по умолчанию сейчас `npm run build` (для корня) → должно стать `npm --prefix frontend run
  build`.
- Строка 73 (возврат файлов блокировки, которые переписал npm на сервере): добавить `frontend/package-lock.json`
  в список рядом с `package-lock.json` и `backend/package-lock.json` (раньше про сайт был только корневой
  lock-файл, теперь у фронтенда свой).
- `changed '^server/'` → `changed '^backend/'`.
- **Новое, не было нужно раньше:** сейчас изменения в зависимостях сайта ловит только
  `changed '^(package\.json|package-lock\.json)$'` (это проверяет корневые — а они теперь только про тесты).
  Нужно отдельное условие на `frontend/package.json`/`frontend/package-lock.json`, которое запускает `npm
  --prefix frontend ci` перед сборкой сайта (сейчас такого шага вообще нет — сборка фронтенда просто предполагает,
  что `node_modules` уже свежие).
- `INSTALL_SERVER_CMD`/`BUILD_SERVER_CMD` — `--prefix backend`.
- Проверить тест `tests/deploy.test.mjs`: он тестирует скрипт в синтетической песочнице со своими `server/`,
  `src/` файлами — тест написан ОБЩО (имитирует смену файлов), поэтому может не потребовать изменений сам по
  себе, но перепроверить после правки `deploy.sh`, что тест всё равно зелёный (имена папок в тесте — его
  собственная фикстура, не обязаны совпадать с именами в репозитории).

### 3. `scripts/demo-seed.mjs` (не покрыт тестами, но ломается при реальном запуске)
- Строка `path.join(root, 'server/package.json')` → `'backend/package.json'`.
- Четыре строки `'src/assets/...'` → `'frontend/src/assets/...'`.

### 4. Документация (механический проход путей, без теста — проверять глазами)
`CLAUDE.md`, `README.md`, `docs/hosting.md`, `docs/server.md`, `docs/backup.md`, `docs/chat.md`,
`docs/home-and-theme.md`, `docs/progress.md`, `docs/shop.md` — заменить пути `server/` → `backend/` там, где речь
о текущей структуре (не трогать `docs/changelog.md`: там исторические записи, старые имена — часть истории,
корректны как есть). Отдельно поправить комментарии (чисто текст, не код, можно одним проходом):
`backend/src/{admin/backup-archive.service.ts, auth/twofa.service.ts, config.ts, digest/digest.service.ts,
logs/logs.service.ts, mail/mail.service.ts, mail/templates.ts, main.ts, reminders/reminder.service.ts}` — везде
просто упоминание «server/.env» в русском тексте (письма, консоль, javadoc), `frontend/nuxt.config.ts` (3 места) и
`frontend/src/{composables/useTwoFa.ts, data/coins.ts, data/history.ts, data/shop.ts, lib/chat.ts, lib/tags.ts,
stores/images.ts, stores/notebook.ts, stores/notes.ts, stores/plans.ts}` — там же, упоминания для справки.

### 5. Проверка и коммит каждого пункта отдельно
После **каждого** пункта (1–4): прогнать влияющие тесты (минимум `npm test` после пункта 1 и 2 — следить за
правилом про 2 минуты выше), затем `git add` только тронутых файлов и коммит с понятным сообщением, пуш. Не
собирать все 4 пункта в один коммит.

### 6. Хостинг (говорит владельцу, не часть git — напомнить в конце ответа)
- В `/etc/systemd/system/progress.service`: `ExecStart=` и `ReadWritePaths=` — `server/` → `backend/`.
- На диске: `server/.env` → `backend/.env`, `server/data/` → `backend/data/`.
- Путь к сборке сайта в службе `korean-web` теперь внутри `frontend/.output/`.
- После переноса на сервере: `systemctl daemon-reload && systemctl restart progress && systemctl restart
  korean-web`, проверить `/api/health` и главную.
- Дальше обычный `bash scripts/deploy.sh` (после того как он сам обновлён по пункту 2).

## Отдельно, не часть этого плана

Перед переносом была отложена в `git stash` незакоммиченная работа над браузерными тестами игр (rename
`tests/nuxt-ssr.test.mjs` → `tests/site.test.mjs`, новые `tests/_browser.mjs`, `tests/site/games.mjs`,
`tests/game-engine.test.mjs`, зависимость `happy-dom`, правки `TypingQuiz.vue`/`engine.ts`). Она ещё в
`git stash list` на момент записи этого плана. Её пути (`../server/...`, `cwd` для `nuxt build`) нужно поправить
под `backend/`/`frontend/` после `git stash pop`, прежде чем эта работа снова пройдёт тесты — отдельная задача,
не блокирует и не входит в пункты 1–6 выше.

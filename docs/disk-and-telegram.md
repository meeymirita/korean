# Яндекс.Диск, Telegram и вход на 4 часа

Сделано 2026-11-06. Здесь собрано, что где лежит, как устроено и что делать при поломке. Ключи и токены в документ и в репозиторий не вносятся (только имена переменных).

## 1. Переменные (корневой `.env` на сервере, `/var/sites/korean/.env`)

В `docker-compose.yml` они проброшены в контейнер `backend`; после правки `.env` нужно `docker compose up -d` (или `bash scripts/deploy.sh`). Образец: `.env.example`.

| Переменная | Что это |
|---|---|
| `YADISK_TOKEN` | OAuth-токен Яндекса (начинается с `y0__`) с правом `cloud_api:disk.app_folder`. Получить: `https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID приложения korean>` и взять значение после `#access_token=`. Client secret для работы не нужен. |
| `YADISK_ROOT` | папка внутри «Приложения/korean»; **пусто** (всё лежит в корне) |
| `YADISK_KEEP` | сколько последних копий хранить, по умолчанию 14 |
| `TELEGRAM_BOT_TOKEN` | токен бота `@yunaYrima_bot` (из @BotFather, перевыпуск командой `/revoke`) |
| `TELEGRAM_CHAT_ID` | число, чат владельца (узнать: написать боту `/start`, открыть `https://api.telegram.org/bot<токен>/getUpdates`, взять `message.chat.id`) |
| `TELEGRAM_GROUP_ID` | число `-100…`, группа с темами (форум); бот в ней администратор с правом «Управление темами». Пусто = всё в личный чат |
| `TELEGRAM_TOPIC_LOGIN`, `_REMIND`, `_DIGEST`, `_LESSON`, `_BACKUP`, `_ALERT` | номера тем группы (Вход 3, Напоминания 9, Подборка слов 11, Созвон 13, Копии 15, Тревоги 17) |
| `TELEGRAM_LOGIN_TO_GROUP` | `1` = код входа тоже в тему «Вход»; по умолчанию код только в личном чате (группу видят все участники) |
| `TELEGRAM_BANNER_BASE` | откуда Telegram берёт баннеры, по умолчанию `https://korean.meeymirita.ru` |
| `OWNER_SESSION_HOURS` | сколько часов живёт вход по токену, по умолчанию 4, `0` выключает |
| `BACKUP_PASSPHRASE` | пароль шифрования архивов (хранить отдельно от сервера, без него архив не открыть) |
| `SMTP_*`, `BACKUP_MAIL_TO`, `REMINDER_MAIL_TO` | почта, теперь только запасной путь |

Строка `SMTP_FROM=우리말<...>` содержит `<`: `source .env` в `bash` на ней падает, это нормально, Docker Compose её читает. Значения из `.env` читать так: `grep '^ИМЯ=' .env | cut -d= -f2-`.

## 2. Что лежит на Диске (Приложения → korean, корень)

```
Копия 2026-11-06 21-03/        одна папка на каждую копию, дата и время в конце названия (хранится 14 последних)
   Весь сайт/korean-….tar.gz.enc    полный архив: база, картинки, файлы календаря, настройки, .env, конфиги (шифрование BACKUP_PASSPHRASE)
   База и env/db-env-….tar.gz.enc   только база (app.dump) и .env, тоже зашифровано
   Картинки/…                       копия живой папки «Картинки» (копируется прямо на Диске, без загрузки)
Картинки/                      живая плоская папка: все картинки и файлы календаря, картинки сайта, обложка визитки (имена уникальны)
korean_video/                  44 видеоурока: lesson-01.mp4 … lesson-30.mp4, lesson-16-1/2, part2-01 … part2-13 (залиты владельцем руками)
korean_grammar/                23 картинки карточек грамматики: lesson-1…10.webp и own-<id>.webp
проверка связи.txt             создаётся кнопкой «Проверить отправку»
```
Запасная копия `korean_grammar` лежит у владельца на компьютере (`~/Desktop/korean_grammar`), видео в `~/Movies/Korean-videos/`.

Как открыть архив: `docs/backup.md` (команды `openssl enc -d …` и `tar`). Части для почты склеиваются `cat`, на Диск архив идёт целиком.

## 3. Как это работает

**Копии (`backend/src/admin/backup-archive.service.ts`).**
Раз в сутки после 4 утра по времени сервера и по кнопке «Сделать архив и отправить» (кабинет → Настройки → Резервные копии): `pg_dump` + файлы → `tar.gz` → шифрование → загрузка на Диск в новую папку «Копия …» (`backupFolder()` в `yadisk.service.ts`), потом копирование «Картинки» на самом Диске и удаление старше 14 копий.
Почта используется только если Диск не настроен или не принял архив. Сбой Диска шлёт сообщение в Telegram (`backupMail` вид `disk-fail`). Ночная копия на самом сервере (`scripts/backup.sh`, `/var/backups/korean`) работает как раньше.

**Картинки и файлы.** Каждая загрузка (картинки владельца, файлы календаря, картинки сайта, обложка визитки) сразу копируется в живую папку «Картинки» (`YaDiskService.mirror`), удаление тоже. При старте сервера через минуту и раз в час `syncMedia()` докладывает всё, чего на Диске нет (вручную: `POST /api/backup/media-sync` от владельца). Если файла «Картинки» нет на сервере, он скачивается с Диска (`restore`, пока только для раздела «Картинки»; для файлов календаря, картинок сайта и обложки автоматического восстановления нет).
Миниатюры на Диск не идут, они пересоздаются из оригинала.

**Видео.** Сайт открывает `/video/<имя>.mp4`; Caddy перенаправляет `/video/*` на `/api/video/*` (`backend/src/video/video.controller.ts`), сервер отвечает 302 на временную ссылку Диска (кэш ссылки 20 минут), браузер качает прямо с Диска, перемотка работает.
Блок в `/etc/caddy/Caddyfile`:
```
handle_path /video/* {
    rewrite * /api/video{path}
    reverse_proxy 127.0.0.1:3001
}
```
Старая папка `/var/sites/korean-video` больше не нужна (можно удалить). Откат раздачи: вернуть в блок `root * /var/sites/korean-video`, `header Cache-Control "public, max-age=86400"`, `file_server`.

**Картинки грамматики.** `frontend/src/data/korean/grammarPhotos.ts` держит список имён `KEYS` и строит адрес `/api/pic/grammar/<имя>.webp` (`backend/src/pic/pic.controller.ts`, тот же приём: 302 на Диск, папка `korean_grammar`). В репозитории картинок больше нет.
Заменить картинку: положить на Диск в `korean_grammar` файл с тем же именем (`own-<id>.webp`, `lesson-N.webp`, ширина около 1200, формат webp); сменится через 10–20 минут, деплой не нужен.
Новая картинка к новой карточке: файл в `korean_grammar` и имя в `KEYS`, потом пуш. Картинку «하고» заменили так: PNG → webp через `sharp` (`resize width 1280`, `quality 82`) → в `korean_grammar/own-hago.webp`.

**Уведомления в Telegram (`backend/src/notify/notify.service.ts`).**
Код входа, напоминание, подборка слов, «Сегодня созвон», тревоги о копиях. Каждое письмо в `backend/src/mail/templates.ts` возвращает и версию для Telegram (поле `tg`: шапка `✳︎ 우리말`, заголовок, текст, врезка, кнопка-ссылка; код входа в `<code>` копируется нажатием).
Порядок: Telegram; если он не отвечает или не настроен, письмо (нужны `SMTP_*` и адрес). Письма с вложением (архив при запасной почте) идут только по почте.
Двухфакторная защита с Telegram не просит адрес почты: сохраняется метка `telegram`, на экране входа пишется «Telegram».
**Группа с темами.** Каждое письмо отдаёт `topic` (`login`, `remind`, `digest`, `lesson`, `backup`, `alert`; тревоги о копиях и «архив слишком большой» идут в `alert`). Если заданы `TELEGRAM_GROUP_ID` и номер темы, сообщение уходит в эту тему (`message_thread_id`) фото-баннером `/tg/tg-<тема>.png` с подписью и кнопкой (подпись до 1000 знаков, длиннее: баннер отдельно, потом текст). Нет баннера на сайте или Telegram его не скачал: уходит обычное текстовое сообщение. Темы не заданы: личный чат, как раньше.
Баннеры (1280×640) лежат в `frontend/public/tg/` (`tg-login.png`, `tg-remind.png`, `tg-digest.png`, `tg-lesson.png`, `tg-backup.png`, `tg-alert.png`) и появляются после деплоя. Номера тем узнать: написать название в каждую тему и прочитать `getUpdates` (поле `message_thread_id`; название темы в нём устаревает после переименования). Проверка тем: на сервере `node scripts/telegram-topics-test.mjs` (по одному сообщению в каждую тему с её названием).
Для тестов: `TELEGRAM_DUMP_FILE=путь` вместо отправки пишет JSON в файл.

**Вход на 4 часа (`backend/src/auth/`).**
При `OWNER_SESSION_HOURS` > 0 один токен кабинет не открывает: сервер на `POST /api/session` выдаёт сеанс (таблица сессий) на эти часы, дальше каждый запрос идёт с «токен сеанс» (`bearer` в `progress.ts`). Истёк сеанс: сервер отвечает `{error:'session'}`, сайт закрывает доступ с сообщением «сеанс закончился, введите токен снова». С включённой защитой кодом сеанс выдаётся за код и живёт столько же, по истечении сайт просит новый код.
Гостевые токены не затронуты. Скрипты с голым токеном (`scripts/demo-seed.mjs`, `check-layout.mjs`) не работают на сервере с этой настройкой: для них запускай локальный сервер без `OWNER_SESSION_HOURS` (по умолчанию `0` вне Docker).

**Прочее, сделанное в тот же день.**
- Из Caddy убрана строка `@assets … immutable`: Caddy навешивал её и на 404/502 во время деплоя, браузеры запоминали ошибку на год. Nuxt сам ставит правильный заголовок на найденные файлы.
- `frontend/src/plugins/chunk-reload.client.ts`: при ошибке «Failed to fetch dynamically imported module» после выкладки страница один раз перезагружается.

## 4. Проверка и поломки

| Симптом | Что смотреть |
|---|---|
| в кабинете «Диск ✗» или в Telegram «Копия не легла на Яндекс.Диск» | `YADISK_TOKEN` (проверка: `curl -s -H "Authorization: OAuth $Y" https://cloud-api.yandex.net/v1/disk`, `$Y` из `.env`), место на Диске (112 ГБ), `docker compose logs backend --tail 50 \| grep -i диск` |
| `/api/video/…` или `/api/pic/grammar/…` отвечает 404 | нет файла или папка названа не так (`korean_video`, `korean_grammar`, в корне, без вложенной папки), не выложен свежий деплой |
| `/video/…` 404 или не играет | блок `handle_path /video/*` в Caddyfile, `caddy validate`, `systemctl reload caddy`; откат на `Caddyfile.bak2` |
| уведомление не пришло в Telegram | `getMe` с токеном бота, `TELEGRAM_CHAT_ID`, написан ли боту `/start`; сообщение уйдёт письмом, если настроена почта |
| после деплоя «500 … dynamically imported module» | старая вкладка; обновить страницу, плагин `chunk-reload` делает это сам |
| после деплоя пришлось вводить токен | так задумано: сеансы вне срока не живут, а новая сборка перезапускает вход |

Проверить Диск и бота без вывода значений:
```
Y=$(grep '^YADISK_TOKEN=' .env | cut -d= -f2-)
B=$(grep '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
curl -s -H "Authorization: OAuth $Y" https://cloud-api.yandex.net/v1/disk | grep -o '"total_space":[0-9]*'
curl -s "https://api.telegram.org/bot$B/getMe" | grep -o '"username":"[^"]*"'
```
Проверить, что переменные дошли до контейнера: `docker compose exec backend sh -c 'for v in YADISK_TOKEN TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do [ -n "$(printenv $v)" ] && echo "$v задан" || echo "$v ПУСТО"; done'`.

## 5. Где код

| Что | Файл |
|---|---|
| работа с Диском (загрузка, скачивание, копирование, список, удаление, зеркало, `syncMedia`) | `backend/src/yadisk/yadisk.service.ts` |
| копии на Диск, чистка старых | `backend/src/admin/backup-archive.service.ts`, `backup-status.controller.ts` |
| видео, картинки грамматики | `backend/src/video/`, `backend/src/pic/` |
| Telegram и запасная почта | `backend/src/notify/notify.service.ts`, `backend/src/mail/templates.ts` |
| сеансы входа | `backend/src/auth/` (`auth.service.ts`, `auth.guard.ts`, `session.controller.ts`, `twofa.service.ts`) |
| блоки кабинета | `frontend/src/components/cabinet/` (`BackupBlock`, `TwoFaBlock`, `ReminderBlock`, `DigestBlock`, `LessonBlock`), окно входа `frontend/src/components/AuthGate.vue` |
| список картинок грамматики | `frontend/src/data/korean/grammarPhotos.ts` |
| загрузка видео с компьютера | `scripts/upload-videos.mjs` (токен из окружения или `.env`) |
| тесты | `backend/test/yadisk.service.spec.ts`, `notify.service.spec.ts`, `pic.controller.spec.ts`, `tests/owner-session.test.mjs` |

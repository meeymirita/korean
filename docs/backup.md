# Резервные копии

Два слоя: **полный архив** (по кнопке и каждый день, уходит на почту) и **ночная копия** на самом сервере.

## 1. Полный архив на почту
В архиве: снимок PostgreSQL (`app.dump`, формат `pg_dump`), картинки (`uploads`, `thumbs`), файлы календаря (`docs`), обложка визитки (`public`), заменённые картинки сайта (`site`) и `.env` проекта (в Docker корневой `.env` смонтирован в контейнер).
Всё сжато и **зашифровано** паролем `BACKUP_PASSPHRASE` (AES-256, `openssl`).

Настройка (один раз, в `.env` проекта, значения не вставлять в чат и git):
- `BACKUP_PASSPHRASE=длинная-фраза` (`openssl rand -base64 30`). **Сохрани у себя отдельно** (менеджер паролей): без неё архив не открыть, и сервер её не восстановит.
- Письма идут на почту двухфакторной защиты, другой адрес: `BACKUP_MAIL_TO`. Нужны рабочие `SMTP_*`.
- Потом `docker compose up -d` (пересоздаст `backend` с новыми значениями). В «Настройки → Резервные копии»: **«Проверить отправку»** шлёт короткое письмо, **«Сделать архив и отправить»** собирает архив (видны этапы).
- Каждый день сервер делает то же сам после 4 утра. `BACKUP_AUTO=0` выключает, `BACKUP_EVERY_DAYS=7` раз в неделю. Через 3 дня без письма в кабинете жёлтая плашка.
- На сервере хранятся два последних архива в `/data/export` (том `app-data`); на почту письмом с вложением до 18 МБ, больший режется на части (до 5 писем), если не помещается совсем, письмо без вложения и файл остаётся на сервере.

**Как открыть архив:**
```
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in korean-ДАТА.tar.gz.enc -out korean.tar.gz
tar -xzf korean.tar.gz
```
Части сначала склей: `cat korean-ДАТА.tar.gz.enc.part* > korean-ДАТА.tar.gz.enc`. Неверный пароль: `bad decrypt`. Внутри `app.dump`, `server.env` (это `.env` проекта), `manifest.txt`, `backup.md`, `docker.md`, `uploads`, `docs`, `thumbs`, `site`, `public`. Архивы, сделанные до перехода на Docker, содержат `app.db` (SQLite): их переносит `scripts/import-dump.sh` (`docs/docker.md`).
Проверить базу, не трогая сайт: `pg_restore --list app.dump | head`.
После проверки **удали распакованное** (в `server.env` токен и пароли).

**Восстановление на новом сервере:** поставить Docker, `git clone`, вернуть `server.env` как `.env` в корне проекта, `docker compose up -d` (база создастся пустой), затем `docker compose stop frontend backend`, `docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U korean -d korean < app.dump`, файлы `uploads docs thumbs public site` положить в том `app-data` (`docker compose cp ПАПКА/uploads backend:/data/` и так для каждой, потом `docker compose exec -u root backend chown -R node:node /data`), `docker compose up -d`. Подробно: `docs/docker.md`.

## 2. Ночная копия на сервере
`scripts/backup-docker.sh` запускает `scripts/backup.sh` внутри контейнера `backend`: снимок PostgreSQL (`pg_dump` с проверкой `pg_restore --list`), файлы жёсткими ссылками (одинаковые за разные дни хранятся один раз), затем копирует результат и `.env` на сервер.
Хранит 14 последних копий в `/var/backups/korean`, итог пишет в `backup-status.json` (его показывает кабинет) и `backup.prom` (Grafana). Переменные: `KEEP`, `OFFSITE_RSYNC` в `.env`, `BACKUP_HOST_DIR` в `/etc/korean-backup.env`.
Включить (от root): `sudo bash scripts/install-backup-timer.sh --now` (сначала можно `--print`: покажет службу и таймер, ничего не ставя; таймер в 03:30, `systemctl status korean-backup.timer`).
Копия не удалась или не делалась больше 36 часов: сервер сам пришлёт письмо (проверка раз в час, одно письмо на случай). Копии вне сервера ещё не настроены (когда архив перерастёт почту, подключить облако через `rclone`).

## Что показывает кабинет
| Сообщение | Что делать |
|---|---|
| не задан пароль архива / некуда отправлять | вписать `BACKUP_PASSPHRASE`, настроить почту, перезапустить службу |
| «Почта ✗: …» | проверить `SMTP_*`: `npm --prefix backend run mail:check` |
| «Копия сделана более 30 часов назад» | проверить таймер: `systemctl status korean-backup.timer` или установить его |
| «Архив не приходил на почту уже N дн.» | проверить почту и спам, нажать «Проверить отправку», при необходимости «Сделать архив и отправить» |

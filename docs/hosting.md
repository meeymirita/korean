# Хостинг владельца (настроено 2026-10-29, работает)

- Сервер Ubuntu (`root@se-40678`), проект в `/var/sites/korean` (новый каталог), сайт `https://korean.meeymirita.ru` (отдельный блок в Caddy,
  A-запись `korean` в DNS). Главная `meeymirita.ru` — другой проект (`/var/sites/meeymirita_start_page`).
  Владелец сам заходит по SSH; мне доступа нет, поэтому команды ему даём текстом.
- Обновление сайта: `git pull` → `npm run build` (папка `dist`). Сервер прогресса перезапускать только если менялся
  `server/index.mjs`: `systemctl restart progress`.
- **Caddy** (`/etc/caddy/Caddyfile`, копия до правки `Caddyfile.bak`), блок сайта:
  `encode zstd gzip`, `handle /api/* { reverse_proxy 127.0.0.1:3001 }`, `handle { root * …/dist; try_files {path} /index.html; file_server }`.
  `try_files` обязателен для SPA (иначе прямые ссылки на `/korean/...` дают 404). После правки:
  `caddy validate --config /etc/caddy/Caddyfile` и `systemctl reload caddy`.
- **Сервер прогресса** — служба systemd `progress` (`/etc/systemd/system/progress.service`: `WorkingDirectory=` папка
  проекта, `ExecStart=/usr/bin/node server/index.mjs`, `Restart=always`, автозапуск включён). pm2 на сервере нет
  (владелец не ставил). Токен лежит в `server/.env` на сервере (не в git, права 600); данные в `server/data/`
  (`progress.json` и `backups/`). Диагностика: `systemctl status progress`, `journalctl -u progress -n 20`,
  `curl http://127.0.0.1:3001/api/health`, снаружи `curl https://meeymirita.ru/api/health`. Подключение проверено:
  на странице «Прогресс» статус «подключён · сохранено на сервере».
- **Как давать владельцу команды для терминала:** его терминал переносит длинные строки и портит вставку.
  Давай короткие команды (до ~70 символов), многострочные файлы собирай серией `echo '…' >> $F`, а не `cat <<EOF`
  (отступы при копировании ломают `EOF`), не вставляй команды с отступами в начале строк. Просить показать вывод
  (`cat`, `status`), прежде чем править чужой конфиг (в Caddyfile могут быть другие сайты).
- **Модули сервера** (`server/`): `index.mjs` (запуск и маршруты), `config.mjs` (`.env`, пути, лимиты), `http.mjs` (ответы,
  тело запроса), `storage.mjs` (запись и копии), `guests.mjs` (гостевые токены), `notes.mjs` (заметки владельца). Команда запуска не менялась. Гостевые токены
  лежат в `server/data/guests.json`, заметки в `server/data/notes.json` (оба в git не попадают; копии заметок в `backups/`). После `git pull`, который меняет что-то в `server/`, обязательно
  `systemctl restart progress`.
- **Токен владельца** создать так: `openssl rand -base64 24` (подсказка есть в `server/.env.example`).

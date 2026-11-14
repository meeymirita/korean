-- Музыкальный плеер: список песен владельца (сами файлы лежат на Яндекс.Диске, папка korean_music). Только новая таблица: прежний код после отката работает.
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file TEXT NOT NULL,
  cover TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  size BIGINT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'upload',
  created BIGINT NOT NULL
);

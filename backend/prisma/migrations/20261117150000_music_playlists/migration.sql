-- Плейлисты музыкального плеера. Только новая таблица: прежний код после отката работает.
CREATE TABLE IF NOT EXISTS music_playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tracks TEXT NOT NULL DEFAULT '[]',
  created BIGINT NOT NULL,
  updated BIGINT NOT NULL
);

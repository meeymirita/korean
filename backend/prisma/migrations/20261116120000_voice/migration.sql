-- Голосовой собеседник: разговоры и их расшифровки (звук не хранится). Только новые таблицы: прежний код после отката работает.
CREATE TABLE IF NOT EXISTS voice_sessions (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  started BIGINT NOT NULL,
  ended BIGINT,
  seconds INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS voice_sessions_day ON voice_sessions (day);
CREATE TABLE IF NOT EXISTS voice_messages (
  id BIGSERIAL PRIMARY KEY,
  session TEXT NOT NULL,
  t BIGINT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS voice_messages_session ON voice_messages (session);

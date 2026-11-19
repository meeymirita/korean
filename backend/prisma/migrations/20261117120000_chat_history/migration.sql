-- Помощник-чат: история чатов (раньше переписка жила только в браузере). Только новые таблицы: прежний код после отката работает.
CREATE TABLE IF NOT EXISTS chat_convs (
  id TEXT PRIMARY KEY,
  started BIGINT NOT NULL,
  updated BIGINT NOT NULL,
  title TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS chat_convs_updated ON chat_convs (updated);
CREATE TABLE IF NOT EXISTS chat_msgs (
  id BIGSERIAL PRIMARY KEY,
  conv TEXT NOT NULL,
  t BIGINT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_msgs_conv ON chat_msgs (conv);

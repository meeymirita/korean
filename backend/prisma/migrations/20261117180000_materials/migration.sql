-- Присланные материалы (тетради, учебник, задания Леры). Только новая таблица: прежний код после отката работает.
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  items TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  created BIGINT NOT NULL
);

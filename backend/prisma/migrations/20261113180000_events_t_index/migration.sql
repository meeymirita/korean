-- Индекс по времени для журнала событий (только добавление: прежний код работает).
CREATE INDEX IF NOT EXISTS events_t ON events (t);

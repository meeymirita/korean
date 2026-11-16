-- Голосовой собеседник: разбор разговора (текст отчёта). Только новый столбец: прежний код после отката работает.
ALTER TABLE voice_sessions ADD COLUMN IF NOT EXISTS review TEXT;

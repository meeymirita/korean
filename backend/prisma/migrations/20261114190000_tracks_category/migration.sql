-- Музыкальный плеер: вкладка песни («quiet»: тихая музыка, «nightcore»). Только новый столбец: прежний код после отката работает.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'quiet';

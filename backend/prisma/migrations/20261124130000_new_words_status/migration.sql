-- Отметка «разобрано» у слов во «Входящих». Только новый столбец со значением по умолчанию: прежний код после отката работает.
ALTER TABLE new_words ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

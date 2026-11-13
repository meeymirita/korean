-- Закрепление заметок, корзина на 30 дней для заметок и картинок и напоминание по заметке. Только новые столбцы: прежний код после отката работает.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS deleted_at BIGINT;
-- Напоминание по заметке в Telegram: время по часам сервера и отметка отправки.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS remind_at TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS remind_sent BOOLEAN NOT NULL DEFAULT false;

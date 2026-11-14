-- Ручной порядок заметок (перетаскивание). Только новый столбец: прежний код после отката работает.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS pos INTEGER;

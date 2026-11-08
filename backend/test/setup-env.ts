// Окружение для тестов Nest: свой каталог данных и токен. Выполняется до загрузки src/config.ts (он читает env при импорте).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nest-jest-'))
process.env.PROGRESS_TOKEN = 'jest-owner-token-0123456789'
process.env.INBOX_TOKEN = 'jest-inbox-token-abcdef0123456789'
process.env.OPENROUTER_API_KEY = ''
process.env.REMINDER_TICK_MS = '3600000'

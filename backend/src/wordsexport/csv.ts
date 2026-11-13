/** Сборка CSV «Мои слова» (чистые функции, без базы). */

export const WORDS_CSV_HEAD = ['Корейский', 'Чтение', 'Перевод', 'Очки', 'Верных', 'Ошибок', 'Выучено'] as const

export interface WordsCsvRow {
  ko: string
  reading: string
  ru: string
  /** очки слова: серия верных ответов подряд (верно +1, ошибка −1, выучено на 5) */
  score: number
  ok: number
  bad: number
  known: boolean
}

/** Поле CSV: в кавычки, если есть запятая, кавычка, перенос или край-пробел; кавычка удваивается; ячейка не должна читаться Excel как формула. */
export function csvField(v: string | number): string {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Текст файла: BOM UTF-8 (Excel узнаёт кодировку), строки через CRLF, первая строка заголовок. */
export function buildWordsCsv(rows: WordsCsvRow[]): string {
  const lines = [WORDS_CSV_HEAD.map(csvField).join(',')]
  for (const r of rows) lines.push([r.ko, r.reading, r.ru, r.score, r.ok, r.bad, r.known ? 'да' : 'нет'].map(csvField).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

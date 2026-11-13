import { Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { buildWordsCsv, type WordsCsvRow } from './csv.js'
import { EXPORT_VOCAB } from './vocab.js'

/** «Выучено» с серии 5 (как KNOWN_STREAK в progress.service.ts и stores/progress.ts). */
const KNOWN_STREAK = 5
const VOCAB = new Map(EXPORT_VOCAB.map(([k, r, t], i) => [k, { r, t, i }]))

/**
 * Строки «моих слов»: слова, по которым у владельца есть ответы (таблица `words`, в порядке словаря сайта STUDY),
 * затем слова, записанные им на сайте (`new_words`, ещё без ответов).
 */
export function collectRows(
  stats: { word: string; ok: number; bad: number; streak: number }[],
  written: { ko: string; reading: string; ru: string }[],
): WordsCsvRow[] {
  const order = (w: string) => VOCAB.get(w)?.i ?? Number.MAX_SAFE_INTEGER
  const rows: WordsCsvRow[] = [...stats]
    .sort((a, b) => order(a.word) - order(b.word) || a.word.localeCompare(b.word))
    .map(s => ({ ko: s.word, reading: VOCAB.get(s.word)?.r ?? '', ru: VOCAB.get(s.word)?.t ?? '', score: s.streak, ok: s.ok, bad: s.bad, known: s.streak >= KNOWN_STREAK }))
  const seen = new Set(rows.map(r => r.ko))
  for (const w of written) {
    if (!w.ko || seen.has(w.ko)) continue
    seen.add(w.ko)
    rows.push({ ko: w.ko, reading: w.reading, ru: w.ru, score: 0, ok: 0, bad: 0, known: false })
  }
  return rows
}

@Injectable()
export class WordsExportService {
  constructor(private readonly db: Db) {}

  async csv() {
    const orm = await this.db.orm()
    const stats = await orm.word.findMany({ select: { word: true, ok: true, bad: true, streak: true } })
    const written = await orm.newWord.findMany({ orderBy: { created: 'asc' }, select: { ko: true, reading: true, ru: true } })
    const rows = collectRows(stats, written)
    return { text: buildWordsCsv(rows), count: rows.length }
  }
}

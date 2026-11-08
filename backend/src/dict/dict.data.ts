/** Большой словарь: превращает записи krdict_ko_ru.json в документы для Meilisearch (чистые функции, без сети и файлов). */

export const POS_RU: Record<string, string> = {
  명사: 'существительное', 동사: 'глагол', 형용사: 'прилагательное', 부사: 'наречие', 관형사: 'определитель', 어미: 'окончание', 접사: 'аффикс',
  '의존 명사': 'зависимое существительное', 감탄사: 'междометие', 조사: 'частица', 대명사: 'местоимение', 수사: 'числительное',
  '보조 동사': 'вспомогательный глагол', '보조 형용사': 'вспомогательное прилагательное', '품사 없음': 'выражение', '': 'выражение',
}

export const LEVEL_RU: Record<string, { name: string; rank: number }> = {
  초급: { name: 'начальный', rank: 3 },
  중급: { name: 'средний', rank: 2 },
  고급: { name: 'высокий', rank: 1 },
  없음: { name: 'нет', rank: 0 },
  '': { name: 'нет', rank: 0 },
}

export interface RawEntry {
  id?: string
  word: string
  homonym_number?: string
  part_of_speech?: string
  vocabulary_level?: string
  semantic_category?: string
  word_forms?: { type?: string; pronunciation?: string; writtenForm?: string }[]
  senses?: { definition?: string; translations?: { translation?: string; definition?: string }[]; examples?: { type?: string; text?: string }[] }[]
}

export interface DictSense {
  ko: string
  ru: { t: string; d: string }[]
  /** предложения, словосочетания, диалоги */
  sent: string[]
  phr: string[]
  dial: string[]
}

export interface DictDoc {
  id: string
  word: string
  hom: number
  posKo: string
  pos: string
  level: string
  levelRank: number
  pron: string
  cat: string
  /** все переводы одной строкой: по ней ищут по-русски */
  ru: string
  /** все корейские определения одной строкой */
  def: string
  forms: string[]
  wordLen: number
  /** «популярность»: чем выше, тем раньше слово в выдаче и в списке (уровень, число значений и примеров, длина, часть речи) */
  rank: number
  /** переводы по одному, строчными (из двух первых, главных значений): по точному совпадению с ними слово поднимается наверх («школа» → 학교) */
  tr: string[]
  senses: DictSense[]
}

const MAX = { sent: 6, phr: 12, dial: 3 }

/** Части речи, которые ищут реже всего: окончания, приставки и устойчивые выражения идут в конец. */
const RARE_POS = new Set(['어미', '접사', '품사 없음', ''])

/** Оценка «популярности» слова по тому, что есть в базе (частотных списков в ней нет). Чем больше, тем выше слово в списках и в поиске. */
export function rankOf(d: { levelRank: number; posKo: string; wordLen: number; senses: DictSense[]; word: string }): number {
  const sentences = d.senses.reduce((n, s) => n + s.sent.length + s.dial.length, 0)
  let r = d.levelRank * 100
  r += Math.min(d.senses.length, 12) * 4
  r += Math.min(sentences, 20)
  r += d.wordLen <= 2 ? 25 : d.wordLen <= 3 ? 12 : d.wordLen <= 4 ? 4 : 0
  if (RARE_POS.has(d.posKo)) r -= 60
  if (d.word.includes(' ') || /^[-]|[-]$/.test(d.word)) r -= 40
  return r
}

/** Одна запись krdict → документ. Записи вообще без русского перевода не берём (словарь корейско-русский). */
export function toDoc(e: RawEntry, index: number): DictDoc | null {
  const senses: DictSense[] = (e.senses ?? []).map(s => {
    const ex = s.examples ?? []
    const take = (type: string, n: number) => ex.filter(x => x.type === type && x.text).slice(0, n).map(x => x.text!.trim())
    return {
      ko: (s.definition ?? '').trim(),
      ru: (s.translations ?? []).filter(t => t.translation || t.definition).map(t => ({ t: (t.translation ?? '').trim(), d: (t.definition ?? '').trim() })),
      sent: take('문장', MAX.sent),
      phr: take('구', MAX.phr),
      dial: take('대화', MAX.dial),
    }
  })
  if (!senses.some(s => s.ru.length)) return null
  const forms = [...new Set((e.word_forms ?? []).filter(f => f.type === '활용' && f.writtenForm).map(f => f.writtenForm!))]
  const pron = (e.word_forms ?? []).find(f => f.type === '발음' && f.pronunciation)?.pronunciation ?? ''
  const posKo = e.part_of_speech ?? ''
  const lv = LEVEL_RU[e.vocabulary_level ?? ''] ?? LEVEL_RU['']!
  const doc: DictDoc = {
    id: `e${index}`,
    word: e.word,
    hom: Number(e.homonym_number) || 0,
    posKo,
    pos: POS_RU[posKo] ?? posKo,
    level: lv.name,
    levelRank: lv.rank,
    // знак долгого гласного «ː» в произношении убираем: он только мешает читать
    pron: pron.replace(/ː/g, ''),
    cat: e.semantic_category ?? '',
    ru: senses.flatMap(s => s.ru.map(r => r.t || r.d)).join('; '),
    def: senses.map(s => s.ko).filter(Boolean).join(' '),
    forms,
    wordLen: [...e.word].length,
    rank: 0,
    tr: [...new Set(senses.slice(0, 2).flatMap(s => s.ru.flatMap(r => r.t.split(';').map(t => t.toLowerCase().replace(/\s+/g, ' ').trim()))).filter(t => t && t.length <= 60))].slice(0, 40),
    senses,
  }
  doc.rank = rankOf({ ...doc, posKo })
  return doc
}

export function buildDocs(entries: RawEntry[]): DictDoc[] {
  const out: DictDoc[] = []
  entries.forEach((e, i) => {
    const d = toDoc(e, i)
    if (d) out.push(d)
  })
  return out
}

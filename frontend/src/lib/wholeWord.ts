/**
 * Проверка «это одно слово или слово + частица» по большому словарю (`/dict`, 54 тысячи слов): для пар из `splitCandidates` (`data/korean/parse.ts`)
 * спрашивает сервер, есть ли целое слово («화가» — «художник»). Ответы помнятся на странице; нет связи или словарь не готов: пусто, разбор остаётся как был.
 */
import { searchDict, type DictHit } from '@/lib/dictApi'

export interface WholeWord { token: string; ru: string; pos: string; level: string }
const cache = new Map<string, Promise<WholeWord | null>>()

async function ask(token: string): Promise<WholeWord | null> {
  try {
    const reply = await searchDict(token, '', '', 0)
    // только само слово: не слова с похожим началом и не угаданные формы спряжения
    const hit = reply.hits.find((h: DictHit) => h.word === token)
    return hit ? { token, ru: hit.tr?.[0] ?? hit.ru.split(/[;,]/)[0]!.trim(), pos: hit.pos, level: hit.level } : null
  } catch {
    return null
  }
}

/** Целые слова из большого словаря для списка пар; найденные идут в том же порядке. */
export async function wholeWords(tokens: readonly string[]): Promise<WholeWord[]> {
  const found = await Promise.all(
    tokens.map(t => {
      if (!cache.has(t)) cache.set(t, ask(t))
      return cache.get(t)!
    }),
  )
  return found.filter((x): x is WholeWord => !!x)
}

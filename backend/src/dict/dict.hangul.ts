/** Разбор слога хангыля и поиск словарной формы по спрягаемой (먹었어요 → 먹다). Правил немного, зато работают для частых окончаний. */

const BASE = 0xac00
const T = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

export const isHangul = (ch: string) => ch >= '가' && ch <= '힣'

export function split(ch: string): [number, number, number] | null {
  if (!isHangul(ch)) return null
  const n = ch.charCodeAt(0) - BASE
  return [Math.floor(n / 588), Math.floor((n % 588) / 28), n % 28]
}

export const join = (l: number, v: number, t = 0) => String.fromCharCode(BASE + l * 588 + v * 28 + t)
const T_IDX = (c: string) => T.indexOf(c)

const VERB_POS = ['동사', '형용사', '보조 동사', '보조 형용사']
export const isPredicate = (posKo: string) => VERB_POS.includes(posKo)

/** окончания, которые можно срезать (длинные раньше коротких) → что вернуть к основе */
const ENDINGS = [
  '습니다', '았습니다', '었습니다', '했습니다', '으세요', '세요', '았어요', '었어요', '였어요', '했어요', '았어', '었어', '였어', '했어', '았다', '었다', '했다',
  '지 않아요', '지 않다', '지 마세요', '고 싶어요', '고 있어요', '는다', '아요', '어요', '여요', '해요', '아서', '어서', '해서', '으면', '면', '으니까', '니까', '는데', '지만', '고', '지', '아', '어', '는', '은', '을', '러', '려고', '게',
]

/** Возможные словарные формы (…다) для слова, которое могли написать в спряжении. Пустой список, если слово и так похоже на словарное. */
export function dictionaryForms(raw: string): string[] {
  const q = raw.trim()
  if (!q || q.includes(' ') || ![...q].every(isHangul)) return []
  const out = new Set<string>()
  const add = (stem: string) => {
    if (!stem) return
    out.add(stem + '다')
    const last = stem[stem.length - 1]!
    if (last === '해') out.add(stem.slice(0, -1) + '하다')
    if (last === '했') out.add(stem.slice(0, -1) + '하다')
    const p = split(last)
    if (!p) return
    const head = stem.slice(0, -1)
    // 예뻐 → 예쁘, 아파 → 아프 (ㅡ выпадает)
    if (p[2] === 0 && (p[1] === 4 || p[1] === 0)) out.add(head + join(p[0], 18, 0) + '다')
    // 더워 → 덥, 아름다워 → 아름답 (ㅂ-неправильные)
    if (p[2] === 0 && p[1] === 14 && head) {
      const prev = split(head[head.length - 1]!)
      if (prev && prev[2] === 0) out.add(head.slice(0, -1) + join(prev[0], prev[1], T_IDX('ㅂ')) + '다')
    }
    if (p[2] === 0 && p[1] === 9 && head) {
      const prev = split(head[head.length - 1]!)
      if (prev && prev[2] === 0) out.add(head.slice(0, -1) + join(prev[0], prev[1], T_IDX('ㅂ')) + '다') // 도와 → 돕
    }
    // 들 → 듣 (ㄷ-неправильные), 몰라 → 모르 (르-неправильные), 빨개 → 빨갛 (ㅎ-неправильные)
    if (p[2] === T_IDX('ㄹ')) out.add(head + join(p[0], p[1], T_IDX('ㄷ')) + '다')
    if (p[2] === 0 && (p[1] === 0 || p[1] === 4) && p[0] === 5 && head) {
      const prev = split(head[head.length - 1]!)
      if (prev && prev[2] === T_IDX('ㄹ')) out.add(head.slice(0, -1) + join(prev[0], prev[1], 0) + '르다')
    }
    if (p[2] === 0 && p[1] === 1) out.add(head + join(p[0], 0, T_IDX('ㅎ')) + '다')
    // 갔 → 가, 먹었 → 먹, 왔 → 오, 봤 → 보, 마셨 → 마시
    if (p[2] === T_IDX('ㅆ')) {
      out.add(stem.slice(0, -1) + join(p[0], p[1], 0) + '다')
      if (p[1] === 9) out.add(stem.slice(0, -1) + join(p[0], 8, 0) + '다') // 와/봐 → 오/보
      if (p[1] === 14) out.add(stem.slice(0, -1) + join(p[0], 13, 0) + '다') // 줬 → 주
      if (p[1] === 6) out.add(stem.slice(0, -1) + join(p[0], 20, 0) + '다') // 셨 → 시
    }
    if (p[2] === 0 && p[1] === 9) out.add(stem.slice(0, -1) + join(p[0], 8, 0) + '다')
    if (p[2] === 0 && p[1] === 14) out.add(stem.slice(0, -1) + join(p[0], 13, 0) + '다')
    if (p[2] === 0 && p[1] === 6) out.add(stem.slice(0, -1) + join(p[0], 20, 0) + '다')
    // 갑 (갑니다) → 가, 먹 → 먹
    if (p[2] === T_IDX('ㅂ')) out.add(stem.slice(0, -1) + join(p[0], p[1], 0) + '다')
    if (p[2] === T_IDX('ㄴ') || p[2] === T_IDX('ㄹ')) out.add(stem.slice(0, -1) + join(p[0], p[1], 0) + '다')
  }
  const tryEnd = (word: string) => {
    for (const end of ENDINGS) {
      const e = end.replace(/ /g, '')
      if (word.length > e.length && word.endsWith(e)) add(word.slice(0, -e.length))
    }
  }
  add(q)
  tryEnd(q)
  const noYo = q.endsWith('요') ? q.slice(0, -1) : q
  if (noYo !== q) {
    add(noYo)
    tryEnd(noYo)
  }
  // 먹어/가서 → последний слог без батчима как основа: 가 → 가다
  if (noYo.length >= 2 && '어아여서면고지는은을게네죠까'.includes(noYo[noYo.length - 1]!)) add(noYo.slice(0, -1))
  // 갑니다 → 가: «ㅂ» + 니다
  if (q.endsWith('니다') && q.length >= 3) add(q.slice(0, -2))
  out.delete(q)
  const dict = out.has(q + '다') ? [q + '다'] : []
  return [...new Set([...dict, ...out])].filter(w => w.length >= 2 && w.endsWith('다')).slice(0, 12)
}

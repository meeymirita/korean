// Собирает backend/src/dict/dict.vocab.ts из официального списка «한국어 학습용 어휘 목록» (국립국어원, 공공누리 제1유형: нужно указывать источник).
// Файл скачивается со страницы https://www.korean.go.kr/front_eng/down/down_02V.do?etc_seq=70 (текстовый вариант).
// node scripts/build-vocab.mjs <файл.txt>
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = process.argv[2]
if (!file) { console.error('укажи путь к «한국어 학습용 어휘 목록.txt»'); process.exit(1) }
const buf = readFileSync(file)
let text = new TextDecoder('utf-8').decode(buf)
if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf)

const POS = { 명: '명사', 동: '동사', 형: '형용사', 부: '부사', 보: '보조', 대: '대명사', 수: '수사', 관: '관형사', 감: '감탄사', 의: '의존 명사', 조: '조사', 접: '접사', 어: '어미' }
const rows = []
for (const line of text.split(/\r?\n/).slice(1)) {
  const c = line.split('\t')
  if (c.length < 5 || !/^\d+$/.test(c[0].trim())) continue
  const word = c[1].trim().replace(/\d+$/, '')
  const pos = POS[c[2].trim()]
  const grade = c[4].trim()
  if (!word || !pos || !'ABC'.includes(grade)) continue
  rows.push([Number(c[0]), word, pos, grade])
}
rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
const out = `// Создано scripts/build-vocab.mjs из «한국어 학습용 어휘 목록» (국립국어원, 2003; рейтинг частоты по «현대 국어 사용 빈도 조사», 공공누리 제1유형). Не править руками.
// Строка: [рейтинг частоты, слово, часть речи, уровень A/B/C]. «보조» = вспомогательный глагол или прилагательное.
export const VOCAB: [number, string, string, string][] = [
${rows.map(r => `  ${JSON.stringify(r)},`).join('\n')}
]
`
writeFileSync(fileURLToPath(new URL('../backend/src/dict/dict.vocab.ts', import.meta.url)), out)
console.log('слов:', rows.length, 'первые:', rows.slice(0, 5).map(r => r[1]).join(' '))

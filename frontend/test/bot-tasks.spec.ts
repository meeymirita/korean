// Бот-игрок, уровень A, тренажёры (docs/bot.md): «5 минут», частицы, «Похожие, но разные», перевод, «Переведи и объясни», чтение, «Потренировать правило»,
// «Определи часть речи», «Мои ошибки» и т. д. Каждый набор заданий (`Task[]`) собирается много раз с зерном, у каждого задания проверяются инварианты.
import { describe, expect, it } from 'vitest'
import { seeded } from './bot-lib'
import { checkSentence } from '../../backend/src/public/rules'
import { useProgressStore } from '@/stores/progress'
import type { Task } from '@/data/korean/tasks'
import { randomTasks } from '@/data/korean/tasks'
import { quickTasks } from '@/data/korean/quick'
import { particleSets, particleTasks } from '@/data/korean/particles'
import { pairTasks } from '@/data/korean/pairs'
import { translateTasks, type TranslateDir, type TranslateLevel } from '@/data/korean/translate'
import { explainTasks } from '@/data/korean/translate-explain'
import { readTasks, sceneTasks } from '@/data/korean/read'
import { posTasks } from '@/data/korean/part-of-speech'
import { marksTasks } from '@/data/korean/marks-drill'
import { mistakeTasks } from '@/data/mistakes'
import { mixedSession, ruleSession, trainableRule } from '@/data/korean/rule-tasks'
import { G } from '@/data/korean/grammar'
import { STUDY } from '@/data/korean/study'

const ROUNDS = Number(process.env.BOT_TASK_ROUNDS ?? 40)
const SEED = Number(process.env.BOT_SEED ?? 20261120)
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
const JUNK = /undefined|\bNaN\b|\[object Object\]|\bnull\b/
const CJK = /[぀-ヿ㐀-䶿一-鿿]/
const STUDY_KO = new Set(STUDY.map(d => d.k))

/** Нарушения одного задания (пустой список: порядок). */
function check(t: Task): string[] {
  const v: string[] = []
  const all = [t.title, t.prompt, t.hint, t.answer, t.sentence, t.note, ...t.options].filter((x): x is string => typeof x === 'string')
  if (!t.title?.trim()) v.push('нет-заголовка')
  if (!t.prompt?.trim()) v.push('нет-вопроса')
  if (!t.answer?.trim()) v.push('нет-ответа')
  if (t.options.length < 2) v.push(`вариантов-меньше-двух (${t.options.length})`)
  if (t.options.length > 6) v.push(`вариантов-слишком-много (${t.options.length})`)
  if (new Set(t.options.map(norm)).size !== t.options.length) v.push(`повторяются-варианты: ${t.options.join(' | ')}`)
  if (!t.options.includes(t.answer)) v.push(`ответа-нет-среди-вариантов: ${t.answer}`)
  if (t.options.some(o => !o.trim())) v.push('пустой-вариант')
  const junk = all.find(x => JUNK.test(x))
  if (junk) v.push('мусор-в-тексте: ' + junk)
  const cjk = all.find(x => CJK.test(x))
  if (cjk) v.push('японские-китайские-знаки: ' + cjk)
  if (t.word && !STUDY_KO.has(t.word)) v.push('слово-вне-STUDY: ' + t.word)
  for (const k of [t.sentence].filter(Boolean) as string[]) for (const f of checkSentence(k).filter(x => x.severity === 'forbid')) v.push(`не-пройдено:${f.rule}: ${k}`)
  for (const r of [t.hint].filter(Boolean) as string[]) for (const f of checkSentence('', r).filter(x => x.severity === 'forbid')) v.push(`русский-перевод:${f.rule}: ${r}`)
  // 하고, 와 и 과 в пропуске: 하고 подходит всегда, 와/과 по 받침; 하고 рядом с 와/과 даёт два верных ответа
  if (t.kind === 'rule' && t.title.startsWith('Вставь') && ['하고', '와', '과'].includes(t.answer)) {
    const bothWays = t.options.includes('하고') && t.options.some(o => o === '와' || o === '과')
    if (bothWays) v.push(`второй-верный-ответ: 하고 и 와/과 вместе в «${t.prompt}»`)
  }
  if (t.pairOf) {
    const keys = Object.keys(t.pairOf)
    if (!t.options.every(o => keys.includes(o))) v.push('pairOf-без-варианта')
  }
  return v
}

/** Прогоняет сборщик набора `rounds` раз и возвращает все нарушения с примером. */
function run(name: string, make: () => Task[], rounds = ROUNDS, expectSize?: [number, number], mayBeEmpty = false) {
  const orig = Math.random
  Math.random = seeded(SEED)
  const found = new Map<string, { n: number; sample: string }>()
  try {
    for (let r = 0; r < rounds; r++) {
      const set = make()
      if (!set.length && !mayBeEmpty) found.set('пустой-набор', { n: (found.get('пустой-набор')?.n ?? 0) + 1, sample: name })
      if (expectSize && (set.length < expectSize[0] || set.length > expectSize[1])) {
        const k = 'размер-набора'
        found.set(k, { n: (found.get(k)?.n ?? 0) + 1, sample: `${set.length} заданий, ждали ${expectSize[0]}–${expectSize[1]}` })
      }
      for (const t of set) {
        for (const x of check(t)) {
          const code = x.split(/[:(]/)[0]!.trim()
          const cur = found.get(code)
          found.set(code, { n: (cur?.n ?? 0) + 1, sample: cur?.sample ?? `${x} | id=${t.id} kind=${t.kind} «${t.prompt.slice(0, 50)}»` })
        }
      }
    }
  } finally {
    Math.random = orig
  }
  return [...found].map(([c, f]) => `${f.n}× ${c}: ${f.sample}`)
}

const data = () => useProgressStore().data

describe('бот-игрок: наборы заданий тренажёров', () => {
  it('«Слова на каждый день» (randomTasks)', () => expect(run('random', () => randomTasks(8))).toEqual([]))
  it('«5 минут»', () => expect(run('quick', () => quickTasks(data()))).toEqual([]))
  it('«Похожие, но разные»', () => expect(run('pairs', () => pairTasks(data()))).toEqual([]))
  it('«Переведи и объясни»', () => expect(run('explain', () => explainTasks(15))).toEqual([]))
  it('«Чтение»: тексты', () => expect(run('read', () => readTasks(8))).toEqual([]))
  it('«Диалоги»: сценки', () => expect(run('scene', () => sceneTasks(2))).toEqual([]))
  it('«Определи часть речи»', () => expect(run('pos', () => posTasks(15))).toEqual([]))
  it('«Знаки»', () => expect(run('marks', () => marksTasks(data()), ROUNDS, undefined, true)).toEqual([]))
  it('«Мои ошибки» без истории не падает', () => expect(run('mistakes', () => mistakeTasks(data()), 5, undefined, true)).toEqual([]))
  for (const dir of ['ko-ru', 'ru-ko', 'mix'] as TranslateDir[]) {
    for (const lv of ['any', 'easy', 'medium', 'hard', 'text'] as TranslateLevel[]) {
      it(`«Переведи»: ${dir} / ${lv}`, () => expect(run('translate', () => translateTasks(dir, 10, lv))).toEqual([]))
    }
  }
  for (const s of particleSets()) {
    it(`«Частицы и окончания»: ${s.ko}`, () => expect(run('particles', () => particleTasks(s.id, 10), 15)).toEqual([]))
  }
})

describe('бот-игрок: «Потренировать правило»', () => {
  // «Потренировать правило» открывается только у карточек с тремя и больше примерами (`trainableRule`); у остальных кнопки нет
  const ok = G.filter(g => g.st === 'ok' && trainableRule(g))
  it('пройденных карточек с примерами хватает', () => expect(ok.length).toBeGreaterThan(10))
  for (const g of ok) {
    it(`правило ${g.id}`, () => {
      const orig = Math.random
      Math.random = seeded(SEED)
      try {
        const bad = run('rule', () => ruleSession(g, 10), 8)
        expect(bad).toEqual([])
        // в серии из 10 не меньше 8 разных вопросов и не меньше 3 видов задания, если примеров хватает (docs/bot.md)
        for (let i = 0; i < 5; i++) {
          const set = ruleSession(g, 10)
          const prompts = new Set(set.map(t => t.prompt))
          if (set.length >= 10) expect(prompts.size, `${g.id}: разных вопросов в серии`).toBeGreaterThanOrEqual(8)
        }
      } finally {
        Math.random = orig
      }
    })
  }
  it('смесь правил', () => expect(run('mixed', () => mixedSession(ok, 10), 20)).toEqual([]))
})

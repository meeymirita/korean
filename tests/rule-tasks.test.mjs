import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { ruleTasks, ruleSession, trainableRule, RULE_TASK_BASE } = await load('/src/data/korean/rule-tasks.ts')
const { G } = await load('/src/data/korean/grammar.ts')
after(close)

describe('задания на правило дня', () => {
  test('у каждого пройденного правила есть хотя бы одно задание, ответ среди вариантов, варианты без дублей', () => {
    for (const g of G.filter(x => x.st === 'ok')) {
      const tasks = ruleTasks(g, 3)
      const hasExamples = g.b.some(b => b[0] === 'ex')
      if (hasExamples) assert.ok(tasks.length > 0, `нет заданий у ${g.id}`)
      tasks.forEach((t, i) => {
        assert.equal(t.id, RULE_TASK_BASE + i)
        assert.equal(t.kind, 'rule')
        assert.ok(t.options.includes(t.answer), g.id)
        assert.equal(new Set(t.options).size, t.options.length, `дубли в вариантах ${g.id}`)
        assert.ok(!/[{}|]/.test(t.prompt), `метки в тексте ${g.id}: ${t.prompt}`)
      })
    }
  })

  test('вставка формы: в вопросе есть пропуск, ответа в вопросе нет', () => {
    const iyo = G.find(g => g.id === 'iyo')
    const t = ruleTasks(iyo, 6).filter(x => x.title === 'Вставь нужную форму')
    assert.ok(t.length > 0)
    for (const x of t) assert.ok(x.prompt.includes('＿＿＿'))
  })
})

describe('«Потренировать это правило»: серия из примеров карточки', () => {
  const cards = G.filter(trainableRule)

  test('тренировать можно большинство карточек, в том числе новые 에 и 도 от Леры', () => {
    assert.ok(cards.length >= 20, `всего ${cards.length}`)
    for (const id of ['when_e', 'too_do', 'iyo', 'eun', 'ayo']) assert.ok(cards.some(g => g.id === id), id)
  })

  test('у каждой такой карточки серия из 8–10 заданий: ответ среди вариантов, без дублей, без меток', () => {
    for (const g of cards) {
      const tasks = ruleSession(g, 10)
      assert.ok(tasks.length >= 6 && tasks.length <= 10, `${g.id}: заданий ${tasks.length}`)
      tasks.forEach((t, i) => {
        assert.equal(t.id, RULE_TASK_BASE + i)
        assert.equal(t.gram, g.id)
        assert.ok(t.options.includes(t.answer), `${g.id}: нет ответа среди вариантов (${t.title})`)
        assert.equal(new Set(t.options).size, t.options.length, `${g.id}: дубли в вариантах (${t.title})`)
        assert.ok(t.options.length >= 3, `${g.id}: мало вариантов`)
        assert.ok(!/[{}|]/.test(t.prompt + t.options.join('') + t.answer), `${g.id}: метки в тексте`)
      })
      const prompts = tasks.map(t => t.title + '|' + t.prompt)
      assert.equal(new Set(prompts).size, prompts.length, `${g.id}: повторы заданий`)
    }
  })

  test('виды заданий: вставь форму, верное предложение, что значит, как по-корейски', () => {
    const kinds = new Set()
    for (const g of cards) for (const t of ruleSession(g, 10)) kinds.add(t.title)
    assert.deepEqual([...kinds].sort(), ['Как это по-корейски?', 'Какое предложение верное?', 'Вставь нужную форму', 'Что значит предложение?'].sort())
  })

  test('«верное предложение»: неверные получены подменой частицы и не совпадают ни с одним примером карточки', () => {
    const when = G.find(g => g.id === 'when_e')
    const own = new Set(when.b.filter(b => b[0] === 'ex').flatMap(b => b[1]).map(([ko]) => ko.replace(/\{[a-z]\|([^}]*)\}/g, '$1')))
    let seen = 0
    for (let i = 0; i < 20; i++) {
      for (const t of ruleSession(when, 10).filter(x => x.title === 'Какое предложение верное?')) {
        seen++
        assert.ok(own.has(t.answer), t.answer)
        for (const o of t.options.filter(x => x !== t.answer)) assert.ok(!own.has(o), `неверный вариант совпал с примером: ${o}`)
      }
    }
    assert.ok(seen > 10)
  })

  test('в игре есть пункт «Потренировать правило», а чек-лист считает его как тренажёр', async () => {
    const { ALL_GAMES, TOOL_IDS } = await load('/src/data/games.ts')
    assert.ok(TOOL_IDS.includes('rule'))
    assert.ok(ALL_GAMES.some(g => g.id === 'rule' && g.to === '/game/home?game=rule'))
  })
})

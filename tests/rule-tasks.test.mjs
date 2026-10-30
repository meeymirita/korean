import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { ruleTasks, RULE_TASK_BASE } = await load('/src/data/korean/rule-tasks.ts')
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

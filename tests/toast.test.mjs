import { after, afterEach, beforeEach, describe, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { useToastStore } = await load('/src/stores/toast.ts')
after(close)

let t
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] })
  setActivePinia(createPinia())
  t = useToastStore()
})
afterEach(() => mock.timers.reset())

describe('плашки-уведомления', () => {
  test('показываются, закрываются по клику и сами исчезают (ошибка живёт дольше)', () => {
    t.ok('Готово')
    t.error('Ошибка')
    assert.deepEqual(t.items.map(i => i.kind), ['ok', 'error'])
    mock.timers.tick(3300)
    assert.deepEqual(t.items.map(i => i.kind), ['error'], 'обычная ушла, ошибка осталась')
    mock.timers.tick(2300)
    assert.equal(t.items.length, 0)
    t.info('Раз')
    t.dismiss(t.items[0].id)
    assert.equal(t.items.length, 0)
  })

  test('одинаковое сообщение подряд не множится', () => {
    t.ok('Заметка добавлена')
    t.ok('Заметка добавлена')
    assert.equal(t.items.length, 1)
    t.error('Заметка добавлена')
    assert.equal(t.items.length, 2, 'другой вид — другая плашка')
  })

  test('на экране не больше четырёх: самые старые вытесняются', () => {
    for (let i = 1; i <= 6; i++) t.ok('Плашка ' + i)
    assert.deepEqual(t.items.map(i => i.text), ['Плашка 3', 'Плашка 4', 'Плашка 5', 'Плашка 6'])
  })
})

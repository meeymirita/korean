import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { askConfirm, askToken, askTokenDo, answerConfirm, submitToken, confirmState } = await load('/src/composables/useConfirm.ts')
after(close)

describe('окно подтверждения вместо confirm()', () => {
  test('открывается с текстом, «да» даёт true, окно закрывается', async () => {
    const p = askConfirm({ title: 'Удалить?', text: 'Нельзя отменить', ok: 'Удалить', danger: true })
    assert.deepEqual([confirmState.open, confirmState.title, confirmState.ok, confirmState.danger], [true, 'Удалить?', 'Удалить', true])
    answerConfirm(true)
    assert.equal(await p, true)
    assert.equal(confirmState.open, false)
  })

  test('«отмена» даёт false, значения по умолчанию подставляются', async () => {
    const p = askConfirm({ title: 'Точно?' })
    assert.deepEqual([confirmState.ok, confirmState.cancel, confirmState.danger, confirmState.text], ['Да', 'Отмена', false, ''])
    answerConfirm(false)
    assert.equal(await p, false)
  })

  test('новый вопрос закрывает прежний ответом «нет», старые параметры не залипают', async () => {
    const first = askConfirm({ title: 'Первый', danger: true, ok: 'Удалить' })
    const second = askConfirm({ title: 'Второй' })
    assert.equal(await first, false)
    assert.deepEqual([confirmState.title, confirmState.danger, confirmState.ok], ['Второй', false, 'Да'])
    answerConfirm(true)
    assert.equal(await second, true)
  })

  test('ответ без открытого окна ничего не ломает', () => {
    assert.doesNotThrow(() => answerConfirm(true))
    assert.equal(confirmState.open, false)
  })

  test('окно с токеном: введённый токен очищается от пробелов и возвращается, пустой не принимается', async () => {
    const p = askToken({ title: 'Токен?' })
    assert.equal(confirmState.token, true)
    await submitToken('   ')
    assert.equal(confirmState.open, true, 'пустой токен окно не закрывает')
    await submitToken('  секрет  ')
    assert.equal(await p, 'секрет')
    assert.equal(confirmState.open, false)
  })

  test('окно с действием: ошибка остаётся внутри окна, можно ввести токен ещё раз, успех закрывает', async () => {
    let calls = []
    const p = askTokenDo({ title: 'Создать?' }, async token => {
      calls.push(token)
      if (token !== 'good') throw new Error('неверный токен подтверждения')
    })
    await submitToken('bad')
    assert.deepEqual([confirmState.open, confirmState.error, confirmState.busy], [true, 'неверный токен подтверждения', false], 'окно открыто, ошибка в нём')
    await submitToken(' good ')
    assert.equal(await p, true)
    assert.deepEqual(calls, ['bad', 'good'])
    assert.equal(confirmState.open, false)
    assert.equal(confirmState.error, '', 'ошибка не залипает на следующее окно')
  })

  test('окно с действием: отмена возвращает false и действие не выполняется; повторный клик во время проверки игнорируется', async () => {
    let n = 0
    let release
    const p = askTokenDo({ title: 'Сбросить?' }, () => new Promise(r => ((n++, (release = r)))))
    const first = submitToken('x')
    await submitToken('x') // пока идёт проверка
    assert.equal(n, 1)
    release()
    await first
    assert.equal(await p, true)
    const q = askTokenDo({ title: 'Ещё?' }, async () => assert.fail('не должно выполниться'))
    answerConfirm(false)
    assert.equal(await q, false)
  })
})

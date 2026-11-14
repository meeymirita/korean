import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { opts, records, start } from './game-helpers'

// Предметы Юны в «Хлебушке» (docs/shop.md): подсказка, 50/50, повтор и второй шанс в вопросах с вариантами.
function shop(stock: Record<string, number>) {
  const used: string[] = []
  return {
    used,
    stock,
    items: {
      count: (id: string) => stock[id] ?? 0,
      use: async (id: string) => {
        if (!stock[id]) return false
        stock[id]--
        used.push(id)
        return true
      },
    },
  }
}
const barButtons = () => [...document.querySelectorAll<HTMLButtonElement>('#shopBar button')]
const byText = (t: string) => barButtons().find(b => b.textContent?.includes(t))
const live = () => opts().filter(b => !b.disabled)
const prompt = () => document.querySelector('#card')?.textContent ?? ''

describe('«Хлебушек»: предметы из магазина', () => {
  it('без предметов (и без хука) панели нет', () => {
    start('word')
    expect(document.querySelector('#shopBar')).toBeNull()
    start('word', false, shop({}).items)
    expect(document.querySelector('#shopBar')).toBeNull()
  })

  it('50/50 убирает два неверных варианта и тратит предмет', async () => {
    const s = shop({ fifty: 2 })
    start('word', false, s.items)
    const before = live().length
    expect(before).toBeGreaterThan(2)
    byText('50/50')!.click()
    await flushPromises()
    expect(s.used).toEqual(['fifty'])
    expect(live().length).toBe(before - 2)
    expect(document.querySelectorAll('#opts .opt.dim').length).toBe(2)
  })

  it('подсказка называет первую букву, убирает один неверный вариант и даёт за верный ответ 5 очков', async () => {
    const s = shop({ hint: 1 })
    start('word', false, s.items)
    byText('Подсказка')!.click()
    await flushPromises()
    expect(s.used).toEqual(['hint'])
    expect(prompt()).toMatch(/Подсказка Юны: ответ начинается с «/)
    expect(document.querySelectorAll('#opts .opt.dim').length).toBe(1)
    // нажимаем доступные варианты: верный закрывает вопрос и даёт 5 очков (после неверного запись без xp)
    for (const b of opts()) if (!b.disabled && !records.length) b.click()
    expect(records.length).toBe(1)
    if (records[0]!.ok) expect(records[0]!.xp).toBe(5)
  })

  it('повтор: следующий вопрос без записи ответа', async () => {
    const s = shop({ skip: 1 })
    start('word', false, s.items)
    const first = prompt()
    byText('Повтор')!.click()
    await flushPromises()
    expect(s.used).toEqual(['skip'])
    expect(records.length).toBe(0)
    expect(document.querySelectorAll('#opts .opt').length).toBeGreaterThan(1)
    expect(prompt()).not.toBe(first)
  })

  it('второй шанс: неверный ответ не записан до решения; «Исправить» возвращает варианты', async () => {
    const s = shop({ second: 1 })
    start('word', false, s.items)
    // нажимаем варианты по очереди, пока не получим предложение второго шанса (верный ответ закрывает вопрос сразу)
    let offered = false
    for (let attempt = 0; attempt < 10 && !offered; attempt++) {
      start('word', false, shop({ second: 1 }).items)
      const b = opts()[0]!
      b.click()
      offered = !!document.querySelector('#secondBar')
    }
    expect(offered).toBe(true)
    expect(records.length).toBe(0)
    expect(live().length).toBe(0) // пока решение не принято, варианты закрыты
    ;(document.querySelector('#secondBar button') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.querySelector('#secondBar')).toBeNull()
    expect(records.length).toBe(0)
    expect(live().length).toBeGreaterThan(0)
    expect(document.querySelectorAll('#opts .opt.dim').length).toBe(1)
  })

  it('«Оставить ошибку» записывает неверный ответ и показывает разбор', async () => {
    let done = false
    for (let attempt = 0; attempt < 10 && !done; attempt++) {
      start('word', false, shop({ second: 1 }).items)
      opts()[0]!.click()
      const bar = document.querySelector('#secondBar')
      if (!bar) continue
      ;(bar.querySelectorAll('button')[1] as HTMLButtonElement).click()
      expect(records.length).toBe(1)
      expect(records[0]!.ok).toBe(false)
      expect(document.querySelector('#fb')!.classList.contains('show')).toBe(true)
      done = true
    }
    expect(done).toBe(true)
  })
})

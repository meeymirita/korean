import { describe, expect, it } from 'vitest'
import { targetAt } from '@/lib/dragdrop'

// Выбор цели при перетаскивании плитки (само перетаскивание делает GSAP Draggable, оно проверяется в браузере).
const box = (id: string, left: number, top: number, width = 60, height = 40) => {
  const el = document.createElement('button')
  el.id = id
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })
  return el
}
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

describe('перетаскивание: какая цель под плиткой', () => {
  const a = box('a', 100, 100)
  const b = box('b', 200, 100)

  it('точка внутри цели или рядом с ней (запас 14 px) попадает в цель; из двух берётся ближняя', () => {
    expect(targetAt([a, b], 130, 120)?.id).toBe('a')
    expect(targetAt([a, b], 95, 95)?.id).toBe('a')
    expect(targetAt([a, b], 172, 120)?.id).toBe('a')
    expect(targetAt([a, b], 190, 120)?.id).toBe('b')
  })

  it('точка далеко: цели нет, если плитка её не накрыла', () => {
    expect(targetAt([a, b], 400, 400)).toBeNull()
    expect(targetAt([a, b], 400, 400, rect(380, 380, 60, 40))).toBeNull()
    expect(targetAt([], 130, 120)).toBeNull()
  })

  it('точка мимо, но плитка накрыла цель хотя бы на треть: цель засчитывается', () => {
    expect(targetAt([a, b], 130, 170, rect(110, 120, 60, 40))?.id).toBe('a')
    expect(targetAt([a, b], 130, 170, rect(155, 138, 60, 40))).toBeNull()
  })
})

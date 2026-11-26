import { describe, expect, it } from 'vitest'
import { wheelIntent } from '@/lib/wheelIntent'

const ev = (o: Partial<{ ctrlKey: boolean; deltaMode: number; deltaX: number; deltaY: number }>) => ({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 0, ...o })

describe('wheelIntent: колесо или тачпад на карте', () => {
  it('щипок на тачпаде и Ctrl+колесо приближают', () => {
    expect(wheelIntent(ev({ ctrlKey: true, deltaY: -3.5 }))).toBe('zoom')
    expect(wheelIntent(ev({ ctrlKey: true, deltaY: 120 }))).toBe('zoom')
  })

  it('колесо мыши (шаг 100 в пикселях или строки) приближает', () => {
    expect(wheelIntent(ev({ deltaY: 100 }))).toBe('zoom')
    expect(wheelIntent(ev({ deltaY: -200 }))).toBe('zoom')
    expect(wheelIntent(ev({ deltaMode: 1, deltaY: 3 }))).toBe('zoom')
  })

  it('два пальца по тачпаду двигают карту: мелкие шаги, дробные значения и сдвиг вбок', () => {
    expect(wheelIntent(ev({ deltaY: 4 }))).toBe('pan')
    expect(wheelIntent(ev({ deltaY: 12.5 }))).toBe('pan')
    expect(wheelIntent(ev({ deltaY: 40, deltaX: 3 }))).toBe('pan')
    expect(wheelIntent(ev({ deltaX: -25 }))).toBe('pan')
    expect(wheelIntent(ev({ deltaY: 133 }))).toBe('pan')
  })
})

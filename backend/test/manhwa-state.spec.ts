import { describe, expect, it } from 'vitest'
import { cleanPrefs, cleanState, ManhwaStateService } from '../src/manhwa/manhwa.state'

/** Db на памяти: только getMeta и setMeta. */
const fakeDb = () => {
  const m = new Map<string, string>()
  return { getMeta: async (k: string) => m.get(k), setMeta: async (k: string, v: string) => void m.set(k, v) }
}
const st = (at: number, extra: Record<string, unknown> = {}) => ({ read: [3, 1, 1], pos: { '2': 5 }, at, marks: [], ...extra })

describe('прогресс чтения манхвы на сервере', () => {
  it('чистит присланное: главы по порядку без повторов, лишние поля отбрасываются', () => {
    const c = cleanState({ ...st(1_700_000_000_000, { status: 'reading', junk: 1, marks: [{ c: 1, p: 2, note: 'x'.repeat(500), z: 1 }] }) })
    expect(c.read).toEqual([1, 3])
    expect(c.status).toBe('reading')
    expect(c.marks).toEqual([{ c: 1, p: 2, note: 'x'.repeat(300) }])
    expect('junk' in c).toBe(false)
    expect(cleanState(st(1, { seen: 38 })).seen).toBe(38)
    expect('seen' in cleanState(st(1))).toBe(false)
  })

  it('отклоняет кривые данные', () => {
    for (const bad of [null, {}, st(1, { read: 'a' }), st(1, { read: [-1] }), st(1, { pos: { x: 1 } }), st(1, { pos: { '1': -5 } }), st(1, { status: 'bad' }), st(1, { seen: -2 }), st(1, { marks: [{ c: 1.5, p: 0 }] }), st(-1)]) expect(() => cleanState(bad)).toThrow()
  })

  it('свежее состояние побеждает, старое не затирает новое, имя манхвы проверяется', async () => {
    const svc = new ManhwaStateService(fakeDb() as never)
    expect(await svc.all()).toEqual({})
    await svc.save('love-quest', st(2000, { read: [1] }))
    const old = await svc.save('love-quest', st(1000, { read: [9] }))
    expect(old.read).toEqual([1]) // пришло старое: вернулось хранимое
    const newer = await svc.save('love-quest', st(3000, { read: [1, 2] }))
    expect(newer.read).toEqual([1, 2])
    await svc.save('estetika-pitomca', st(500))
    expect(Object.keys(await svc.all()).sort()).toEqual(['estetika-pitomca', 'love-quest'])
    expect(() => svc.save('Bad Name', st(1))).toThrow()
  })

  it('настройки вида: проверка, свежее побеждает, до первой записи null', async () => {
    const svc = new ManhwaStateService(fakeDb() as never)
    expect(await svc.prefs()).toBeNull()
    const p = (at: number, extra: Record<string, unknown> = {}) => ({ zoom: 3, blur: true, sort: 'recent', two: false, at, junk: 1, ...extra })
    expect('junk' in cleanPrefs(p(1))).toBe(false)
    for (const bad of [null, {}, p(1, { sort: 'x' }), p(1, { blur: 1 }), p(1, { zoom: -1 }), p(1, { zoom: 99 }), p(-1)]) expect(() => cleanPrefs(bad)).toThrow()
    await svc.savePrefs(p(2000, { zoom: 5 }))
    expect((await svc.savePrefs(p(1000, { zoom: 1 }))).zoom).toBe(5)
    expect((await svc.savePrefs(p(3000, { zoom: 2, two: true }))).two).toBe(true)
    expect((await svc.prefs())?.zoom).toBe(2)
  })

  it('два быстрых сохранения разных манхв не теряют друг друга', async () => {
    const svc = new ManhwaStateService(fakeDb() as never)
    await Promise.all([svc.save('a-one', st(1)), svc.save('b-two', st(1)), svc.save('c-three', st(1))])
    expect(Object.keys(await svc.all()).sort()).toEqual(['a-one', 'b-two', 'c-three'])
  })
})

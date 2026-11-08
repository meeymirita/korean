import { describe, expect, it, vi } from 'vitest'
import { dayOf, sourceOf, visitOf, whoIs } from '../src/dict/dict.visits'
import { DictVisits } from '../src/dict/dict.visits.service'

describe('учёт заходов на словарь: разбор адреса и посетителя', () => {
  it('узнаёт страницы словаря и подборок, остальное не считает', () => {
    expect(visitOf('/dict')).toEqual({ kind: 'dict', ref: '' })
    expect(visitOf('/dict/')).toEqual({ kind: 'dict', ref: '' })
    expect(visitOf('/dict?q=학교')).toEqual({ kind: 'dict', ref: '' })
    expect(visitOf('/dict/%ED%95%99%EA%B5%90')).toEqual({ kind: 'word', ref: '학교' })
    expect(visitOf('/dict/podborki')).toEqual({ kind: 'sets', ref: '' })
    expect(visitOf('/dict/podborki/top-100')).toEqual({ kind: 'set', ref: 'top-100' })
    expect(visitOf('/dict/podborki/../x')).toBeNull()
    expect(visitOf('/korean/home')).toBeNull()
    expect(visitOf('/about')).toBeNull()
    expect(visitOf('/dict/%E0%A4%A')).toBeNull()
    expect(visitOf('/dict/' + 'а'.repeat(80))).toBeNull()
  })

  it('отличает роботов поисковиков от людей', () => {
    expect(whoIs('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe('google')
    expect(whoIs('Mozilla/5.0 (compatible; YandexBot/3.0)')).toBe('yandex')
    expect(whoIs('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe('bing')
    expect(whoIs('Mozilla/5.0 (compatible; AhrefsBot/7.0)')).toBe('seo-сервисы')
    expect(whoIs('TelegramBot (like TwitterBot)')).toBe('превью ссылок')
    expect(whoIs('curl/8.4.0')).toBe('прочие роботы')
    expect(whoIs('')).toBe('прочие роботы')
    expect(whoIs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('человек')
    expect(whoIs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe('человек')
  })

  it('источник: только имя сайта, свой сайт и мусор дают пустую строку', () => {
    expect(sourceOf('https://www.google.com/search?q=secret')).toBe('google.com')
    expect(sourceOf('https://yandex.ru/')).toBe('yandex.ru')
    expect(sourceOf('https://korean.meeymirita.ru/dict')).toBe('')
    expect(sourceOf('не адрес')).toBe('')
    expect(sourceOf('')).toBe('')
  })

  it('день считается по UTC', () => {
    expect(dayOf(Date.UTC(2026, 10, 9, 23, 59))).toBe('2026-11-09')
  })
})

function fakeDb() {
  const rows: Record<string, unknown>[] = []
  const orm = { dictVisit: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { rows.push(data) }), deleteMany: vi.fn(async () => ({})) } }
  return { rows, orm, db: { orm: async () => orm } as never }
}

describe('учёт заходов на словарь: запись', () => {
  it('записывает заход человека и робота, не пишет чужие страницы', async () => {
    const { rows, db } = fakeDb()
    const v = new DictVisits(db)
    const now = Date.UTC(2026, 10, 9, 12)
    expect(await v.record({ path: '/dict/podborki/eda', ua: 'Mozilla/5.0 Chrome/120', ref: 'https://www.google.com/search?q=x' }, now)).toBe(true)
    expect(await v.record({ path: '/dict/%ED%95%99%EA%B5%90', ua: 'Googlebot/2.1' }, now)).toBe(true)
    expect(await v.record({ path: '/korean/words', ua: 'x' }, now)).toBe(false)
    expect(await v.record({ path: 5 as never }, now)).toBe(false)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ day: '2026-11-09', kind: 'set', ref: 'eda', who: 'человек', src: 'google.com' })
    expect(rows[1]).toMatchObject({ kind: 'word', ref: '학교', who: 'google', src: '' })
  })

  it('не принимает больше 600 записей в минуту, потом снова принимает', async () => {
    const { rows, db } = fakeDb()
    const v = new DictVisits(db)
    const now = Date.UTC(2026, 10, 9, 12)
    for (let i = 0; i < 650; i++) await v.record({ path: '/dict', ua: 'Chrome' }, now)
    expect(rows).toHaveLength(600)
    expect(await v.record({ path: '/dict', ua: 'Chrome' }, now + 61_000)).toBe(true)
  })
})

import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotifyService } from '../src/notify/notify.service'
import { RuleService, ruleCards } from '../src/rule/rule.service'
import { ruleMail } from '../src/mail/templates'

const at = (h: number, m: number, d = 2) => new Date(2026, 10, d, h, m)

function setup(opts: { photo?: boolean } = {}) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rule-')), 'tg.jsonl')
  vi.stubEnv('TELEGRAM_DUMP_FILE', file)
  vi.stubEnv('TELEGRAM_GROUP_ID', '-100500')
  vi.stubEnv('TELEGRAM_TOPIC_RULE', '187')
  const meta = new Map<string, string>()
  const db = { getMeta: (k: string) => meta.get(k) ?? null, setMeta: (k: string, v: string) => void meta.set(k, v) }
  const notify = new NotifyService({ configured: () => false, send: vi.fn() } as never, db as never)
  const disk = {
    configured: () => !!opts.photo,
    download: async (_remote: string, f: string) => {
      if (!opts.photo) throw new Error('нет файла')
      const { writeFileSync } = await import('node:fs')
      writeFileSync(f, await sharp({ create: { width: 20, height: 10, channels: 3, background: '#fcc' } }).webp().toBuffer())
    },
  }
  const svc = new RuleService(db as never, notify, disk as never, { register() {} } as never)
  const rows = () => (existsSync(file) ? readFileSync(file, 'utf8') : '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  return { svc, rows, meta }
}

describe('правило дня', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('берёт только пройденные карточки «Мои карточки» (без подписи урока)', () => {
    const cards = ruleCards()
    expect(cards.length).toBeGreaterThan(5)
    expect(cards.every(c => !c.lesson)).toBe(true)
  })

  it('по умолчанию выключено; включили: рано — ничего, в своё время одно сообщение, второе в тот же день не уходит', async () => {
    const { svc, rows } = setup()
    expect(await svc.tick(at(23, 0))).toBe('off')
    await svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    expect(await svc.tick(at(11, 59))).toBe('early')
    expect(await svc.tick(at(12, 0))).toBe('sent')
    expect(await svc.tick(at(12, 1))).toBe('already')
    expect(rows().every(r => r.message_thread_id === 187 && r.chat_id === '-100500')).toBe(true)
    expect(await svc.tick(at(12, 0, 3))).toBe('sent')
  })

  it('включили после выбранного времени: первое правило завтра', async () => {
    const { svc, rows } = setup()
    await svc.set({ enabled: true, time: '12:00' }, at(15, 0))
    expect(await svc.tick(at(15, 1))).toBe('already')
    expect(rows()).toHaveLength(0)
  })

  it('тема не подключена: ничего не уходит и день не тратится', async () => {
    const { svc } = setup()
    vi.stubEnv('TELEGRAM_TOPIC_RULE', '')
    await svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    expect(await svc.tick(at(12, 0))).toBe('notopic')
    vi.stubEnv('TELEGRAM_TOPIC_RULE', '187')
    expect(await svc.tick(at(12, 1))).toBe('sent')
  })

  it('карточки не повторяются, пока не пройдёт весь круг', async () => {
    const { svc } = setup()
    const n = ruleCards().length
    await svc.set({ enabled: true, time: '00:00' }, at(0, 0, 1))
    for (let i = 0; i < n; i++) expect(await svc.tick(at(10, 0, 2 + i))).toBe('sent')
    const s = await svc.get()
    expect(new Set(s.seen).size).toBe(n)
    expect(await svc.tick(at(10, 0, 2 + n))).toBe('sent')
    expect((await svc.get()).seen).toHaveLength(1)
  })

  it('с картинкой на Диске: сначала фото JPEG, потом текст с кнопкой; без картинки только текст', async () => {
    const a = setup({ photo: true })
    await a.svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    await a.svc.tick(at(12, 0))
    const rows = a.rows()
    expect(rows[0].form.photo).toMatchObject({ file: 'rule.jpg', type: 'image/jpeg' })
    expect(rows[0].form.caption).toContain('🧡')
    expect(JSON.stringify(rows.at(-1))).toContain('/korean/grammar?g=')
    const b = setup()
    await b.svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    await b.svc.tick(at(12, 0))
    expect(b.rows().some(r => r.form)).toBe(false)
  })

  it('«Пробное» не трогает круг и день отправки', async () => {
    const { svc } = setup()
    await svc.set({ enabled: true, time: '12:00' }, at(9, 0))
    expect(await svc.test()).toEqual({ ok: true, message: '' })
    const s = await svc.get()
    expect(s.seen).toEqual([])
    expect(s.lastSent).toBe('')
  })

  it('длинная карточка идёт несколькими сообщениями, кнопка только под последним', () => {
    const long = { id: 'x', ko: 'ㄱ', ru: 'т', section: 'с', about: 'о', blocks: Array.from({ length: 12 }, (_, i) => ({ type: 'text', text: `${i} ` + 'я'.repeat(900) })) }
    const m = ruleMail(long, { time: '10:00' })
    expect(m.tg!.parts!.length).toBeGreaterThan(1)
    expect([m.tg!.html, ...m.tg!.parts!].every(t => t.length < 4000)).toBe(true)
    expect(m.tg!.button?.url).toContain('?g=x')
  })

  it('разметка экранируется', () => {
    const m = ruleMail({ id: 'x', ko: 'a<b', ru: 'x&y', section: '', about: '', blocks: [{ type: 'formula', text: '1 < 2' }, { type: 'table', head: ['а'], rows: [['б', 'в']] }] }, { time: '10:00' })
    expect(m.tg!.html).toContain('a&lt;b — x&amp;y')
    expect(m.tg!.html).toContain('<code>1 &lt; 2</code>')
    expect(m.tg!.html).toContain('б · в')
  })
})

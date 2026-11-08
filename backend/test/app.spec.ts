import 'reflect-metadata'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'

const OWNER = process.env.PROGRESS_TOKEN as string
let app: INestApplication

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = mod.createNestApplication()
  app.setGlobalPrefix('api')
  await app.init()
})

afterAll(async () => {
  await app.close()
})

describe('здоровье и защита', () => {
  it('GET /api/health открыт и сообщает, что база читается', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('закрытый маршрут без токена отвечает 401', async () => {
    await request(app.getHttpServer()).get('/api/progress').expect(401)
  })

  it('чужой токен не подходит', async () => {
    await request(app.getHttpServer()).get('/api/progress').set('Authorization', 'Bearer wrong-token').expect(401)
  })

  it('токен владельца открывает прогресс', async () => {
    const res = await request(app.getHttpServer()).get('/api/progress').set('Authorization', `Bearer ${OWNER}`).expect(200)
    expect(typeof res.body).toBe('object')
  })

  it('неизвестный адрес API отвечает 404', async () => {
    await request(app.getHttpServer()).get('/api/no-such-route').set('Authorization', `Bearer ${OWNER}`).expect(404)
  })
})

describe('заметки', () => {
  const auth = { Authorization: `Bearer ${OWNER}` }
  const note = { id: 'n1', title: 'Заголовок', text: 'Текст заметки', created: 1, updated: 2 }

  it('PUT сохраняет заметки, GET отдаёт их обратно', async () => {
    await request(app.getHttpServer()).put('/api/notes').set(auth).send({ v: 1, updated: 2, notes: [note] }).expect(200)
    const res = await request(app.getHttpServer()).get('/api/notes').set(auth).expect(200)
    expect(res.body.notes).toHaveLength(1)
    expect(res.body.notes[0]).toMatchObject({ id: 'n1', title: 'Заголовок', text: 'Текст заметки' })
  })

  it('неверный формат отклоняется 400, старые заметки остаются', async () => {
    await request(app.getHttpServer()).put('/api/notes').set(auth).send({ v: 2, notes: [] }).expect(400)
    const res = await request(app.getHttpServer()).get('/api/notes').set(auth).expect(200)
    expect(res.body.notes).toHaveLength(1)
  })

  it('без токена заметки закрыты', async () => {
    await request(app.getHttpServer()).get('/api/notes').expect(401)
  })
})

describe('новые слова (вкладка «Записанные слова»)', () => {
  const auth = { Authorization: `Bearer ${OWNER}` }
  const word = { ko: '기다리다', reading: 'кидарида', ru: 'ждать', example: '저는 카페에서 친구를 기다려요.' }

  it('без токена закрыто', async () => {
    await request(app.getHttpServer()).get('/api/new-words').expect(401)
    await request(app.getHttpServer()).post('/api/new-words').send(word).expect(401)
  })

  it('добавить, прочитать, изменить, удалить', async () => {
    const http = app.getHttpServer()
    const added = await request(http).post('/api/new-words').set(auth).send({ ...word, ko: ' 기다리다 ' }).expect(201)
    expect(added.body).toMatchObject({ ko: '기다리다', ru: 'ждать', note: '' }) // пробелы по краям убраны
    const id = added.body.id as string
    const list = await request(http).get('/api/new-words').set(auth).expect(200)
    expect(list.body.words.some((w: { id: string }) => w.id === id)).toBe(true)
    const upd = await request(http).put(`/api/new-words/${id}`).set(auth).send({ ...word, ru: 'ожидать' }).expect(200)
    expect(upd.body.ru).toBe('ожидать')
    await request(http).delete(`/api/new-words/${id}`).set(auth).expect(200)
    await request(http).delete(`/api/new-words/${id}`).set(auth).expect(404)
  })

  it('нужны слово и перевод либо хотя бы заметка; слишком длинное и не-строки отклоняются', async () => {
    const http = app.getHttpServer()
    await request(http).post('/api/new-words').set(auth).send({ ko: '먹다' }).expect(400)
    await request(http).post('/api/new-words').set(auth).send({ ru: 'есть' }).expect(400)
    await request(http).post('/api/new-words').set(auth).send({ ko: 'x'.repeat(61), ru: 'a' }).expect(400)
    await request(http).post('/api/new-words').set(auth).send({ ko: 5, ru: 'a' }).expect(400)
    const note = await request(http).post('/api/new-words').set(auth).send({ note: 'Услышал «괜찮아요»: так вежливо отказываются?' }).expect(201)
    await request(http).delete(`/api/new-words/${note.body.id}`).set(auth).expect(200)
  })
})

describe('временный токен входящих (кнопка «Создать токен»)', () => {
  const owner = { Authorization: `Bearer ${OWNER}` }
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })
  const create = async () => (await request(app.getHttpServer()).post('/api/new-words/token').set(owner).expect(200)).body as { token: string; expires: number }

  it('создаёт токен на 10 минут; без токена владельца создать нельзя', async () => {
    await request(app.getHttpServer()).post('/api/new-words/token').expect(401)
    const t = await create()
    expect(t.token).toMatch(/^[a-f0-9]{48}$/)
    expect(t.expires - Date.now()).toBeGreaterThan(9 * 60 * 1000)
    expect(t.expires - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000)
  })

  it('читает список новых слов', async () => {
    const { token } = await create()
    await request(app.getHttpServer()).get('/api/new-words').set(bearer(token)).expect(200)
  })

  it('ничего не пишет: POST, PUT, DELETE и создание токена дают 403', async () => {
    const http = app.getHttpServer()
    const { token } = await create()
    await request(http).post('/api/new-words').set(bearer(token)).send({ ko: 'a', ru: 'b' }).expect(403)
    await request(http).put('/api/new-words/x').set(bearer(token)).send({ ko: 'a', ru: 'b' }).expect(403)
    await request(http).delete('/api/new-words/x').set(bearer(token)).expect(403)
    await request(http).post('/api/new-words/token').set(bearer(token)).expect(403)
    await request(http).delete('/api/new-words/token').set(bearer(token)).expect(403)
  })

  it('остальные маршруты закрыты: прогресс, заметки, магазин', async () => {
    const { token } = await create()
    for (const url of ['/api/progress', '/api/notes', '/api/shop']) await request(app.getHttpServer()).get(url).set(bearer(token)).expect(403)
  })

  it('новый токен отменяет прежний, отзыв закрывает доступ, неверный токен 401', async () => {
    const http = app.getHttpServer()
    const first = await create()
    const second = await create()
    await request(http).get('/api/new-words').set(bearer(first.token)).expect(401)
    await request(http).get('/api/new-words').set(bearer(second.token)).expect(200)
    await request(http).delete('/api/new-words/token').set(owner).expect(200)
    await request(http).get('/api/new-words').set(bearer(second.token)).expect(401)
    await request(http).get('/api/new-words').set(bearer('wrong-token')).expect(401)
    await request(http).get('/api/new-words').set(owner).expect(200) // токен владельца по-прежнему работает
  })

  it('просроченный токен не подходит', async () => {
    const { token } = await create()
    const { Db } = await import('../src/db/db.service')
    const { INBOX_META } = await import('../src/auth/auth.service')
    const db = app.get(Db)
    const raw = JSON.parse((await db.getMeta(INBOX_META)) as string) as { h: string; exp: number }
    await db.setMeta(INBOX_META, JSON.stringify({ ...raw, exp: Date.now() - 1000 }))
    await request(app.getHttpServer()).get('/api/new-words').set(bearer(token)).expect(401)
  })
})

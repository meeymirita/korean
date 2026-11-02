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

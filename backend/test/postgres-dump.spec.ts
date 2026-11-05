import { describe, expect, it } from 'vitest'
import { postgresDumpConfig } from '../src/db/postgres-dump'

describe('параметры резервной копии PostgreSQL', () => {
  it('переносит схему из Prisma URL в отдельный аргумент pg_dump', () => {
    const result = postgresDumpConfig('/tmp/db.dump', {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app?schema=test_123&sslmode=require',
    })
    expect(result.args).toEqual(['--format=custom', '--no-owner', '--file', '/tmp/db.dump', '--dbname', 'postgresql://user:pass@localhost:5432/app?sslmode=require', '--schema', 'test_123'])
    expect(result.env).toEqual({})
  })

  it('принимает чистый URL и URL для дампа с отдельной схемой', () => {
    const result = postgresDumpConfig('/tmp/db.dump', {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
      PG_DUMP_DATABASE_URL: 'postgresql://backup:pass@localhost:5432/app',
      PG_DUMP_SCHEMA: 'private_copy',
    })
    expect(result.args.slice(-2)).toEqual(['--schema', 'private_copy'])
    expect(result.args).toContain('postgresql://backup:pass@localhost:5432/app')
  })

  it('отклоняет некорректную схему и отсутствующий адрес', () => {
    expect(() => postgresDumpConfig('/tmp/db.dump', { DATABASE_URL: 'postgresql://localhost/app?schema=bad;name' })).toThrow()
    expect(() => postgresDumpConfig('/tmp/db.dump', {})).toThrow()
  })
})

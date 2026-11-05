import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '../backend/dist/generated/prisma/client.js'

const backendRequire = createRequire(fileURLToPath(new URL('../backend/package.json', import.meta.url)))

export function createPrismaClient(options) {
  const { PrismaPg } = backendRequire('@prisma/adapter-pg')
  const connectionString = options?.datasources?.db?.url || process.env.DATABASE_URL
  if (!connectionString) throw new Error('Не задан DATABASE_URL для тестового Prisma Client')
  const url = new URL(connectionString)
  const schema = url.searchParams.get('schema') || undefined
  url.searchParams.delete('schema')
  if (schema) url.searchParams.set('options', `-c search_path=${schema}`)
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, schema ? { schema } : undefined) })
}

const numberify = value => {
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(numberify)
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numberify(item)]))
  return value
}

/** Доступ к тестовой PostgreSQL-схеме, созданной для отдельного тестового сервера. */
export async function withDb(server, run) {
  const url = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
  url.searchParams.set('schema', server.schema)
  const prisma = createPrismaClient({ datasources: { db: { url: url.toString() } } })
  try {
    return await run({
      all: async (sql, ...values) => numberify(await prisma.$queryRawUnsafe(sql, ...values)),
      get: async (sql, ...values) => numberify((await prisma.$queryRawUnsafe(sql, ...values))[0]),
      run: (sql, ...values) => prisma.$executeRawUnsafe(sql, ...values),
    })
  } finally {
    await prisma.$disconnect()
  }
}

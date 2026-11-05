/** Доступ к PostgreSQL через Prisma Client и общий контекст транзакции. */
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../generated/prisma/client.js'
import { AsyncLocalStorage } from 'node:async_hooks'

type Param = string | number | bigint | boolean | null | Date | Buffer
type Client = PrismaClient | Prisma.TransactionClient

/** Переводит позиционные параметры старого SQL в нумерованные параметры PostgreSQL. */
export function postgresPlaceholders(query: string) {
  let out = ''
  let index = 0
  let quote: "'" | '"' | '`' | null = null
  let lineComment = false
  let blockComment = false
  for (let i = 0; i < query.length; i++) {
    const char = query[i]
    const next = query[i + 1]
    if (lineComment) {
      out += char
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      out += char
      if (char === '*' && next === '/') { out += next; i++; blockComment = false }
      continue
    }
    if (!quote && char === '-' && next === '-') { out += '--'; i++; lineComment = true; continue }
    if (!quote && char === '/' && next === '*') { out += '/*'; i++; blockComment = true; continue }
    if (quote) {
      out += char
      if (char === quote) {
        if (next === quote) { out += next; i++ } else quote = null
      } else if (char === '\\' && next && quote !== '"') { out += next; i++ }
      continue
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; out += char; continue }
    if (char === '?') { out += `$${++index}`; continue }
    out += char
  }
  return out
}

function numbers<T>(value: T): T {
  if (typeof value === 'bigint') return Number(value) as T
  if (Array.isArray(value)) return value.map(numbers) as T
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numbers(item)])) as T
  }
  return value
}

@Injectable()
export class Db implements OnModuleDestroy {
  private readonly prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
  private readonly transaction = new AsyncLocalStorage<Client>()
  private readonly ready = this.prisma.$connect()

  async orm() {
    await this.ready
    return this.transaction.getStore() ?? this.prisma
  }

  async all<T = Record<string, unknown>>(query: string, ...params: Param[]): Promise<T[]> {
    const client = await this.orm()
    const rows = await client.$queryRawUnsafe<unknown[]>(postgresPlaceholders(query), ...params)
    return numbers(rows) as T[]
  }

  async get<T = Record<string, unknown>>(query: string, ...params: Param[]): Promise<T | undefined> {
    return (await this.all<T>(query, ...params))[0]
  }

  async run(query: string, ...params: Param[]) {
    const client = await this.orm()
    const changes = await client.$executeRawUnsafe(postgresPlaceholders(query), ...params)
    return { changes }
  }

  /** Запросы внутри callback используют одну транзакцию Prisma. */
  async tx<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.ready
    return this.prisma.$transaction(async tx => this.transaction.run(tx, fn))
  }

  async getMeta(key: string): Promise<string | undefined> {
    const row = await (await this.orm()).meta.findUnique({ where: { key }, select: { value: true } })
    return row?.value
  }

  async setMeta(key: string, value: string) {
    await (await this.orm()).meta.upsert({ where: { key }, create: { key, value }, update: { value } })
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect()
  }
}

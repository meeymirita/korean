import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { NotifyService } from '../notify/notify.service.js'
import { DictVisits } from './dict.visits.service.js'
import { logError } from '../log.js'

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** Сообщение содержит только агрегаты, публичные слова и домены источников; адресов посетителей нет в самой статистике. */
export function formatDictVisitsWeekly(summary: Awaited<ReturnType<DictVisits['summary']>>, now = new Date()) {
  const kind: Record<string, string> = { word: 'слова', set: 'подборки' }
  const top = summary.top.slice(0, 8).map(row => `${kind[row.kind] ?? row.kind} «${row.ref}» (${row.n})`).join(', ') || 'пока нет'
  const sources = summary.sources.slice(0, 5).map(row => `${row.src} (${row.n})`).join(', ') || 'прямые заходы или источник не определён'
  const bots = summary.byBot.slice(0, 5).map(row => `${row.who} ${row.n}`).join(', ') || 'нет'
  const pages = summary.byKind.filter(row => row.kind === 'word' || row.kind === 'set').map(row => `${kind[row.kind]}: ${row.n}`).join(', ') || 'нет данных'
  const end = dayOf(now)
  return [
    `Словарь за неделю · ${summary.since} — ${end}`,
    `Заходы: люди ${summary.human}, роботы ${summary.bots}.`,
    `Просмотры: ${pages}.`,
    `Популярные слова и подборки: ${top}.`,
    `Источники: ${sources}.`,
    `Роботы: ${bots}.`,
  ].join('\n')
}

@Injectable()
export class DictVisitsWeekly implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(private readonly db: Db, private readonly visits: DictVisits, private readonly notify: NotifyService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.weekly().catch(e => logError('недельная сводка словаря:', (e as Error).message)), 60_000)
    this.timer.unref()
  }

  onModuleDestroy() { clearInterval(this.timer) }

  async weekly(now = new Date()): Promise<'off' | 'early' | 'already' | 'sent' | 'failed'> {
    if (now.getDay() !== 1) return 'off'
    const time = '21:10'
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    if (hhmm < time) return 'early'
    const day = dayOf(now)
    if (await this.db.getMeta('dict-visits:weekly') === day) return 'already'
    await this.db.setMeta('dict-visits:weekly', day)
    try {
      const summary = await this.visits.summary(7, now.getTime())
      await this.notify.sendToTopic('alert', formatDictVisitsWeekly(summary, now))
      return 'sent'
    } catch (e) {
      logError('недельная сводка словаря не отправилась:', (e as Error).message)
      return 'failed'
    }
  }
}

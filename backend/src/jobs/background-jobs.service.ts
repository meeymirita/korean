import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'

type Handler = (job: Job) => Promise<unknown>
const QUEUE = 'korean-background'
export const JOB_DEFAULT_OPTIONS = { attempts: 5, backoff: { type: 'exponential' as const, delay: 5000 }, removeOnComplete: 100, removeOnFail: 100 }
export const JOB_SCHEDULES = [
  { id: 'digest-minute', repeat: { every: 60_000 }, name: 'digest.tick' },
  { id: 'reminder-minute', repeat: { every: 60_000 }, name: 'reminder.tick' },
  { id: 'backup-nightly', repeat: { pattern: '30 2 * * *', tz: 'Asia/Novosibirsk' }, name: 'backup.run' },
  { id: 'trash-daily', repeat: { pattern: '40 3 * * *', tz: 'Asia/Novosibirsk' }, name: 'trash.purge' },
  { id: 'notes-remind-minute', repeat: { every: 60_000 }, name: 'notes.remind' },
] as const

@Injectable()
export class BackgroundJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundJobs.name)
  private readonly handlers = new Map<string, Handler>()
  private queue?: Queue
  private worker?: Worker
  private producer?: Redis
  private consumer?: Redis
  private timers: NodeJS.Timeout[] = []

  register(name: string, handler: Handler) {
    this.handlers.set(name, handler)
  }

  onApplicationBootstrap() {
    void this.start()
  }

  private async start() {
    if (process.env.NODE_ENV === 'test') return
    const url = process.env.REDIS_URL
    if (!url) {
      this.logger.warn('REDIS_URL не задан: фоновые задачи работают на таймерах внутри процесса')
      this.startLocalTimers()
      return
    }
    // Redis не отвечает дольше 15 секунд: письма и копии не должны молча остановиться, поэтому идём на таймеры
    const guard = setTimeout(() => {
      this.logger.error('Redis не ответил за 15 с: фоновые задачи временно на таймерах внутри процесса')
      this.startLocalTimers()
    }, 15_000)
    try {
      this.producer = new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 1500, retryStrategy: n => Math.min(n * 1000, 30_000) })
      this.consumer = new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 1500, retryStrategy: n => Math.min(n * 1000, 30_000) })
      this.queue = new Queue(QUEUE, { connection: this.producer, defaultJobOptions: JOB_DEFAULT_OPTIONS })
      this.worker = new Worker(QUEUE, job => {
        const handler = this.handlers.get(job.name)
        if (!handler) throw new Error(`Неизвестная фоновая задача: ${job.name}`)
        return handler(job)
      }, { connection: this.consumer, concurrency: 1 })
      this.worker.on('failed', (job, error) => this.logger.error(`Задача ${job?.name} не выполнена: ${error.message}`))
      this.worker.on('error', error => this.logger.error(`Ошибка Redis worker: ${error.message}`))
      this.producer.on('error', error => this.logger.error(`Ошибка Redis producer: ${error.message}`))

      for (const schedule of JOB_SCHEDULES) {
        const repeat = schedule.id === 'backup-nightly' || schedule.id === 'trash-daily'
          ? { ...schedule.repeat, tz: process.env.TZ || schedule.repeat.tz }
          : schedule.repeat
        await this.queue.upsertJobScheduler(schedule.id, repeat, { name: schedule.name })
      }
      await this.queue.add('backup.run', {}, { jobId: `backup-start-${new Date().toISOString().slice(0, 10)}` })
      this.logger.log('Очередь Redis/BullMQ запущена')
    } catch (error) {
      this.logger.error(`Очередь Redis недоступна: ${(error as Error).message}`)
      this.startLocalTimers()
    } finally {
      clearTimeout(guard)
    }
  }

  /** Запасной вариант без Redis: те же задачи по таймеру. Повторный запуск безопасен: письма и копии идемпотентны (день последнего письма, файл копии на дату). */
  private startLocalTimers() {
    if (this.timers.length) return
    const run = async (name: string) => {
      try { await this.handlers.get(name)?.({ name } as Job) } catch (e) { this.logger.error(`Задача ${name} не выполнена: ${(e as Error).message}`) }
    }
    const every = (name: string, ms: number, now = false) => {
      const timer = setInterval(() => void run(name), ms)
      timer.unref()
      this.timers.push(timer)
      if (now) void run(name)
    }
    const tick = Number(process.env.REMINDER_TICK_MS) || 60_000
    every('digest.tick', tick)
    every('reminder.tick', tick)
    every('notes.remind', tick)
    every('backup.run', 6 * 3600_000, true)
    every('trash.purge', 6 * 3600_000, true)
  }

  async onModuleDestroy() {
    this.timers.forEach(clearInterval)
    this.timers = []
    await this.worker?.close()
    await this.queue?.close()
    await this.producer?.quit()
    await this.consumer?.quit()
  }
}

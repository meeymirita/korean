import { describe, expect, it } from 'vitest'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { randomUUID } from 'node:crypto'
import { JOB_DEFAULT_OPTIONS, JOB_SCHEDULES } from '../src/jobs/background-jobs.service.js'

describe('BullMQ scheduling policy', () => {
  it('retries with exponential backoff and keeps bounded job history', () => {
    expect(JOB_DEFAULT_OPTIONS).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    })
  })

  it('defines stable shared schedulers for digest, reminder, nightly backup and daily trash purge', () => {
    expect(JOB_SCHEDULES.map(x => x.id)).toEqual(['digest-minute', 'reminder-minute', 'backup-nightly', 'trash-daily', 'notes-remind-minute', 'rule-minute'])
    expect(JOB_SCHEDULES[2]).toMatchObject({ repeat: { pattern: '30 2 * * *', tz: 'Asia/Novosibirsk' } })
  })
})

describe.skipIf(process.env.RUN_REDIS_INTEGRATION !== '1')('BullMQ with live Redis', () => {
  const connection = () => {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for BullMQ integration tests')
    return new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  }

  it('retries a failed job, upserts a repeat scheduler and shuts the worker down', async () => {
    const name = `test-jobs-${randomUUID()}`
    const queue = new Queue(name, { connection: connection() })
    const worker = new Worker(name, async () => {
      if (attempts++ === 0) throw new Error('expected retry')
      return 'ok'
    }, { connection: connection(), concurrency: 1 })
    let attempts = 0
    try {
      await queue.upsertJobScheduler('minute', { every: 60_000 }, { name: 'scheduled' })
      expect(await queue.getJobScheduler('minute')).toBeTruthy()
      const completed = new Promise<unknown>((resolve, reject) => {
        worker.once('completed', job => resolve(job.returnvalue))
        worker.on('failed', (job, error) => { if ((job?.attemptsMade ?? 0) >= 2) reject(error) })
      })
      await queue.add('retry', {}, { attempts: 2, backoff: { type: 'exponential', delay: 50 }, removeOnComplete: true })
      await expect(Promise.race([completed, new Promise((_, reject) => setTimeout(() => reject(new Error('job timed out')), 5000))])).resolves.toBe('ok')
      expect(attempts).toBe(2)
    } finally {
      await worker.close()
      await queue.removeJobScheduler('minute')
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

describe('BackgroundJobs: без двойных запусков', () => {
  it('одна и та же задача не идёт дважды одновременно', async () => {
    const { BackgroundJobs } = await import('../src/jobs/background-jobs.service.js')
    const jobs = new BackgroundJobs()
    let calls = 0
    let release!: () => void
    jobs.register('digest.tick', () => {
      calls++
      return new Promise<void>(resolve => (release = resolve))
    })
    const first = jobs.runOnce('digest.tick', { name: 'digest.tick' } as never)
    expect(await jobs.runOnce('digest.tick', { name: 'digest.tick' } as never)).toBe(false) // второй запуск пока первый идёт пропущен
    release()
    expect(await first).toBe(true)
    const third = jobs.runOnce('digest.tick', { name: 'digest.tick' } as never) // после окончания можно снова
    release()
    expect(await third).toBe(true)
    expect(calls).toBe(2)
  })
  it('запасные таймеры можно остановить, когда очередь заработала', async () => {
    const { BackgroundJobs } = await import('../src/jobs/background-jobs.service.js')
    const jobs = new BackgroundJobs()
    for (const n of ['digest.tick', 'reminder.tick', 'notes.remind', 'rule.tick', 'backup.run', 'trash.purge']) jobs.register(n, async () => {})
    jobs.startLocalTimers()
    expect(jobs.localTimerCount).toBe(6)
    jobs.startLocalTimers() // повторный запуск ничего не добавляет
    expect(jobs.localTimerCount).toBe(6)
    jobs.stopLocalTimers()
    expect(jobs.localTimerCount).toBe(0)
  })
})

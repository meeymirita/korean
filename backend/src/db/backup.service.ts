/** Периодический дамп PostgreSQL: DATA_DIR/backups/app-ГГГГ-ММ-ДД.dump, хранятся последние 30. */
import { Injectable, OnModuleInit } from '@nestjs/common'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { BACKUPS, KEEP_BACKUPS } from '../config.js'
import { postgresDumpConfig } from './postgres-dump.js'
import { BackgroundJobs } from '../jobs/background-jobs.service.js'
import { logError } from '../log.js'

@Injectable()
export class BackupService implements OnModuleInit {
  constructor(private readonly jobs: BackgroundJobs) {}

  onModuleInit() {
    this.jobs.register('backup.run', () => this.backup())
  }

  async backup() {
    try {
      mkdirSync(BACKUPS, { recursive: true })
      const target = path.join(BACKUPS, `app-${new Date().toISOString().slice(0, 10)}.dump`)
      if (!existsSync(target)) await new Promise<void>((resolve, reject) => {
        const dump = postgresDumpConfig(target)
        const child = spawn(process.env.PG_DUMP_BIN || 'pg_dump', dump.args, {
          stdio: 'ignore',
          env: { ...process.env, ...dump.env },
        })
        child.once('error', reject)
        child.once('close', code => code === 0 ? resolve() : reject(new Error(`pg_dump завершился с кодом ${code}`)))
      })
      const files = readdirSync(BACKUPS).filter(f => f.startsWith('app-')).sort()
      for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) unlinkSync(path.join(BACKUPS, old))
    } catch (e) {
      logError('копия базы не создалась:', (e as Error).message) // копия — страховка, на работу сервера не влияет
      throw e // BullMQ повторит попытку с backoff и запишет исчерпанные попытки в failed jobs.
    }
  }
}

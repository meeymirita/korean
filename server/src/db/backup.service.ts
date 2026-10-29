/** Ежедневная копия базы: DATA_DIR/backups/app-ГГГГ-ММ-ДД.db, хранятся последние 30. */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { BACKUPS, KEEP_BACKUPS } from '../config'
import { Db } from './db.service'

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(private readonly db: Db) {}

  onModuleInit() {
    this.backup()
    this.timer = setInterval(() => this.backup(), 6 * 3600 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  backup() {
    try {
      mkdirSync(BACKUPS, { recursive: true })
      const target = path.join(BACKUPS, `app-${new Date().toISOString().slice(0, 10)}.db`)
      if (!existsSync(target)) this.db.sql.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
      const files = readdirSync(BACKUPS).filter(f => f.startsWith('app-')).sort()
      for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) unlinkSync(path.join(BACKUPS, old))
    } catch (e) {
      console.error('копия базы не создалась:', (e as Error).message) // копия — страховка, на работу сервера не влияет
    }
  }
}

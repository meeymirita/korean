import { Controller, Get, HttpCode, Post } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Owner } from '../auth/auth'
import { DATA_DIR } from '../config'
import { BackupArchiveService, STEPS } from './backup-archive.service'

/** GET /api/backup/status: итог последнего запуска scripts/backup.sh (он пишет DATA/backup-status.json). Только владельцу: кабинет показывает, свежая ли копия. */
@Owner()
@Controller('backup')
export class BackupStatusController {
  constructor(private readonly archive: BackupArchiveService) {}

  /** POST /api/backup/run: собрать полный архив, зашифровать и отправить на почту; идёт в фоне, ход виден в status. */
  @Post('run')
  @HttpCode(202)
  run() {
    const problems = this.archive.problems()
    if (problems.length) return { started: false, message: problems[0] }
    return { started: this.archive.start(), message: '' }
  }

  /** POST /api/backup/test: короткая проверка почты (письмо), без архива. */
  @Post('test')
  @HttpCode(200)
  test() {
    return this.archive.test()
  }

  @Get('status')
  status() {
    return { ...this.script(), archive: { steps: STEPS, job: this.archive.job, last: this.archive.last(), targets: this.archive.targets(), problems: this.archive.problems() } }
  }

  /** Итог ночного скрипта scripts/backup.sh (если он когда-либо запускался). */
  private script() {
    try {
      const s = JSON.parse(readFileSync(path.join(DATA_DIR, 'backup-status.json'), 'utf8')) as { ok?: unknown; time?: unknown; sizeKb?: unknown; offsite?: unknown; message?: unknown }
      return {
        configured: true,
        ok: s.ok === true,
        time: Number(s.time) || 0,
        sizeKb: Number(s.sizeKb) || 0,
        offsite: s.offsite === true,
        message: typeof s.message === 'string' ? s.message.slice(0, 300) : '',
      }
    } catch {
      return { configured: false }
    }
  }
}

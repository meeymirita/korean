/**
 * Напоминания по заметкам: раз в минуту ищет заметки, у которых подошло «Напомнить в» (время сервера), и шлёт сообщение в тему Telegram «Напоминания».
 * Метка «отправлено» ставится до отправки (как у подборки); не вышло — метка снимается, следующая проверка повторит, но не позже суток от времени напоминания.
 * Заметка в корзине не напоминает.
 */
import { Injectable, OnModuleInit } from '@nestjs/common'
import { TwoFaService } from '../auth/twofa.service.js'
import { Db } from '../db/db.service.js'
import { BackgroundJobs } from '../jobs/background-jobs.service.js'
import { logError } from '../log.js'
import { noteRemindMail } from '../mail/templates.js'
import { NotifyService } from '../notify/notify.service.js'
import { remindState } from './remind.js'

const pad = (n: number) => String(n).padStart(2, '0')
/** Местное время сервера в виде «ГГГГ-ММ-ДДTЧЧ:ММ» (так хранится remindAt: строки сравниваются как время). */
export const wallClock = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

@Injectable()
export class NoteRemindService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly notify: NotifyService,
    private readonly twofa: TwoFaService,
    private readonly jobs: BackgroundJobs,
  ) {}

  onModuleInit() {
    this.jobs.register('notes.remind', () => this.tick())
  }

  /** Одна проверка. Возвращает, сколько напоминаний отправлено (для тестов). */
  async tick(now = new Date()): Promise<number> {
    const db = await this.db.orm()
    const rows = await db.note.findMany({ where: { deletedAt: null, remindSent: false, remindAt: { not: null, lte: wallClock(now) } } })
    const due = rows.filter(r => remindState(r, now) === 'due')
    // просроченные больше суток помечаем отправленными: больше не проверяем
    const stale = rows.filter(r => remindState(r, now) === 'stale').map(r => r.id)
    if (stale.length) await db.note.updateMany({ where: { id: { in: stale } }, data: { remindSent: true } })
    if (!due.length) return 0
    const to = process.env.REMINDER_MAIL_TO || await this.twofa.email()
    if (!this.notify.ready(to)) return 0
    let sent = 0
    for (const r of due) {
      // метка до отправки; если заметку тем временем убрали или метку поставили, пропускаем
      const claim = await db.note.updateMany({ where: { id: r.id, deletedAt: null, remindSent: false }, data: { remindSent: true } })
      if (!claim.count) continue
      try {
        await this.notify.send(noteRemindMail({ title: r.title, text: r.text, site: process.env.SITE_URL }), to)
        sent++
      } catch (e) {
        logError('напоминание по заметке не отправилось:', (e as Error).message)
        await db.note.updateMany({ where: { id: r.id, remindSent: true, remindAt: r.remindAt }, data: { remindSent: false } })
      }
    }
    return sent
  }
}

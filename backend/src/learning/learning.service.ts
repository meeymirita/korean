/** Краткая сводка «что изучено и пройдено» для владельца и его токена (Claude из десктопного приложения). */
import { Injectable } from '@nestjs/common'
import { KNOWN_GRAMMAR, KNOWN_NOT_YET } from '../chat/curriculum.js'
import { Db } from '../db/db.service.js'
import { ProgressService } from '../progress/progress.service.js'
import { dayKey, grammarList, mistakesSummary, notYetList, streakOf, weakModes, wordsSummary } from './learning.summary.js'

@Injectable()
export class LearningService {
  constructor(
    private readonly db: Db,
    private readonly progress: ProgressService,
  ) {}

  async summary() {
    const orm = await this.db.orm()
    const now = Date.now()
    const week = await this.progress.report(7)
    const month = await this.progress.report(30)
    const days = await orm.day.findMany({ where: { total: { gt: 0 } }, select: { day: true } })
    const words = (await orm.word.findMany()).map(w => ({ word: w.word, ok: w.ok, bad: w.bad, streak: w.streak, last: Number(w.last), kd: w.kd ? Number(w.kd) : null }))
    const lastAnswer = words.reduce((m, w) => Math.max(m, w.last), 0)
    const passed = grammarList(KNOWN_GRAMMAR)
    const batches = (await orm.material.findMany({ select: { created: true, items: true } })).map(b => ({ created: Number(b.created), items: JSON.parse(b.items) as unknown[] }))
    return {
      generated: new Date(now).toISOString(),
      about: 'Краткая сводка об обучении (платформа 우리말): что пройдено и как идёт учёба. Задания и объяснения строй только на пройденном; темы из notYet ещё не проходили.',
      grammar: {
        passedCount: passed.length,
        passed,
        notYet: notYetList(KNOWN_NOT_YET),
        details: 'подробно по каждой пройденной теме: /api/public/grammar; все слова словаря: /words.json; все предложения: /api/public/sentences',
      },
      words: wordsSummary(words, now),
      activity: {
        streakDays: streakOf(days.map(d => d.day), now),
        today: dayKey(now),
        lastAnswer: lastAnswer ? dayKey(lastAnswer) : null,
        last7Days: { ok: week.totals.ok, bad: week.totals.bad, activeDays: week.totals.activeDays, minutes: Math.round(week.totals.seconds / 60) },
        last30Days: { ok: month.totals.ok, bad: month.totals.bad, activeDays: month.totals.activeDays, minutes: Math.round(month.totals.seconds / 60) },
        weakModes: weakModes(month.rows),
      },
      homework: { mistakes: mistakesSummary(batches), hint: 'ошибки из проверок тетради (элементы mistake в присланных материалах): повторяй эти темы и составляй задания на них' },
      inbox: {
        newWords: await orm.newWord.count(),
        materialsToReview: await orm.material.count({ where: { status: 'new' } }),
      },
    }
  }
}

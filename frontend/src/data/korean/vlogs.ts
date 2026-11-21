import { BUKCHON } from './vlog-bukchon'

/** Влоги для «Влога»: видео с ютуба (встраивается плеером, файла у нас нет) и разобранный по фразам текст со временем. */
export interface VlogLine {
  /** начало и конец фразы, секунды */
  s: number
  e: number
  ko: string
  ru: string
}

export interface Vlog {
  /** адрес страницы: ?v=<id> */
  id: string
  /** номер видео на ютубе (11 знаков) */
  yt: string
  title: string
  /** имя скачанного видео: `data/vlog/<имя>.mp4` на сервере или `vlog-<имя>.mp4` на Диске; без него играет плеер ютуба */
  file?: string
  /** автор канала, указывается рядом с видео */
  channel: string
  /** кратко, чем полезно: «медленная речь, быт» */
  note: string
  lines: VlogLine[]
}

/** Номер видео ютуба: ровно 11 знаков из латиницы, цифр, «-» и «_». */
export const YT_ID = /^[A-Za-z0-9_-]{11}$/

export const VLOGS: Vlog[] = [BUKCHON]

/** Фраза, которая звучит в секунду `t` (последняя из начавшихся); до первой фразы -1. */
export function lineAt(lines: readonly VlogLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid]!.s <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** Ошибки в данных влога (пустой список = всё хорошо): порядок времени, пустые тексты, номер видео. */
export function checkVlog(v: Vlog): string[] {
  const bad: string[] = []
  if (!YT_ID.test(v.yt)) bad.push('номер видео')
  v.lines.forEach((l, i) => {
    if (!l.ko.trim() || !l.ru.trim()) bad.push(`пустой текст в строке ${i + 1}`)
    if (l.e <= l.s) bad.push(`конец не позже начала в строке ${i + 1}`)
    if (i && l.s < v.lines[i - 1]!.s) bad.push(`время идёт назад в строке ${i + 1}`)
  })
  return bad
}

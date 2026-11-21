import { BUKCHON } from './vlog-bukchon'
import { NEW_YEAR_CALENDAR } from './vlog-new-year-calendar'
import { HOMEBODY_VS_OUTGOING } from './vlog-homebody-vs-outgoing'
import { ERRANDS_DAY } from './vlog-errands-day'
import { BREAKFAST_ROUTINE } from './vlog-breakfast-routine'
import { AIRPORT_TRIP } from './vlog-airport-trip'
import { ISTANBUL_WALK } from './vlog-istanbul-walk'
import { CONVENIENCE_STORE } from './vlog-convenience-store'
import { WEEKEND_ROUTINE } from './vlog-weekend-routine'
import { SUPERMARKET } from './vlog-supermarket'
import { BIRTHDAY_CARD } from './vlog-birthday-card'
import { ICE_CREAM_SHOP } from './vlog-ice-cream-shop'
import { MY_SATURDAY } from './vlog-my-saturday'
import { SEOUL_WALK } from './vlog-seoul-walk'
import { HAIR_SALON } from './vlog-hair-salon'
import { BOOKSTORE } from './vlog-bookstore'
import { WINTER_SNACKS } from './vlog-winter-snacks'
import { LUNAR_NEW_YEAR_SOUP } from './vlog-lunar-new-year-soup'

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
  /** видео скачано и лежит у нас: файл `<yt>.mp4` в папке `korean_vlog` на Диске (локально `data/vlog/`); без него играет плеер ютуба */
  own?: boolean
  /** автор канала, указывается рядом с видео */
  channel: string
  /** кратко, чем полезно: «медленная речь, быт» */
  note: string
  lines: VlogLine[]
}

/** Номер видео ютуба: ровно 11 знаков из латиницы, цифр, «-» и «_». */
export const YT_ID = /^[A-Za-z0-9_-]{11}$/

export const VLOGS: Vlog[] = [NEW_YEAR_CALENDAR, HOMEBODY_VS_OUTGOING, ERRANDS_DAY, BREAKFAST_ROUTINE, AIRPORT_TRIP, ISTANBUL_WALK, CONVENIENCE_STORE, WEEKEND_ROUTINE, SUPERMARKET, BIRTHDAY_CARD, ICE_CREAM_SHOP, MY_SATURDAY, SEOUL_WALK, HAIR_SALON, BOOKSTORE, WINTER_SNACKS, LUNAR_NEW_YEAR_SOUP, BUKCHON]

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

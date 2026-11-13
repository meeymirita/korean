/** Профиль ученика, сохраняемый в настройках прогресса. */
export interface Profile {
  name: string
  avatar: string
  /** id картинки из раздела «Картинки» для шапки кабинета; пусто — без обложки */
  cover: string
}

/** Настройки кабинета и тренажёров. */
export interface Settings {
  goal: number
  /** недельная цель: дней занятий (1–7) и верных ответов; нет в старых данных: берётся 5 и 100 (study/week-goal.ts) */
  weekDays?: number
  weekOk?: number
  cats: string[]
  gameCats: Record<string, number> | null
  /** закладки: «w:слово» и «g:id правила» */
  marks: string[]
  /** свои сочетания клавиш: id пункта меню или вкладки кабинета → «mod+alt+shift+KeyG» */
  keys: Record<string, string>
}

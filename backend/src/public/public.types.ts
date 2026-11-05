/** Данные личной карточки, видимые в публичной визитке. */
export interface Card {
  name: string
  avatar: string
  level: number
  title: string
  streak: number
  learned: number
  answers: number
  /** дней с начала пути */
  days: number
}

/** Настройки публичного профиля, хранящиеся в meta. */
export interface Settings {
  enabled: boolean
  /** id обложки кабинета, которую разрешено показывать всем; пусто — не показывать */
  cover: string
  card: Card | null
  updated: number
}

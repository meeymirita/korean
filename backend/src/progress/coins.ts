/** Магазин Юны, награды и достижения: единое место для цен и условий (сайт держит копию названий в src/data/shop.ts). */

export const ITEMS = {
  hint: { price: 15, name: 'Подсказка Юны' },
  fifty: { price: 20, name: '50/50' },
  skip: { price: 10, name: 'Повтор вопроса' },
  shield: { price: 35, name: 'Защита опыта' },
  double: { price: 40, name: 'Двойная награда' },
  second: { price: 30, name: 'Второй шанс' },
} as const
export type ItemId = keyof typeof ITEMS
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]

/** Сюрпризы: покупаются и сразу открываются. */
export const SURPRISES = {
  box: { price: 100, name: 'Случайный набор бонусов' }, // 3–5 расходников
  chest: { price: 120, name: 'Сундук с монетками', min: 60, max: 110 }, // в среднем дешевле цены
  hints: { price: 60, name: 'Набор подсказок', count: 5 },
} as const
export type SurpriseId = keyof typeof SURPRISES

/** Достижения за долгосрочные результаты: монетки один раз. */
export const ACHIEVEMENTS = [
  { id: 'first', name: 'Первые шаги', text: '100 правильных ответов', coins: 30 },
  { id: 'master', name: 'Словарный мастер', text: '500 правильных ответов', coins: 100 },
  { id: 'grammar', name: 'Грамматик', text: '100 заданий по грамматике', coins: 80 },
  { id: 'flawless', name: 'Без ошибок', text: '20 правильных ответов подряд', coins: 50 },
  { id: 'steady', name: 'Постоянство', text: 'Позаниматься в 7 разных дней', coins: 100 },
  { id: 'collector', name: 'Коллекционер', text: 'Купить 10 предметов в магазине', coins: 70 },
] as const

/** Режимы, которые считаются грамматическими заданиями. */
export const GRAMMAR_MODES = ['particles', 'translate', 'forms', 'build']

/** Задания дня и недели. */
export const DAILY = [
  { id: 'answers', name: 'Ответить на 20 вопросов', coins: 10 },
  { id: 'flawless', name: 'Пройти серию без ошибок', coins: 15 },
  { id: 'review', name: 'Повторить 5 слов', coins: 20 },
] as const
export const DAILY_ALL = 30
export const WEEKLY = { id: 'week', name: 'Заниматься 5 дней из 7', days: 5, coins: 50 } as const

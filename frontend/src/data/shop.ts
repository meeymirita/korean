import hint from '@/assets/icons/shop-hint.webp'
import fifty from '@/assets/icons/shop-fifty.webp'
import skip from '@/assets/icons/shop-skip.webp'
import shield from '@/assets/icons/shop-shield.webp'
import double from '@/assets/icons/shop-double.webp'
import second from '@/assets/icons/shop-second.webp'
import box from '@/assets/icons/shop-box.webp'
import chest from '@/assets/icons/shop-chest.webp'
import hints from '@/assets/icons/shop-hints.webp'

/** Предметы и сюрпризы магазина. Цены главные на сервере (`backend/src/progress/coins.ts`), тут они для показа. */
export type ItemId = 'hint' | 'fifty' | 'skip' | 'shield' | 'double' | 'second'
export type SurpriseId = 'box' | 'chest' | 'hints'

export interface ShopItem {
  id: ItemId | SurpriseId
  name: string
  text: string
  price: number
  icon: string
}

export const ITEMS: ShopItem[] = [
  { id: 'hint', name: 'Подсказка Юны', price: 15, icon: hint, text: 'Показывает, с какой буквы начинается ответ, и убирает один неверный вариант.' },
  { id: 'fifty', name: '50/50', price: 20, icon: fifty, text: 'Убирает два неправильных варианта.' },
  { id: 'skip', name: 'Повтор вопроса', price: 10, icon: skip, text: 'Откладывает вопрос в конец серии: ошибкой не считается, награды за него нет.' },
  { id: 'shield', name: 'Защита опыта', price: 35, icon: shield, text: 'Одна следующая ошибка не отнимает очки. После срабатывания предмет расходуется.' },
  { id: 'double', name: 'Двойная награда', price: 40, icon: double, text: 'Удваивает монетки за верные ответы в следующей серии заданий.' },
  { id: 'second', name: 'Второй шанс', price: 30, icon: second, text: 'Позволяет один раз исправить неверный ответ: ошибка в статистику не пишется.' },
]

export const SURPRISES: ShopItem[] = [
  { id: 'box', name: 'Случайный набор бонусов', price: 100, icon: box, text: 'Содержит 3–5 предметов из магазина. Состав показывается после открытия.' },
  { id: 'chest', name: 'Сундук с монетками', price: 120, icon: chest, text: 'Выдаёт случайно от 60 до 110 монеток.' },
  { id: 'hints', name: 'Набор подсказок', price: 60, icon: hints, text: 'Пять предметов «Подсказка Юны».' },
]

export const itemName = (id: string) => [...ITEMS, ...SURPRISES].find(i => i.id === id)?.name ?? id
export const itemIcon = (id: string) => [...ITEMS, ...SURPRISES].find(i => i.id === id)?.icon ?? ''

/** Типы записей истории монеток. */
export const LOG_KINDS: [string, string][] = [
  ['', 'Все'],
  ['earn', 'Начисления'],
  ['task', 'Задания'],
  ['achievement', 'Достижения'],
  ['buy', 'Покупки'],
  ['use', 'Использование'],
]

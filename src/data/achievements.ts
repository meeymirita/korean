import { KNOWN_STREAK, type ProgressData } from '@/stores/progress'
import { levelOf } from '@/data/levels'

export interface Achievement {
  id: string
  icon: string
  title: string
  desc: string
  /** [сейчас, цель] */
  progress: (p: ProgressData, streak: number) => [number, number]
}

const correct = (p: ProgressData) => Object.values(p.sources).reduce((n, s) => n + s.ok, 0)
const known = (p: ProgressData) => Object.values(p.words).filter(w => w.streak >= KNOWN_STREAK).length

const A = (id: string, icon: string, title: string, desc: string, progress: Achievement['progress']): Achievement => ({
  id, icon, title, desc, progress,
})

export const ACHIEVEMENTS: Achievement[] = [
  A('first', '🌱', 'Первый шаг', 'Ответить верно первый раз', p => [correct(p), 1]),
  A('c100', '📘', 'Сотня', '100 верных ответов', p => [correct(p), 100]),
  A('c500', '📚', 'Пятьсот', '500 верных ответов', p => [correct(p), 500]),
  A('c2000', '🏛️', 'Две тысячи', '2000 верных ответов', p => [correct(p), 2000]),
  A('k10', '🌸', 'Десять слов', 'Выучить 10 слов', p => [known(p), 10]),
  A('k50', '🌺', 'Полсотни слов', 'Выучить 50 слов', p => [known(p), 50]),
  A('k150', '💐', 'Сто пятьдесят слов', 'Выучить 150 слов', p => [known(p), 150]),
  A('k400', '🌳', 'Четыреста слов', 'Выучить 400 слов', p => [known(p), 400]),
  A('d3', '🔥', 'Три дня подряд', 'Заниматься 3 дня подряд', (_p, s) => [s, 3]),
  A('d7', '🔥', 'Неделя', 'Заниматься 7 дней подряд', (_p, s) => [s, 7]),
  A('d30', '🌙', 'Месяц', 'Заниматься 30 дней подряд', (_p, s) => [s, 30]),
  A('l5', '⭐', 'Огонёк', 'Дойти до 5 уровня', p => [levelOf(p.xp), 5]),
  A('l10', '🕯️', 'Свеча', 'Дойти до 10 уровня', p => [levelOf(p.xp), 10]),
  A('l20', '✨', 'Звезда', 'Дойти до 20 уровня', p => [levelOf(p.xp), 20]),
  A('l40', '♾️', 'Вечность', 'Дойти до 40 уровня', p => [levelOf(p.xp), 40]),
]

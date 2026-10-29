import { computed } from 'vue'
import { useProgressStore } from '@/stores/progress'

export const HOME_LINKS = [
  { title: 'Словарь', to: '/korean/words' },
  { title: 'Грамматика', to: '/korean/grammar' },
  { title: 'Памятка', to: '/korean/ref/cheat' },
  { title: 'Чтение', to: '/korean/ref/reading' },
]

export const HOME_MORE = [
  { title: 'Сегодня', to: '/korean/today' },
  { title: 'Тренажёры', to: '/korean/trainers' },
  { title: 'Игра на слова', to: '/game' },
  { title: 'Мой кабинет', to: '/korean/cabinet' },
]

/** Правило на главной: ведёт на карточку грамматики. */
export const HOME_RULE = {
  to: { path: '/korean/grammar', query: { g: 'ayo' } },
  label: 'Грамматика · вежливая форма глагола',
  rule: '-아요/어요',
  examples: '가요 · 먹어요 · 해요',
}

const START = new Date(2026, 5, 1)
const plural = (n: number, forms: [string, string, string]) =>
  forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2]

/** Общие данные главной: дни с начала пути, приветствие, замки. */
export function useHome() {
  const progress = useProgressStore()
  const now = new Date()
  const days = Math.max(
    0,
    Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - START.getTime()) / 86_400_000),
  )
  const daysWord = plural(days, ['день', 'дня', 'дней'])
  const hello = computed(() =>
    progress.unlocked
      ? {
          locked: false,
          title: 'Привет' + (progress.data.profile.name ? ', ' + progress.data.profile.name : '') + '!',
          sub: `⭐ Уровень ${progress.info.level} · ${progress.info.title} · 🔥 ${progress.streak}`,
        }
      : { locked: true, title: '🔒 Войти по токену →', sub: 'откроются задания, игра и кабинет' },
  )
  return { progress, days, daysWord, hello }
}

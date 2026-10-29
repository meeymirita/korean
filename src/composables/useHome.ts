import { computed } from 'vue'
import { G, type Gram } from '@/data/korean/grammar'
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
]

/** Убирает из текста карточки метки цвета {o|…}, {b|…}, {r|…} и т. п., теги и хвостовую точку. */
const plain = (s: string) => s.replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '').replace(/[.…]+$/, '').trim()

/** Правило для блока на главной из карточки грамматики: название, подпись и до трёх целых примеров. */
export function ruleOf(card: Gram) {
  const ex = (card.b.find(b => b[0] === 'ex')?.[1] ?? []) as [string, string][]
  // примеры набираются, пока строка не станет длиннее 52 символов (но хотя бы один)
  const examples = ex
    .filter(([ko]) => !ko.includes('…') && !ko.includes(' — ')) // обрывки вроде «형은 …» и диалоги не показываем
    .map(([ko]) => plain(ko))
    .reduce<string[]>((acc, ko) => (acc.length < 3 && (!acc.length || acc.join(' · ').length + ko.length + 3 <= 52) ? [...acc, ko] : acc), [])
    .join(' · ')
  return { to: { path: '/korean/grammar', query: { g: card.id } }, label: `Грамматика · ${card.d.length > 52 ? card.d.slice(0, 51).trimEnd() + '…' : card.d}`, rule: card.ko, examples }
}

/** Карточки, из которых можно собрать правило: пройденные и с примерами. */
export const ruleCards = () => G.filter(c => c.st === 'ok' && ruleOf(c).examples)

export function randomRule(rand: () => number = Math.random) {
  const list = ruleCards()
  return ruleOf(list[Math.floor(rand() * list.length)]!)
}

/** Правило на главной: другое после каждой перезагрузки (на странице одно, пока её не обновят). Ведёт на карточку грамматики. */
export const HOME_RULE = randomRule()

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
    progress.unlocked && progress.isGuest
      ? {
          locked: false,
          title: 'Привет, гость!',
          sub: `доступ до ${new Date(progress.guestExpires).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · прогресс не сохраняется`,
        }
      : progress.unlocked
      ? {
          locked: false,
          title: 'Привет' + (progress.data.profile.name ? ', ' + progress.data.profile.name : '') + '!',
          sub: `⭐ Уровень ${progress.info.level} · ${progress.info.title} · 🔥 ${progress.streak}`,
        }
      : {
          locked: true,
          title: '🔒 Войти по токену →',
          sub: 'откроются задания, игра и кабинет',
        },
  )
  return { progress, days, daysWord, hello }
}

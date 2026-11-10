import { computed } from 'vue'
import { firstBlock, G, type Gram } from '@/data/korean/grammar'
import { PHRASE_COOKIE, pickOther, pickPhrase } from '@/data/phrases'
import { withSeed } from '@/lib/seeded'
import { dueWords } from '@/data/review'
import { useProgressStore } from '@/stores/progress'

export const HOME_LINKS = [
  { title: 'Словарь', to: '/korean/words' },
  { title: 'Большой словарь', to: '/dict' },
  { title: 'Грамматика', to: '/korean/grammar' },
  { title: 'Памятка', to: '/korean/ref/cheat' },
  { title: 'Чтение', to: '/korean/ref/reading' },
]

export const HOME_MORE = [
  { title: '5 минут', to: '/game/home?game=quick' },
  { title: 'Сегодня', to: '/korean/today' },
  { title: 'Игры', to: '/game/home' },
  { title: 'Игра на слова', to: '/game/home' },
]

/** Убирает из текста карточки метки цвета {o|…}, {b|…}, {r|…} и т. п., теги и хвостовую точку. */
const plain = (s: string) => s.replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '').replace(/[.…]+$/, '').trim()

/** Правило для блока на главной из карточки грамматики: название, подпись и до трёх целых примеров. */
export function ruleOf(card: Gram) {
  const ex = firstBlock(card.b, 'ex') ?? []
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

/**
 * Случайное на главных для этой загрузки страницы: правило, фраза дня (другая после каждого обновления) и вторая фраза.
 * Число-зерно выбирает сервер на каждый запрос и передаёт в браузер вместе со страницей (useState), поэтому выбор одинаков
 * в готовом HTML и после оживления страницы. Номер прошлой фразы лежит в cookie, его видит и сервер: подряд фраза не повторяется.
 */
export function useHomePicks() {
  const cookie = useCookie<number>(PHRASE_COOKIE, { default: () => -1, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 })
  // зерно и номер прошлой фразы фиксируются на сервере: браузер видит в cookie уже новый номер, но выбирать должен как сервер
  const seed = useState('home_seed', () => String(Math.random()))
  const last = useState('home_last', () => Number(cookie.value))
  const picks = withSeed(seed.value, () => {
    const { index, phrase } = pickPhrase(Math.random, last.value)
    return { index, rule: randomRule(), phrase, phrases: [phrase, pickOther([phrase])] }
  })
  cookie.value = picks.index
  return { seed: seed.value, rule: picks.rule, phrase: picks.phrase, phrases: picks.phrases }
}

const START = new Date(2026, 5, 1)
export const plural = (n: number, forms: [string, string, string]) =>
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
          sub: `Уровень ${progress.info.level} · ${progress.info.title} · серия ${progress.streak}`,
        }
      : {
          locked: true,
          title: 'Войти по токену →',
          sub: 'откроются задания, игра и кабинет',
        },
  )
  /** Сколько слов пора повторить (для владельца; гостю и без токена ноль). */
  const due = computed(() => (progress.unlocked && !progress.isGuest ? dueWords(progress.data).length : 0))
  const dueText = computed(() => `${due.value} ${plural(due.value, ['слово', 'слова', 'слов'])}`)
  return { progress, days, daysWord, hello, due, dueText }
}

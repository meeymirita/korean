import { EXCHANGES } from '@/game/dialogs'
import { STORIES } from '@/game/stories'
import { shuffle, type Task } from './tasks'

/**
 * Тренажёр «Чтение и диалоги» (`docs/trainers/read.md`). Две серии на `TaskSession`:
 * 1. «Рассказы»: корейский рассказ из `STORIES` целиком и вопрос по смыслу по-русски (верный ответ и три неверных); после ответа виден разбор
 *    предложения, на которое опирается ответ (`at`), и его перевод. Корейских предложений здесь нет новых: рассказы взяты из учебника, вопросы по-русски.
 * 2. «Диалоги»: короткая сценка из реплик `EXCHANGES` (`game/dialogs.ts`): собеседник спрашивает, нужно выбрать из трёх ответ; прошлые реплики сценки видны над вопросом.
 */

/** Вопрос по рассказу: `story` это id из `STORIES`, `at` номер предложения (с 1), на которое опирается ответ. */
export interface ReadQ {
  story: string
  q: string
  a: string
  wrong: [string, string, string]
  at: number
}

export const READ_QUESTIONS: ReadQ[] = [
  { story: 'day', q: 'Куда рассказчик ходит каждый день?', a: 'В школу', wrong: ['В библиотеку', 'В кинотеатр', 'В Мёндон'], at: 1 },
  { story: 'day', q: 'Где находится библиотека?', a: 'Рядом со студенческой столовой', wrong: ['Рядом с кинотеатром', 'В Мёндоне', 'Дома у рассказчика'], at: 4 },
  { story: 'day', q: 'Что делают в библиотеке?', a: 'Делают домашнее задание', wrong: ['Едят', 'Смотрят фильм', 'Встречаются с другом'], at: 5 },
  { story: 'myeongdong', q: 'Кто сегодня приходит к рассказчику домой?', a: 'Друг', wrong: ['Учитель', 'Сосед по комнате', 'Брат'], at: 1 },
  { story: 'myeongdong', q: 'Куда они идут после ресторана?', a: 'В кинотеатр', wrong: ['В школу', 'В библиотеку', 'Домой'], at: 5 },
  { story: 'myeongdong', q: 'Что они делают в кинотеатре?', a: 'Смотрят фильм', wrong: ['Едят корейскую еду', 'Делают домашнее задание', 'Встречаются с друзьями'], at: 7 },
  { story: 'myeongdong', q: 'Где находится кинотеатр?', a: 'Рядом с рестораном', wrong: ['Рядом с библиотекой', 'Рядом со школой', 'Дома'], at: 6 },
  { story: 'house', q: 'Что есть на кухне?', a: 'Холодильник', wrong: ['Кровать', 'Компьютер', 'Стул'], at: 5 },
  { story: 'house', q: 'Чья это комната?', a: 'Рассказчика', wrong: ['Друга', 'Тео', 'Учителя'], at: 2 },
  { story: 'teo', q: 'Кто такой Тео для рассказчика?', a: 'Сосед по комнате', wrong: ['Учитель', 'Брат', 'Одноклассник'], at: 1 },
  { story: 'teo', q: 'Откуда Тео?', a: 'Из Бразилии', wrong: ['Из США', 'Из России', 'Из Китая'], at: 3 },
  { story: 'teo', q: 'Чем занимается Тео?', a: 'Он студент университета', wrong: ['Он врач', 'Он художник', 'Он офисный работник'], at: 4 },
  { story: 'canteen', q: 'Что рассказчик говорит о еде в студенческой столовой?', a: 'Она вкусная', wrong: ['Она дорогая', 'Её мало', 'Она невкусная'], at: 3 },
  { story: 'canteen', q: 'Как часто рассказчик ходит в студенческую столовую?', a: 'Часто', wrong: ['Никогда', 'Редко', 'Один раз'], at: 2 },
  { story: 'room', q: 'Что есть в комнате?', a: 'Кровать и стол', wrong: ['Телевизор и стол', 'Кровать и телевизор', 'Только телевизор'], at: 4 },
  { story: 'anna', q: 'Откуда Анна?', a: 'Из России', wrong: ['Из США', 'Из Бразилии', 'Из Китая'], at: 1 },
  { story: 'anna', q: 'Кто Анна по профессии?', a: 'Художница', wrong: ['Студентка', 'Врач', 'Учительница'], at: 2 },
  { story: 'work', q: 'Где работает Тео?', a: 'В столовой', wrong: ['В библиотеке', 'В кинотеатре', 'В школе'], at: 1 },
  { story: 'work', q: 'Где находится столовая?', a: 'Рядом со школой', wrong: ['Рядом с библиотекой', 'Дома у Тео', 'В Мёндоне'], at: 2 },
  { story: 'class', q: 'Кто есть в классе?', a: 'Китайский и американский студенты', wrong: ['Только китайский студент', 'Только американский студент', 'Русский и бразильский студенты'], at: 2 },
  { story: 'weekend', q: 'Когда рассказчик встречается с другом?', a: 'В субботу и в воскресенье', wrong: ['Только в субботу', 'Только в воскресенье', 'По будням'], at: 2 },
]

/** Заголовок задания: название рассказа и сам рассказ строками (корейский). */
const storyTitle = (id: string) => {
  const s = STORIES.find(x => x.id === id)!
  return `Рассказ «${s.title}»\n${s.sents.map(x => x.ko).join('\n')}`
}

/** Серия «Рассказы»: n вопросов вперемешку, не больше двух по одному рассказу. */
export function readTasks(n = 8): Task[] {
  const used = new Map<string, number>()
  const picked: ReadQ[] = []
  for (const q of shuffle(READ_QUESTIONS)) {
    if ((used.get(q.story) ?? 0) >= 2) continue
    used.set(q.story, (used.get(q.story) ?? 0) + 1)
    picked.push(q)
    if (picked.length >= n) break
  }
  return picked.map((r, i) => {
    const sent = STORIES.find(x => x.id === r.story)!.sents[r.at - 1]!
    return {
      id: i + 1,
      kind: 'read',
      small: true,
      title: storyTitle(r.story),
      prompt: r.q,
      options: shuffle([r.a, ...r.wrong]),
      answer: r.a,
      sentence: sent.ko,
      note: `В рассказе: «${sent.ru}»`,
    }
  })
}

/** Сценка: название и реплики собеседника (`ask` из `EXCHANGES`) по порядку; отвечает ученик. */
export interface Scene {
  id: string
  title: string
  asks: string[]
}

export const SCENES: Scene[] = [
  { id: 'meet', title: 'Знакомство', asks: ['안녕하세요?', '이름이 뭐예요?', '어느 나라 사람이에요?', '학생이에요?'] },
  { id: 'week', title: 'Дни и планы', asks: ['오늘이 무슨 요일이에요?', '금요일에 뭐 해요?', '내일 시간이 있어요?', '주말에 파티에 가요?'] },
  { id: 'room', title: 'В комнате', asks: ['방에 뭐가 있어요?', '책이 어디에 있어요?', '책상이 어디에 있어요?', '텔레비전이 있어요?'] },
  { id: 'food', title: 'Еда', asks: ['뭐 먹어요?', '비빔밥이 맛있어요?', '고기를 먹어요?', '그럼 어디에서 밥을 먹어요?'] },
  { id: 'go', title: 'Куда идёшь', asks: ['테오 씨, 어디에 가요?', '거기에서 뭐 해요?', '내일 어디에 가요?', '내일도 운동해요?'] },
]

const exchangeOf = (ask: string) => EXCHANGES.find(e => e[0] === ask)

/** Серия «Диалоги»: n сценок подряд (по умолчанию две), каждый вопрос собеседника это задание из трёх ответов; неверные ответы взяты из реплик другой темы (тег). */
export function sceneTasks(n = 2): Task[] {
  const out: Task[] = []
  for (const scene of shuffle(SCENES).slice(0, n)) {
    scene.asks.forEach((ask, i) => {
      const ex = exchangeOf(ask)!
      const [, askRu, answer, answerRu, tag] = ex
      // чужие ответы другой темы и не такие же по тексту, как верный
      const others = shuffle(EXCHANGES.filter(e => e[4] !== tag && e[2] !== answer))
      const wrong: typeof EXCHANGES = []
      for (const e of others) if (!wrong.some(w => w[2] === e[2])) wrong.push(e)
      const options = shuffle([answer, wrong[0]![2], wrong[1]![2]])
      const before = scene.asks.slice(0, i).map(a => {
        const e = exchangeOf(a)!
        return `— ${e[0]}\n— ${e[2]}`
      })
      out.push({
        id: out.length + 1,
        kind: 'read',
        small: true,
        title: `Диалог «${scene.title}»${before.length ? `\n${before.join('\n')}` : ''}`,
        prompt: `— ${ask}`,
        hint: askRu,
        options,
        answer,
        sentence: answer,
        note: `${answer} — ${answerRu}`,
        pairOf: { [answer]: askRu, [wrong[0]![2]]: wrong[0]![1], [wrong[1]![2]]: wrong[1]![1] },
      })
    })
  }
  return out
}

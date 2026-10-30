/**
 * Фразы дня для главной и главной раздела. Только пройденное: уроки 1–11 и прошедшее время, будущего времени нет.
 * В переводах для «я» нейтральные формы («поел(а)»), чтобы не угадывать пол.
 */
export interface Phrase {
  ko: string
  ru: string
}

export const PHRASES: Phrase[] = [
  { ko: '조금씩, 매일.', ru: 'Понемногу, каждый день.' },
  { ko: '천천히 해요.', ru: 'Давай не спеша.' },
  { ko: '열심히 해요.', ru: 'Стараюсь изо всех сил.' },
  { ko: '한국어가 재미있어요.', ru: 'Корейский — это интересно.' },
  { ko: '저는 한국어를 공부해요.', ru: 'Я учу корейский.' },
  { ko: '오늘도 공부해요.', ru: 'Сегодня тоже занимаюсь.' },
  { ko: '어제 공부했어요.', ru: 'Вчера занимался(-лась).' },
  { ko: '한국어가 좋아요.', ru: 'Мне нравится корейский.' },
  { ko: '조금 어려워요.', ru: 'Немного сложно.' },
  { ko: '오늘은 날씨가 좋아요.', ru: 'Сегодня хорошая погода.' },
  { ko: '커피를 마셔요.', ru: 'Пью кофе.' },
  { ko: '책을 읽어요.', ru: 'Читаю книгу.' },
  { ko: '친구를 만나요.', ru: 'Встречаюсь с другом.' },
  { ko: '학교에 가요.', ru: 'Иду в школу.' },
  { ko: '집에서 쉬어요.', ru: 'Отдыхаю дома.' },
  { ko: '밥을 먹었어요.', ru: 'Поел(а).' },
  { ko: '물을 마셨어요.', ru: 'Выпил(а) воды.' },
  { ko: '이것은 책이에요.', ru: 'Это книга.' },
  { ko: '만나서 반가워요.', ru: 'Приятно познакомиться.' },
  { ko: '안녕하세요!', ru: 'Здравствуйте!' },
  { ko: '감사합니다.', ru: 'Спасибо.' },
]

/** Случайная фраза, не совпадающая с предыдущей (чтобы после обновления страницы было видно, что она меняется). */
export function pickPhrase(rand: () => number = Math.random, last = -1): { index: number; phrase: Phrase } {
  let index = Math.floor(rand() * PHRASES.length)
  if (PHRASES.length > 1 && index === last) index = (index + 1 + Math.floor(rand() * (PHRASES.length - 1))) % PHRASES.length
  return { index, phrase: PHRASES[index]! }
}

const KEY = 'ui_phrase_last'

/** Фраза для текущей загрузки страницы: номер прошлой запоминается в sessionStorage. */
export function nextPhrase(): Phrase {
  let last = -1
  try {
    last = Number(sessionStorage.getItem(KEY) ?? -1)
  } catch {
    /* без запоминания */
  }
  const { index, phrase } = pickPhrase(Math.random, last)
  try {
    sessionStorage.setItem(KEY, String(index))
  } catch {
    /* без запоминания */
  }
  return phrase
}

/** Ещё одна фраза, отличная от уже выбранных (для блока «Фразы дня» с двумя фразами). */
export function pickOther(taken: Phrase[], rand: () => number = Math.random): Phrase {
  const free = PHRASES.filter(p => !taken.some(t => t.ko === p.ko))
  return free[Math.floor(rand() * free.length)] ?? PHRASES[0]!
}

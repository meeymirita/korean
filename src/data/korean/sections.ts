export interface Section {
  id: string
  num: string
  menu: string
  kicker: string
  title: string
  sub: string
}

export const sections: Section[] = [
  { id: 'today', num: '00', menu: 'Сегодня', kicker: 'На сегодня', title: 'Сегодня', sub: 'случайные слова, правило и задания — каждый раз новые' },
  { id: 'progress', num: '01', menu: 'Прогресс', kicker: 'Мои успехи', title: 'Прогресс', sub: 'уровень, серия дней и выученные слова' },
  { id: 'words', num: '02', menu: 'Слова', kicker: 'Словарь', title: 'Слова', sub: 'словарь корейского' },
  { id: 'grammar', num: '03', menu: 'Грамматика', kicker: 'Правила', title: 'Грамматика', sub: 'нажми на карточку — откроется объяснение' },
  { id: 'cheat', num: '04', menu: 'Шпаргалка', kicker: 'Формулы', title: 'Шпаргалка', sub: 'частицы, формулы, шаблоны предложений' },
  { id: 'talk', num: '05', menu: 'Разговорник', kicker: 'Фразы', title: 'Разговорник', sub: 'фразы из TikTok, диалоги знакомства, слэнг' },
  { id: 'hangul', num: '06', menu: 'Хангыль', kicker: 'Письмо', title: 'Хангыль', sub: 'таблица слогов, как читать и писать' },
  { id: 'alphabet', num: '07', menu: 'Алфавит', kicker: 'Буквы', title: 'Алфавит', sub: 'все буквы и слоги' },
  { id: 'reading', num: '08', menu: 'Чтение', kicker: 'Чтение', title: 'Правила чтения', sub: 'как звучит ㄹ, что происходит между гласными, 받침 и другие случаи' },
  { id: 'sentences', num: '09', menu: 'Примеры', kicker: 'Из словаря', title: 'Примеры предложений', sub: 'все предложения из словаря' },
  { id: 'numbers', num: '10', menu: 'Числа', kicker: 'Счёт', title: 'Числа и счёт', sub: 'цены, количество, счётные слова' },
  { id: 'trainers', num: '11', menu: 'Тренажёры', kicker: 'Игры', title: 'Тренажёры слов', sub: 'найди пару и напиши перевод' },
  { id: 'review', num: '12', menu: 'Повторение', kicker: 'Карточки', title: 'Повторение', sub: 'случайная карточка — нажми, чтобы увидеть ответ' },
]

export const sectionById = (id: string) => sections.find(s => s.id === id)!

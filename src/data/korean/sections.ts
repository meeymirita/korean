export interface Section {
  id: string
  num: string
  menu: string
  kicker: string
  title: string
  sub: string
}

export const sections: Section[] = [
  { id: 'words', num: '01', menu: 'Слова', kicker: 'Словарь', title: 'Слова', sub: 'словарь корейского' },
  { id: 'grammar', num: '02', menu: 'Грамматика', kicker: 'Правила', title: 'Грамматика', sub: 'нажми на карточку — откроется объяснение' },
  { id: 'cheat', num: '03', menu: 'Шпаргалка', kicker: 'Формулы', title: 'Шпаргалка', sub: 'частицы, формулы, шаблоны предложений' },
  { id: 'talk', num: '04', menu: 'Разговорник', kicker: 'Фразы', title: 'Разговорник', sub: 'фразы из TikTok, диалоги знакомства, слэнг' },
  { id: 'hangul', num: '05', menu: 'Хангыль', kicker: 'Письмо', title: 'Хангыль', sub: 'таблица слогов, как читать и писать' },
  { id: 'reading', num: '06', menu: 'Чтение', kicker: 'Чтение', title: 'Правила чтения', sub: 'как звучит ㄹ, что происходит между гласными, 받침 и другие случаи' },
  { id: 'sentences', num: '07', menu: 'Примеры', kicker: 'Из словаря', title: 'Примеры предложений', sub: 'все предложения из словаря' },
  { id: 'numbers', num: '08', menu: 'Числа', kicker: 'Счёт', title: 'Числа и счёт', sub: 'цены, количество, счётные слова' },
  { id: 'review', num: '09', menu: 'Повторение', kicker: 'Карточки', title: 'Повторение', sub: 'случайная карточка — нажми, чтобы увидеть ответ' },
]

export const sectionById = (id: string) => sections.find(s => s.id === id)!

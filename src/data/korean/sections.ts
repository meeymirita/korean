export interface Section {
  id: string
  num: string
  menu: string
  kicker: string
  title: string
  sub: string
  /** открывается только после входа по токену */
  private?: boolean
  /** страница живёт вкладкой внутри другого раздела и не показывается в меню */
  group?: string
}

export const sections: Section[] = [
  { id: 'home', num: '00', menu: 'Главная', kicker: 'Обзор', title: 'Главная', sub: 'поиск по всему сайту и статистика' },
  { id: 'cabinet', num: '01', menu: 'Кабинет', kicker: 'Профиль и прогресс', title: 'Мой кабинет', sub: 'профиль, повторение, итоги недели, история и настройки', private: true },
  { id: 'today', num: '02', menu: 'Сегодня', kicker: 'На сегодня', title: 'Сегодня', sub: 'случайные слова, правило и задания — каждый раз новые', private: true },
  { id: 'words', num: '03', menu: 'Слова', kicker: 'Словарь', title: 'Слова', sub: 'словарь корейского' },
  { id: 'grammar', num: '04', menu: 'Грамматика', kicker: 'Правила', title: 'Грамматика', sub: 'нажми на карточку — откроется объяснение' },
  { id: 'ref', num: '05', menu: 'Справочник', kicker: 'Справочник', title: 'Справочник', sub: 'шпаргалка, разговорник, письмо, чтение, примеры и числа' },
  { id: 'cheat', num: '05', menu: 'Шпаргалка', kicker: 'Формулы', title: 'Шпаргалка', sub: 'частицы, формулы, шаблоны предложений', group: 'ref' },
  { id: 'talk', num: '05', menu: 'Разговорник', kicker: 'Фразы', title: 'Разговорник', sub: 'фразы из TikTok, диалоги знакомства, слэнг', group: 'ref' },
  { id: 'hangul', num: '05', menu: 'Хангыль', kicker: 'Письмо', title: 'Хангыль', sub: 'таблица слогов, как читать и писать', group: 'ref' },
  { id: 'alphabet', num: '05', menu: 'Алфавит', kicker: 'Буквы', title: 'Алфавит', sub: 'все буквы и слоги', group: 'ref' },
  { id: 'reading', num: '05', menu: 'Чтение', kicker: 'Чтение', title: 'Правила чтения', sub: 'как звучит ㄹ, что происходит между гласными, 받침 и другие случаи', group: 'ref' },
  { id: 'sentences', num: '05', menu: 'Примеры', kicker: 'Из словаря', title: 'Примеры предложений', sub: 'все предложения из словаря', group: 'ref' },
  { id: 'numbers', num: '05', menu: 'Числа', kicker: 'Счёт', title: 'Числа и счёт', sub: 'цены, количество, счётные слова', group: 'ref' },
  { id: 'trainers', num: '06', menu: 'Тренажёры', kicker: 'Игры', title: 'Тренажёры слов', sub: 'найди пару и напиши перевод', private: true },
  { id: 'review', num: '07', menu: 'Повторение', kicker: 'Карточки', title: 'Повторение', sub: 'случайная карточка — нажми, чтобы увидеть ответ', private: true },
  { id: 'garden', num: '08', menu: 'Сад', kicker: 'Прогресс слов', title: 'Сад воспоминаний', sub: 'каждое выученное слово — цветок, а ещё коллекция карточек', private: true },
]

/** вкладки раздела «Справочник» */
export const refTabs = sections.filter(s => s.group === 'ref')

export const REF_TAB_KEY = 'ref_last_tab'

/** Последняя открытая вкладка справочника (или первая). */
export function lastRefTab() {
  try {
    const id = localStorage.getItem(REF_TAB_KEY)
    if (refTabs.some(t => t.id === id)) return id!
  } catch {
    /* хранилище недоступно */
  }
  return refTabs[0]!.id
}

export const sectionById = (id: string) => sections.find(s => s.id === id)!

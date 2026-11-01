/**
 * Каталог игр страницы `/game/home`: всё открывается на этой же странице, выбранная игра записана в адрес (`?game=…`).
 * Режимы движка «Хлебушек» (word, rev, form…) и тренажёры (TOOL_IDS) показываются на месте каталога, сверху ссылка «К списку игр».
 */
/** Игры-тренажёры (компоненты Vue); остальные id в каталоге это режимы движка «Хлебушек». */
export const TOOL_IDS = ['match', 'quick', 'particles', 'pairs', 'translate', 'syllables'] as const

export interface GameCard {
  id: string
  name: string
  desc: string
  /** имя файла иконки в src/assets/game/icons */
  icon: string
  to: string
}
export interface GameGroup {
  id: string
  title: string
  desc: string
  icon: string
  games: GameCard[]
}

export const GAME_GROUPS: GameGroup[] = [
  {
    id: 'vocab',
    title: 'Словарный запас',
    desc: 'Запоминай новые слова, переводы и значения.',
    icon: 'dict',
    games: [
      { id: 'word', name: 'Слово → перевод', desc: 'Корейское слово, выбери перевод', icon: 'speech', to: '/game/home?game=word' },
      { id: 'rev', name: 'Перевод → слово', desc: 'Русское слово, выбери корейское', icon: 'card', to: '/game/home?game=rev' },
      { id: 'match', name: 'Найди пару', desc: 'Соедини слова и их переводы', icon: 'hearts', to: '/game/home?game=match' },
      { id: 'typewords', name: 'Напиши перевод', desc: 'Введи перевод с клавиатуры', icon: 'pencil', to: '/game/home?game=match&mode=type' },
      { id: 'pairs', name: 'Похожие, но разные', desc: 'Выбери верное из похожих слов', icon: 'book', to: '/game/home?game=pairs' },
    ],
  },
  {
    id: 'hangul',
    title: 'Хангыль и слоги',
    desc: 'Тренируй чтение, слоги и написание на хангыле.',
    icon: 'han',
    games: [
      { id: 'han', name: 'Хангыль-блиц', desc: 'Собери слог или узнай, как он читается', icon: 'han', to: '/game/home?game=han' },
      { id: 'syllables', name: 'Собери по слогам', desc: 'Составь слово из слогов', icon: 'board', to: '/game/home?game=syllables' },
    ],
  },
  {
    id: 'grammar',
    title: 'Грамматика',
    desc: 'Частицы, окончания, времена и вопросительные слова.',
    icon: 'grammar',
    games: [
      { id: 'form', name: 'Выбери форму', desc: 'Глагол в настоящем или прошедшем времени', icon: 'pen', to: '/game/home?game=form' },
      { id: 'qw', name: 'Вопросы', desc: 'Вставь вопросительное слово', icon: 'cat-q', to: '/game/home?game=qw' },
      { id: 'part', name: 'Частицы и счёт', desc: 'Вставь частицу или счётное слово', icon: 'macaron', to: '/game/home?game=part' },
      { id: 'err', name: 'Найди ошибку', desc: 'Найди неверное слово в предложении', icon: 'eraser', to: '/game/home?game=err' },
      { id: 'pair', name: 'Пара или нет', desc: 'Выбери верный вариант из двух', icon: 'heart', to: '/game/home?game=pair' },
      { id: 'type', name: 'Напиши правильную форму', desc: 'Введи форму глагола с клавиатуры', icon: 'pencil', to: '/game/home?game=type' },
      { id: 'particles', name: 'Частицы и окончания', desc: 'Девять правил со своими наборами', icon: 'wand', to: '/game/home?game=particles' },
    ],
  },
  {
    id: 'sentences',
    title: 'Построение предложений',
    desc: 'Собирай, переводи и проверяй предложения.',
    icon: 'board',
    games: [
      { id: 'build', name: 'Собери предложение', desc: 'Составь предложение из плиток', icon: 'board', to: '/game/home?game=build' },
      { id: 'spot', name: 'Найди верное', desc: 'Выбери верное предложение по переводу', icon: 'telescope', to: '/game/home?game=spot' },
      { id: 'ord', name: 'Порядок слов', desc: 'Поставь слово на своё место', icon: 'comet', to: '/game/home?game=ord' },
      { id: 'translate', name: 'Переведи предложение', desc: 'Три режима с разбором ответа', icon: 'sparkle', to: '/game/home?game=translate' },
    ],
  },
  {
    id: 'talk',
    title: 'Общение и диалоги',
    desc: 'Тренируй диалоги и повседневное общение.',
    icon: 'mail',
    games: [{ id: 'dlg', name: 'Диалог', desc: 'Выбери подходящий ответ собеседнику', icon: 'mail', to: '/game/home?game=dlg' }],
  },
]

/** Отдельно от групп: быстрые режимы со смесью заданий. */
export const GAME_MIX: GameCard[] = [
  { id: 'mix', name: 'Микс', desc: 'Все режимы вперемешку', icon: 'dice', to: '/game/home?game=mix' },
  { id: 'quick', name: '5 минут', desc: 'Десять заданий вперемешку', icon: 'rocket', to: '/game/home?game=quick' },
]

/** Все игры списком (для счётчика и поиска). */
export const ALL_GAMES: GameCard[] = [...GAME_MIX, ...GAME_GROUPS.flatMap(g => g.games)]

/** Поиск по названию и описанию без учёта регистра; пустой запрос возвращает всё. */
export function findGames(games: GameCard[], q: string): GameCard[] {
  const s = q.trim().toLowerCase()
  return s ? games.filter(g => g.name.toLowerCase().includes(s) || g.desc.toLowerCase().includes(s)) : games
}

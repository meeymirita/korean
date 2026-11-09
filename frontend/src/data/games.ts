/**
 * Каталог игр страницы `/game/home`: всё открывается на этой же странице, выбранная игра записана в адрес (`?game=…`).
 * Режимы движка «Хлебушек» (word, rev, form…) и тренажёры (TOOL_IDS) показываются на месте каталога, сверху ссылка «К списку игр».
 */
/** Игры-тренажёры (компоненты Vue); остальные id в каталоге это режимы движка «Хлебушек». */
export const TOOL_IDS = ['match', 'quick', 'particles', 'pairs', 'translate', 'syllables', 'rule', 'keyboard'] as const

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
      { id: 'keyboard', name: 'Печать на корейском', desc: 'Буквы, слоги, слова и предложения, а ещё свой набор', icon: 'pencil', to: '/game/home?game=keyboard' },
    ],
  },
  {
    id: 'be',
    title: 'Быть и отрицание',
    desc: '이에요 / 예요, 이 / 가 아니에요: «это» и «это не».',
    icon: 'heart',
    games: [{ id: 'neg', name: 'Это или не это', desc: 'Скажи «это …» и «это не …» по 받침', icon: 'heart', to: '/game/home?game=neg' }],
  },
  {
    id: 'particles',
    title: 'Частицы',
    desc: '은/는, 이/가, 을/를 и другие: какая частица и в какой форме.',
    icon: 'macaron',
    games: [
      { id: 'pair', name: 'Пара или нет', desc: 'Выбери верный вариант из двух, а на сложном уровне целый рассказ', icon: 'hearts', to: '/game/home?game=pair' },
      { id: 'ptext', name: 'Тексты по правилу', desc: 'Выбери правило (은/는, 이/가, 을/를, 에 / 에서, 하고 / 와 / 과, 만) и расставь частицы в предложениях и рассказах из учебника', icon: 'wand', to: '/game/home?game=ptext' },
      { id: 'part', name: 'Частицы и счёт', desc: 'Вставь частицу или счётное слово', icon: 'macaron', to: '/game/home?game=part' },
      { id: 'particles', name: 'Частицы и окончания', desc: 'Девять правил со своими наборами', icon: 'wand', to: '/game/home?game=particles' },
      { id: 'err', name: 'Найди ошибку', desc: 'Найди неверное слово в предложении', icon: 'eraser', to: '/game/home?game=err' },
      { id: 'only', name: 'Только (만)', desc: '«Только» или «тоже»: 만 и 도, а ещё 에만, 에서만', icon: 'sparkle', to: '/game/home?game=only' },
    ],
  },
  {
    id: 'place',
    title: 'Место и направление',
    desc: 'Куда, где и где что-то делают: 에, 에서, 있어요.',
    icon: 'home',
    games: [{ id: 'place', name: 'Куда, где', desc: 'Вставь 에 или 에서 при месте', icon: 'home', to: '/game/home?game=place' }],
  },
  {
    id: 'verbs',
    title: 'Глаголы',
    desc: 'Настоящее и прошедшее время глаголов и прилагательных.',
    icon: 'pen',
    games: [
      { id: 'form', name: 'Выбери форму', desc: 'Глагол в настоящем или прошедшем времени', icon: 'pen', to: '/game/home?game=form' },
      { id: 'type', name: 'Напиши правильную форму', desc: 'Введи форму глагола с клавиатуры', icon: 'pencil', to: '/game/home?game=type' },
    ],
  },
  {
    id: 'questions',
    title: 'Указатели и вопросы',
    desc: 'Вопросительные слова, «этот / тот», «здесь / там».',
    icon: 'cat-q',
    games: [
      { id: 'qw', name: 'Вопросы', desc: 'Вставь вопросительное слово', icon: 'cat-q', to: '/game/home?game=qw' },
      { id: 'dem', name: 'Этот, тот, вон тот', desc: '이 / 그 / 저, 이것 / 그것 / 저것, 여기 / 거기 / 저기', icon: 'telescope', to: '/game/home?game=dem' },
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
    title: 'Общение и вежливость',
    desc: 'Диалоги и уровни вежливости: кому как говорить.',
    icon: 'mail',
    games: [
      { id: 'dlg', name: 'Диалог', desc: 'Выбери подходящий ответ собеседнику', icon: 'mail', to: '/game/home?game=dlg' },
      { id: 'polite', name: 'Уровень вежливости', desc: 'Как сказать «спасибо» другу и начальнику', icon: 'star', to: '/game/home?game=polite' },
    ],
  },
  {
    id: 'numbers',
    title: 'Числа и деньги',
    desc: 'Корейские и китайские числа, цены и счётные слова.',
    icon: 'croissant',
    games: [
      { id: 'num', name: 'Числа', desc: 'Число и цифра: корейский и китайский счёт', icon: 'dice', to: '/game/home?game=num' },
      { id: 'price', name: 'Сколько стоит?', desc: 'Прочитай цену в вонах', icon: 'croissant', to: '/game/home?game=price' },
      { id: 'count', name: 'Счётные слова', desc: 'Бутылка, чашка, штука: выбери слово и число', icon: 'macaron', to: '/game/home?game=count' },
    ],
  },
  {
    id: 'time',
    title: 'Время и дни недели',
    desc: 'Дни недели, утро и вечер, частицы 에 («когда») и 도 («тоже»).',
    icon: 'clock',
    games: [
      { id: 'days', name: 'Дни недели', desc: 'Понедельник, будни, выходные, эта неделя', icon: 'sun', to: '/game/home?game=days' },
      { id: 'when', name: 'Когда? (에)', desc: 'Нужна ли частица «когда»: в пятницу, но сегодня', icon: 'clock', to: '/game/home?game=when' },
      { id: 'too', name: 'Тоже (도)', desc: 'Вставь «тоже»: 도, 에도, 에서도', icon: 'hearts', to: '/game/home?game=too' },
      { id: 'fut', name: 'Планы (-(으)ㄹ 거예요)', desc: 'Буду делать: 갈, 먹을, 살 거예요; сейчас или потом', icon: 'rocket', to: '/game/home?game=fut' },
    ],
  },
]

/** Отдельно от групп: быстрые режимы со смесью заданий. */
export const GAME_MIX: GameCard[] = [
  { id: 'mix', name: 'Микс', desc: 'Все режимы вперемешку', icon: 'dice', to: '/game/home?game=mix' },
  { id: 'quick', name: '5 минут', desc: 'Десять заданий вперемешку', icon: 'rocket', to: '/game/home?game=quick' },
  { id: 'rule', name: 'Потренировать правило', desc: 'Десять заданий из примеров любой карточки', icon: 'grammar', to: '/game/home?game=rule' },
]

/** Все игры списком (для счётчика и поиска). */
export const ALL_GAMES: GameCard[] = [...GAME_MIX, ...GAME_GROUPS.flatMap(g => g.games)]

/** Поиск по названию и описанию без учёта регистра; пустой запрос возвращает всё. */
export function findGames(games: GameCard[], q: string): GameCard[] {
  const s = q.trim().toLowerCase()
  return s ? games.filter(g => g.name.toLowerCase().includes(s) || g.desc.toLowerCase().includes(s)) : games
}

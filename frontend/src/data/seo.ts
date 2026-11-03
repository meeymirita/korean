/**
 * SEO: заголовок, описание и индексация каждой страницы. app.vue подставляет их через useSeoMeta (`seoMetaFor`), nuxt.config.ts берёт
 * отсюда открытые и закрытые адреса (готовый HTML при сборке, robots.txt, sitemap.xml).
 * Закрытые токеном страницы не индексируются (`noindex`), там нет ничего, кроме поля для токена.
 */
export const SITE = 'https://korean.meeymirita.ru'
export const BRAND = '우리말'

export interface Seo {
  title: string
  description: string
  noindex?: boolean
  /** картинка для превью ссылки (по умолчанию общая картинка сайта) */
  image?: string
}

const DEFAULT: Seo = {
  title: `${BRAND} — корейский язык с нуля: слова, грамматика, игры`,
  description: 'Личная платформа для изучения корейского с нуля: словарь с чтением и примерами, грамматика по урокам, справочник, тренажёры и игра на слова.',
}

/** Неизвестный адрес: страница «такого нет», в поиск не попадает. */
const NOT_FOUND: Seo = { title: `Такой страницы нет · ${BRAND}`, description: DEFAULT.description, noindex: true }

const PAGES: Record<string, Seo> = {
  '/': DEFAULT,
  '/about': {
    title: `О платформе ${BRAND}: как устроен сайт для изучения корейского`,
    description: 'Слайдер со скриншотами всех страниц: словарь, грамматика, справочник, тренажёры, игра на слова, личный кабинет с заметками и прогрессом.',
  },
  '/history': {
    title: `История изменений платформы ${BRAND}: что и когда добавили`,
    description: 'Как росла платформа для изучения корейского: от первой версии на Vue до поиска, защиты, заметок, игры и автоматических проверок. Что и когда добавляли.',
  },
  '/me': {
    title: `Моя страница прогресса · ${BRAND}`,
    description: 'Визитка ученика корейского: сколько дней в пути, серия занятий, выученные слова и уровень. Владелец включает страницу сам и может закрыть в любой момент.',
    image: SITE + '/api/public/og.png',
  },
  '/korean/home': {
    title: `Поиск по корейскому: слова, правила, фразы · ${BRAND}`,
    description: 'Один поиск по словарю, грамматике, справочнику, примерам и буквам корейского. Правило дня, слова на сегодня и календарь занятий.',
  },
  '/korean/words': {
    title: `Корейский словарь с чтением и примерами · ${BRAND}`,
    description: 'Словарь корейского по темам: корейское слово, чтение русскими буквами, перевод и пример предложения с разбором по словам и частицам.',
  },
  '/korean/grammar': {
    title: `Корейская грамматика по урокам в карточках · ${BRAND}`,
    description: 'Правила корейской грамматики для начинающих: частицы, вежливая форма, отрицание, места и направления. Формулы, таблицы и примеры в каждой карточке.',
  },
  '/korean/ref/cheat': {
    title: `Шпаргалка по корейскому: частицы и формулы · ${BRAND}`,
    description: 'Частицы, формулы и шаблоны предложений корейского языка на одной странице: быстро вспомнить, как строится фраза.',
  },
  '/korean/ref/talk': {
    title: `Корейский разговорник: фразы и диалоги · ${BRAND}`,
    description: 'Живые корейские фразы, диалоги знакомства и слэнг с переводом и чтением. Подходит, чтобы сразу начать говорить.',
  },
  '/korean/ref/hangul': {
    title: `Хангыль: таблица слогов, как читать и писать · ${BRAND}`,
    description: 'Корейский алфавит хангыль: таблица слогов, как читать и как писать буквы, с чтением русскими буквами.',
  },
  '/korean/ref/alphabet': {
    title: `Корейский алфавит: все буквы и слоги · ${BRAND}`,
    description: 'Все буквы корейского алфавита и слоги с чтением. Нажмите на букву, чтобы увидеть подробности и примеры.',
  },
  '/korean/ref/reading': {
    title: `Правила чтения по-корейски: ㄹ, 받침, звуки · ${BRAND}`,
    description: 'Как читается корейский текст: звучание ㄹ, что происходит между гласными, как читается 받침 и другие особые случаи.',
  },
  '/korean/ref/sentences': {
    title: `Примеры корейских предложений с разбором · ${BRAND}`,
    description: 'Все примеры предложений из словаря с переводом. Нажмите на предложение, и оно разберётся по словам, частицам и формам.',
  },
  '/korean/ref/numbers': {
    title: `Корейские числа и счёт: цены и счётные слова · ${BRAND}`,
    description: 'Два вида корейского счёта, цены, количество и счётные слова: когда какой счёт нужен.',
  },
  '/korean/today': { title: `Сегодня · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/cabinet': { title: `Мой кабинет · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/chat': { title: `Помощник · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/forms': { title: `Слово в разных формах · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/marks': { title: `Важное · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/mistakes': { title: `Мои ошибки · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/review': { title: `Повторение · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/shop': { title: `Магазин Юны · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/upload': { title: `Массовая загрузка картинок · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/notebook': { title: `Тетрадь · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/garden': { title: `Сад воспоминаний · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/culture': { title: `Культура Кореи · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/know': { title: `Что я уже знаю · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/lab': { title: `Мастерская грамматики · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/korean/sites': { title: `Полезные сайты · ${BRAND}`, description: DEFAULT.description, noindex: true },
  '/game/home': { title: `Игры на слова · ${BRAND}`, description: DEFAULT.description, noindex: true },
}

/** SEO страницы по адресу; неизвестный адрес получает общие данные. */
export const seoFor = (path: string): Seo => PAGES[path.replace(/\/+$/, '') || '/'] ?? NOT_FOUND

/** Публичные адреса для карты сайта (то, что не помечено noindex). */
export const indexablePaths = () => Object.entries(PAGES).filter(([, s]) => !s.noindex).map(([p]) => p)
export const privatePaths = () => Object.entries(PAGES).filter(([, s]) => s.noindex).map(([p]) => p)

/** Канонический адрес страницы (без завершающего «/», кроме главной). */
export const canonicalOf = (path: string) => SITE + (path === '/' ? '/' : path.replace(/\/+$/, ''))

/** Всё для <head> страницы: title, description, robots, Open Graph и Twitter. Подставляет app.vue через useSeoMeta (на сервере и в браузере). */
export function seoMetaFor(path: string) {
  const s = seoFor(path)
  const image = s.image ?? SITE + '/og-image.png'
  return {
    title: s.title,
    description: s.description,
    robots: s.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    ogTitle: s.title,
    ogDescription: s.description,
    ogUrl: canonicalOf(path),
    ogImage: image,
    twitterTitle: s.title,
    twitterDescription: s.description,
    twitterImage: image,
  }
}

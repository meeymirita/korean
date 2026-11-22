import { VLOGS } from './vlogs'
import { allPhrases, type PhraseHit } from './vlog-lang'

/**
 * Карта мест из влогов (вкладка «Карта мест»): один большой остров, на нём районы-территории и места (библиотека, кафе, спортзал…).
 * Место связано с влогами по ключевым словам во фразах (один проход рассказа). Координаты в системе карты `MAP_W × MAP_H`.
 * Только справка: ничего не записывается и не засчитывается.
 */
export const MAP_W = 2400
export const MAP_H = 1500

export interface District {
  id: string
  ko: string
  ru: string
  /** цвет территории */
  color: string
  /** центр и полуоси неровного пятна */
  cx: number
  cy: number
  rx: number
  ry: number
  seed: number
  /** где подпись района: корейское название по центру, русское на 30 ниже */
  lx: number
  ly: number
}
export interface Place {
  id: string
  district: string
  ko: string
  ru: string
  /** значок из `vlog-map-art.ts` */
  icon: string
  /** акцентный цвет значка */
  color: string
  x: number
  y: number
  /** по каким словам во фразах влога находим место */
  keys: string[]
  /** одной строкой, что это за место */
  note: string
}

export const DISTRICTS: District[] = [
  { id: 'shop', ko: '시장과 가게', ru: 'Рынки и магазины', color: '#ffc3d8', cx: 560, cy: 450, rx: 320, ry: 220, seed: 3, lx: 560, ly: 178 },
  { id: 'food', ko: '맛집 거리', ru: 'Кафе и еда', color: '#ffd9b4', cx: 1190, cy: 360, rx: 290, ry: 195, seed: 7, lx: 1190, ly: 133 },
  { id: 'care', ko: '건강과 서비스', ru: 'Здоровье и услуги', color: '#c3ecd8', cx: 1800, cy: 440, rx: 290, ry: 220, seed: 11, lx: 1800, ly: 183 },
  { id: 'home', ko: '우리 동네', ru: 'Дом и день', color: '#fff0b0', cx: 470, cy: 980, rx: 290, ry: 220, seed: 5, lx: 470, ly: 775 },
  { id: 'culture', ko: '문화와 휴식', ru: 'Культура и отдых', color: '#d9c6ff', cx: 1140, cy: 820, rx: 320, ry: 220, seed: 13, lx: 1140, ly: 560 },
  { id: 'travel', ko: '교통과 여행', ru: 'Дорога и поездки', color: '#bfdcff', cx: 1810, cy: 900, rx: 300, ry: 225, seed: 17, lx: 1810, ly: 650 },
  { id: 'nature', ko: '자연', ru: 'Природа', color: '#bde7ac', cx: 860, cy: 1190, rx: 340, ry: 180, seed: 19, lx: 860, ly: 973 },
  { id: 'heritage', ko: '옛 서울', ru: 'Старый Сеул', color: '#ffcdbd', cx: 1480, cy: 1255, rx: 270, ry: 165, seed: 23, lx: 1480, ly: 1063 },
]

export const PLACES: Place[] = [
  // рынки и магазины
  { id: 'mall', district: 'shop', ko: '백화점', ru: 'Универмаг', icon: 'mall', color: '#ff86b0', x: 350, y: 440, keys: ['백화점', '쇼핑몰'], note: 'Большой магазин на несколько этажей.' },
  { id: 'market', district: 'shop', ko: '시장', ru: 'Рынок', icon: 'market', color: '#ff7a8a', x: 485, y: 335, keys: ['시장'], note: 'Овощи, фрукты, торг с продавцами.' },
  { id: 'convenience', district: 'shop', ko: '편의점', ru: 'Магазин у дома', icon: 'store', color: '#4cc3b5', x: 650, y: 330, keys: ['편의점'], note: 'Круглосуточный магазин: лапша, кимбап, напитки.' },
  { id: 'supermarket', district: 'shop', ko: '마트', ru: 'Супермаркет', icon: 'store', color: '#6a9cf0', x: 800, y: 430, keys: ['마트', '슈퍼'], note: 'Продукты по отделам и касса.' },
  { id: 'daiso', district: 'shop', ko: '다이소', ru: 'Магазин всякой мелочи', icon: 'store', color: '#f0a23e', x: 520, y: 540, keys: ['다이소'], note: 'Вещи для дома и кухни по маленьким ценам.' },
  { id: 'clothes', district: 'shop', ko: '옷 가게', ru: 'Магазин одежды', icon: 'clothes', color: '#b58cf0', x: 680, y: 600, keys: ['옷 가게', '옷가게'], note: 'Футболки, брюки, примерка.' },
  // кафе и еда
  { id: 'cafe', district: 'food', ko: '카페', ru: 'Кафе', icon: 'cafe', color: '#c98f63', x: 1060, y: 350, keys: ['카페', '커피숍'], note: 'Кофе, десерты, тихое место, чтобы писать и читать.' },
  { id: 'restaurant', district: 'food', ko: '식당', ru: 'Ресторан', icon: 'restaurant', color: '#ff8f6b', x: 1225, y: 285, keys: ['식당', '레스토랑', '음식점'], note: 'Заказать еду, спросить «сколько человек?».' },
  { id: 'bakery', district: 'food', ko: '빵집', ru: 'Пекарня', icon: 'bakery', color: '#e8a959', x: 1345, y: 395, keys: ['빵집', '베이커리'], note: 'Хлеб и выпечка.' },
  { id: 'icecream', district: 'food', ko: '아이스크림 가게', ru: 'Мороженое', icon: 'icecream', color: '#ff9cc6', x: 1130, y: 460, keys: ['아이스크림'], note: 'Вкусы, цены и чек на кассе.' },
  // здоровье и услуги
  { id: 'pharmacy', district: 'care', ko: '약국', ru: 'Аптека', icon: 'pharmacy', color: '#3fae7a', x: 1690, y: 375, keys: ['약국'], note: 'Лекарства и совет аптекаря.' },
  { id: 'clinic', district: 'care', ko: '병원', ru: 'Больница, клиника', icon: 'clinic', color: '#5b8fe8', x: 1855, y: 335, keys: ['병원', '치과'], note: 'Записаться к врачу, рассказать, что болит.' },
  { id: 'salon', district: 'care', ko: '미용실', ru: 'Парикмахерская', icon: 'salon', color: '#e06fa8', x: 1915, y: 470, keys: ['미용실'], note: 'Стрижка, мытьё головы, завивка.' },
  { id: 'laundry', district: 'care', ko: '세탁소', ru: 'Химчистка', icon: 'laundry', color: '#7ab5f0', x: 1745, y: 520, keys: ['세탁소'], note: 'Сдать и забрать одежду.' },
  // дом и день
  { id: 'home', district: 'home', ko: '집', ru: 'Дом', icon: 'home', color: '#f0b04a', x: 430, y: 930, keys: ['집에', '집에서', '거실', '부엌', '침실', '방에', '화장실'], note: 'Утро, уборка, стирка, готовка.' },
  { id: 'work', district: 'home', ko: '회사와 학교', ru: 'Работа и школа', icon: 'office', color: '#8a8fe8', x: 610, y: 1045, keys: ['회사', '학교'], note: 'Куда едут утром.' },
  // культура и отдых
  { id: 'bookstore', district: 'culture', ko: '서점', ru: 'Книжный магазин', icon: 'bookstore', color: '#e88a6a', x: 985, y: 735, keys: ['서점'], note: 'Книги, блокноты, брелоки.' },
  { id: 'library', district: 'culture', ko: '도서관', ru: 'Библиотека', icon: 'library', color: '#8f7cf0', x: 1150, y: 705, keys: ['도서관'], note: 'Читать и заниматься.' },
  { id: 'cinema', district: 'culture', ko: '영화관', ru: 'Кинотеатр', icon: 'cinema', color: '#e0508a', x: 1300, y: 785, keys: ['영화관'], note: 'Билеты, попкорн, фильм на выходных.' },
  { id: 'gym', district: 'culture', ko: '헬스장', ru: 'Спортзал', icon: 'gym', color: '#4c8be8', x: 1035, y: 890, keys: ['헬스장'], note: 'Тренировка и хорошее самочувствие после неё.' },
  { id: 'bath', district: 'culture', ko: '찜질방', ru: 'Баня-сауна', icon: 'bath', color: '#ff8a70', x: 1170, y: 930, keys: ['찜질방'], note: 'Комнаты разной температуры, фудкорт, бассейн.' },
  // дорога и поездки
  { id: 'subway', district: 'travel', ko: '지하철', ru: 'Метро', icon: 'subway', color: '#5a8fe8', x: 1685, y: 845, keys: ['지하철'], note: 'Станция, выход, пересадка.' },
  { id: 'bus', district: 'travel', ko: '버스', ru: 'Автобус', icon: 'bus', color: '#35b58a', x: 1835, y: 805, keys: ['버스'], note: 'Остановка, номер, проезд.' },
  { id: 'train', district: 'travel', ko: '기차', ru: 'Поезд', icon: 'train', color: '#e8745a', x: 1935, y: 925, keys: ['기차', 'KTX'], note: 'Поездка в другой город.' },
  { id: 'airport', district: 'travel', ko: '공항', ru: 'Аэропорт', icon: 'airport', color: '#6f7fe8', x: 1775, y: 995, keys: ['공항', '비행기'], note: 'Регистрация, дьюти-фри, самолёт.' },
  // природа
  { id: 'park', district: 'nature', ko: '공원', ru: 'Парк', icon: 'park', color: '#4caf6a', x: 725, y: 1195, keys: ['공원'], note: 'Прогулка, цветы, велосипед.' },
  { id: 'mountain', district: 'nature', ko: '산', ru: 'Гора', icon: 'mountain', color: '#6fa07a', x: 925, y: 1125, keys: ['등산', '산에', '산을', '산이'], note: 'Поход на вершину.' },
  // старый Сеул
  { id: 'palace', district: 'heritage', ko: '궁', ru: 'Дворец', icon: 'palace', color: '#e0574a', x: 1400, y: 1215, keys: ['경복궁', '궁에', '궁을'], note: 'Ханбок, старая Корея, двор дворца.' },
  { id: 'stay', district: 'heritage', ko: '한옥과 숙소', ru: 'Ханок и гостиница', icon: 'hanok', color: '#b8744a', x: 1590, y: 1290, keys: ['한옥', '북촌', '호텔', '숙소'], note: 'Ночёвка в традиционном доме.' },
  // море
  { id: 'sea', district: 'sea', ko: '바다와 섬', ru: 'Море и остров', icon: 'sea', color: '#4aa8e8', x: 2150, y: 1245, keys: ['바다', '해변', '제주', '우도'], note: 'Остров Чеджу и Удо, паром, берег.' },
]

export const DISTRICT_BY_ID = new Map<string, District | { id: string; ko: string; ru: string }>([...DISTRICTS.map(d => [d.id, d] as const), ['sea', { id: 'sea', ko: '바다', ru: 'Море' }] as const])

export interface PlaceVlog { id: string; title: string; yt: string; channel: string; count: number; firstS: number }
export interface PlaceStat { vlogs: PlaceVlog[]; phrases: PhraseHit[]; total: number }

let index: Map<string, PlaceStat> | null = null
/** Влоги и фразы каждого места: влоги по числу фраз о месте, фразы короткие вперёд, не больше 8 (считается один раз, только в браузере). */
export function mapIndex(): Map<string, PlaceStat> {
  if (index) return index
  const byVlog = new Map(VLOGS.map(v => [v.id, v]))
  const out = new Map<string, PlaceStat>()
  for (const pl of PLACES) {
    const vlogs = new Map<string, PlaceVlog>()
    const phrases: PhraseHit[] = []
    for (const h of allPhrases()) {
      if (!pl.keys.some(k => h.ko.includes(k))) continue
      const v = byVlog.get(h.id)!
      const e = vlogs.get(h.id) ?? vlogs.set(h.id, { id: h.id, title: h.title, yt: v.yt, channel: v.channel, count: 0, firstS: h.s }).get(h.id)!
      e.count++
      e.firstS = Math.min(e.firstS, h.s)
      phrases.push(h)
    }
    const seen = new Set<string>()
    const uniq = phrases.filter(p => p.ko.length <= 32 && !seen.has(p.ko) && (seen.add(p.ko), true)).sort((a, b) => a.ko.length - b.ko.length)
    out.set(pl.id, { vlogs: [...vlogs.values()].sort((a, b) => b.count - a.count), phrases: uniq.slice(0, 8), total: phrases.length })
  }
  index = out
  return out
}

/** Сводка по району: все влоги его мест (по сумме фраз) и число мест. */
export function districtStat(districtId: string): { places: Place[]; vlogs: PlaceVlog[]; total: number } {
  const idx = mapIndex()
  const places = PLACES.filter(p => p.district === districtId)
  const m = new Map<string, PlaceVlog>()
  let total = 0
  for (const p of places) {
    const s = idx.get(p.id)!
    total += s.total
    for (const v of s.vlogs) {
      const e = m.get(v.id)
      if (e) { e.count += v.count; e.firstS = Math.min(e.firstS, v.firstS) } else m.set(v.id, { ...v })
    }
  }
  return { places, vlogs: [...m.values()].sort((a, b) => b.count - a.count), total }
}

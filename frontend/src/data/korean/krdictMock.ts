/** ТЕСТОВЫЕ данные для вёрстки страницы «Большой словарь». Форма записей повторяет krdict_ko_ru.json; настоящий поиск придёт с сервера. */
export interface DictSense {
  definition: string
  ru: { translation: string; definition: string }[]
  example?: string
}

export interface DictEntry {
  id: string
  word: string
  homonym: number
  pos: string
  level: string
  pron: string
  senses: DictSense[]
  /** формы глагола или прилагательного (тестовые, потом считаются сервером) */
  forms?: { label: string; ko: string; ru: string }[]
  synonyms?: { ko: string; ru: string }[]
  related?: { ko: string; ru: string }[]
  notes?: string[]
}

export const DICT_SOURCE = {
  title: '한국어기초사전',
  author: '국립국어원 (Национальный институт корейского языка)',
  archive: 'spellcheck-ko/korean-dict-nikl-krdict',
  license: 'CC BY-SA 2.0 KR',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/kr/',
  snapshot: '2019',
}

export const DICT_MOCK: DictEntry[] = [
  { id: '1', word: '학생', homonym: 0, pos: 'существительное', level: 'начальный', pron: '학쌩', senses: [
    { definition: '학교에 다니면서 공부하는 사람.', ru: [{ translation: 'учащийся; ученик; школьник; студент', definition: 'Тот, кто учится где-либо.' }], example: '교수가 강의를 마치자 학생들은 강의실을 빠져 나갔다.' },
  ] },
  { id: '2', word: '학생복', homonym: 0, pos: 'существительное', level: 'нет', pron: '학쌩복', senses: [
    { definition: '학생들이 입도록 정한 옷.', ru: [{ translation: 'школьная форма', definition: 'Одежда, установленная для учащихся.' }], example: '아이는 새 학생복을 입고 학교에 갔다.' },
  ] },
  { id: '3', word: '학생증', homonym: 0, pos: 'существительное', level: 'нет', pron: '학쌩쯩', senses: [
    { definition: '학생임을 증명하는 카드.', ru: [{ translation: 'студенческий билет', definition: 'Документ, удостоверяющий, что человек учится.' }], example: '도서관에서는 학생증을 보여 주어야 한다.' },
  ] },
  { id: '4', word: '학교', homonym: 0, pos: 'существительное', level: 'начальный', pron: '학꾜', senses: [
    { definition: '교사가 학생을 가르치는 기관.', ru: [{ translation: 'школа', definition: 'Учебное заведение, где учитель обучает учащихся.' }], example: '학교의 수업이 끝난 후 나는 친구들과 교실에 남아 공부를 했다.' },
  ] },
  { id: '5', word: '학교생활', homonym: 0, pos: 'существительное', level: 'нет', pron: '학꾜생활', senses: [
    { definition: '학교에서 지내는 생활.', ru: [{ translation: 'школьная жизнь', definition: 'Жизнь в учебном заведении.' }], example: '새 학교생활이 즐겁다.' },
  ] },
  { id: '6', word: '먹다', homonym: 2, pos: 'глагол', level: 'начальный', pron: '먹따', senses: [
    { definition: '음식 등을 입을 통하여 배 속에 들여보내다.', ru: [{ translation: 'есть; кушать', definition: 'Принимать пищу внутрь через рот.' }], example: '우리는 점심에 식사로 된장찌개를 먹었다.' },
    { definition: '약을 입에 넣어 삼키다.', ru: [{ translation: 'пить', definition: 'Принимать лекарство.' }], example: '약을 먹었더니 통증이 사라졌다.' },
  ] },
  { id: '7', word: '먹다', homonym: 1, pos: 'глагол', level: 'нет', pron: '먹따', senses: [
    { definition: '귀로 소리를 듣지 못하게 되다.', ru: [{ translation: 'оглохнуть', definition: 'Потерять способность слышать звуки.' }], example: '한쪽 귀가 먹어서 말소리가 잘 안 들린다.' },
  ] },
  { id: '8', word: '먹보', homonym: 0, pos: 'существительное', level: 'нет', pron: '먹뽀', senses: [
    { definition: '음식을 많이 먹는 사람.', ru: [{ translation: 'обжора', definition: 'Человек, который много ест.' }], example: '동생은 소문난 먹보이다.' },
  ] },
  { id: '9', word: '먹을거리', homonym: 0, pos: 'существительное', level: 'нет', pron: '머글꺼리', senses: [
    { definition: '먹을 수 있는 모든 것.', ru: [{ translation: 'еда; пища; продовольствие', definition: 'Всё, что можно есть.' }], example: '시장에는 먹을거리가 가득했다.' },
  ] },
  { id: '10', word: '예쁘다', homonym: 0, pos: 'прилагательное', level: 'начальный', pron: '예ː쁘다', senses: [
    { definition: '생긴 모양이 눈으로 보기에 좋을 만큼 아름답다.', ru: [{ translation: 'красивый', definition: 'Приятный на вид.' }], example: '길가에 예쁜 꽃들이 줄지어 피어 있다.' },
    { definition: '행동이나 말투가 사랑스럽고 귀엽다.', ru: [{ translation: 'красивый', definition: 'Милый, приводящий в умиление.' }], example: '너는 말도 참 예쁘게 하는구나.' },
  ] },
  { id: '11', word: '예쁘장하다', homonym: 0, pos: 'прилагательное', level: 'нет', pron: '예ː쁘장하다', senses: [
    { definition: '꽤 예쁘다.', ru: [{ translation: 'миловидный', definition: 'Довольно красивый.' }], example: '예쁘장한 아가씨가 문을 열었다.' },
  ] },
  { id: '12', word: '가다', homonym: 1, pos: 'глагол', level: 'начальный', pron: '가다',
    forms: [
      { label: 'Начальная форма', ko: '가다', ru: 'идти, ходить' },
      { label: 'Вежливая форма (наст.)', ko: '가요', ru: 'иду / хожу' },
      { label: 'Прошедшее время', ko: '갔어요', ru: 'пошёл / сходил' },
      { label: 'Будущее время', ko: '갈 거예요', ru: 'пойду / собираюсь идти' },
      { label: 'Повелительная форма', ko: '가세요', ru: 'идите (вежливо)' },
      { label: 'Запретительная форма', ko: '가지 마세요', ru: 'не ходите (вежливо)' },
    ],
    synonyms: [{ ko: '다니다', ru: 'ходить (регулярно)' }, { ko: '이동하다', ru: 'перемещаться' }],
    related: [{ ko: '오다', ru: 'приходить' }, { ko: '떠나다', ru: 'уезжать, отправляться' }],
    notes: ['Один из самых базовых и часто используемых глаголов.', 'Может означать как физическое движение (идти, ехать, лететь), так и уход, отправление куда-либо.'],
    senses: [
    { definition: '한 곳에서 다른 곳으로 장소를 이동하다.', ru: [{ translation: 'ходить; уходить; идти', definition: 'Передвигаться с одного места на другое.' }], example: '나는 친구에게 갈 때마다 책을 빌려 왔다.' },
    { definition: '배, 비행기, 자동차 등이 일정한 곳을 다니다.', ru: [{ translation: 'плыть; летать; ехать', definition: 'О транспорте.' }], example: '서울에 바로 가는 버스가 있습니까?' },
  ] },
  { id: '13', word: '가게', homonym: 0, pos: 'существительное', level: 'начальный', pron: '가ː게', senses: [
    { definition: '물건을 파는 작은 규모의 집.', ru: [{ translation: 'магазин; лавка; ларёк', definition: 'Небольшое помещение, где продают товары.' }], example: '가게에서 우유를 샀다.' },
  ] },
  { id: '14', word: '비', homonym: 1, pos: 'существительное', level: 'начальный', pron: '비', senses: [
    { definition: '구름에서 물방울로 떨어지는 것.', ru: [{ translation: 'дождь', definition: 'Капли воды, падающие из облаков.' }], example: '비가 와서 우산을 썼다.' },
  ] },
  { id: '15', word: '비빔밥', homonym: 0, pos: 'существительное', level: 'начальный', pron: '비빔빱', senses: [
    { definition: '밥에 여러 가지 나물과 고기를 넣고 비벼 먹는 음식.', ru: [{ translation: 'пибимпап', definition: 'Рис с овощами и мясом, который перемешивают перед едой.' }], example: '점심에 비빔밥을 먹었다.' },
  ] },
]

/** Поиск по начальной форме, по любому месту слова и по русскому переводу (тестовый, в браузере). */
export function searchMock(q: string): DictEntry[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const score = (e: DictEntry) => {
    if (e.word === s) return 0
    if (e.word.startsWith(s)) return 1
    if (e.word.includes(s)) return 2
    const ru = e.senses.flatMap(x => x.ru.map(r => r.translation.toLowerCase())).join(' ')
    return ru.includes(s) ? 3 : 9
  }
  return DICT_MOCK.filter(e => score(e) < 9).sort((a, b) => score(a) - score(b))
}

/** Все записи с таким словом (омонимы), для страницы слова. */
export const entriesOf = (word: string): DictEntry[] => DICT_MOCK.filter(e => e.word === word).sort((a, b) => a.homonym - b.homonym)

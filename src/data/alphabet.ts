export interface Letter {
  char: string
  /** чтение кириллицей */
  reading: string
  /** латинская транскрипция */
  roman: string
  hint?: string
}

export interface LetterGroup {
  id: string
  title: string
  note: string
  letters: Letter[]
}

const L = (char: string, reading: string, roman: string, hint?: string): Letter => ({ char, reading, roman, hint })

export const consonants: LetterGroup = {
  id: 'consonants',
  title: 'Согласные',
  note: '14 основных согласных',
  letters: [
    L('ㄱ', 'г / к', 'g/k', 'как в 가, 김'),
    L('ㄴ', 'н', 'n', 'как в 나, 눈'),
    L('ㄷ', 'д / т', 'd/t', 'как в 다, 동'),
    L('ㄹ', 'р / ль', 'r/l', 'как в 라, 러시아'),
    L('ㅁ', 'м', 'm', 'как в 마, 먹'),
    L('ㅂ', 'б / п', 'b/p', 'как в 바, 밥'),
    L('ㅅ', 'с', 's', 'как в 사, 삼'),
    L('ㅇ', '— / нг', 'ng / —', 'в начале слога не читается: 아'),
    L('ㅈ', 'дж', 'j', 'как в 자, 지'),
    L('ㅊ', 'ч', 'ch', 'как в 차, 치'),
    L('ㅋ', 'к', 'k', 'как в 카, 키'),
    L('ㅌ', 'т', 't', 'как в 타, 팀'),
    L('ㅍ', 'п', 'p', 'как в 파, 펜'),
    L('ㅎ', 'х', 'h', 'как в 하, 한'),
  ],
}

export const vowels: LetterGroup = {
  id: 'vowels',
  title: 'Гласные',
  note: '10 основных гласных',
  letters: [
    L('ㅏ', 'а', 'a'),
    L('ㅑ', 'я', 'ya'),
    L('ㅓ', 'о (среднее)', 'eo', 'рот открыт шире, чем у ㅗ'),
    L('ㅕ', 'ё', 'yeo'),
    L('ㅗ', 'о (глубокое)', 'o', 'губы круглые'),
    L('ㅛ', 'ё', 'yo'),
    L('ㅜ', 'у', 'u'),
    L('ㅠ', 'ю', 'yu'),
    L('ㅡ', 'ы', 'eu'),
    L('ㅣ', 'и', 'i'),
  ],
}

export const compoundVowels: LetterGroup = {
  id: 'compound-vowels',
  title: 'Сложные гласные',
  note: '11 сочетаний',
  letters: [
    L('ㅐ', 'э', 'ae'),
    L('ㅒ', 'йэ', 'yae'),
    L('ㅔ', 'э', 'e', 'звучит так же, как ㅐ'),
    L('ㅖ', 'йэ', 'ye'),
    L('ㅘ', 'ва', 'wa'),
    L('ㅙ', 'вэ', 'wae'),
    L('ㅚ', 'вэ', 'oe'),
    L('ㅝ', 'во', 'wo'),
    L('ㅞ', 'вэ', 'we'),
    L('ㅟ', 'ви', 'wi'),
    L('ㅢ', 'ыи', 'ui'),
  ],
}

export const doubleConsonants: LetterGroup = {
  id: 'double-consonants',
  title: 'Двойные',
  note: '5 напряжённых согласных',
  letters: [
    L('ㄲ', 'кк', 'kk', 'напряжённое ㄱ'),
    L('ㄸ', 'тт', 'tt', 'напряжённое ㄷ'),
    L('ㅃ', 'пп', 'pp', 'напряжённое ㅂ'),
    L('ㅆ', 'сс', 'ss', 'напряжённое ㅅ'),
    L('ㅉ', 'чч', 'jj', 'напряжённое ㅈ'),
  ],
}

/* ---------- таблица слогов ---------- */

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const CHO_RU = ['г', 'кк', 'н', 'д', 'тт', 'р', 'м', 'б', 'пп', 'с', 'сс', '', 'дж', 'чч', 'ч', 'к', 'т', 'п', 'х']
const CHO_EN = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']

const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ']
const JUNG_RU = ['а', 'э', 'я', 'йэ', 'о', 'э', 'ё', 'йэ', 'о', 'ва', 'вэ', 'вэ', 'ё', 'у', 'во', 'вэ', 'ви', 'ю', 'ы', 'ыи', 'и']
const JUNG_EN = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']

/** После ㅈ ㅉ ㅊ «й» не произносится: 자 «джа», а не «джя». */
const AFTER_AFFRICATE: Record<string, string> = { я: 'а', ё: 'о', ю: 'у', йэ: 'э' }
const AFFRICATES = new Set([12, 13, 14])

function reading(cho: number, jung: number) {
  let v = JUNG_RU[jung]!
  if (AFFRICATES.has(cho)) v = AFTER_AFFRICATE[v] ?? v
  return CHO_RU[cho]! + v
}

export const syllableVowels = JUNG.map((char, i) => ({ char, reading: JUNG_RU[i]!, roman: JUNG_EN[i]! }))

export const syllableRows = CHO.map((consonant, c) => ({
  consonant,
  reading: CHO_RU[c] || '—',
  cells: JUNG.map((j, v): Letter => ({
    char: String.fromCharCode(0xac00 + (c * 21 + v) * 28),
    reading: reading(c, v),
    roman: CHO_EN[c]! + JUNG_EN[v]!,
    hint: `${consonant} + ${j}`,
  })),
}))

export const groups: LetterGroup[] = [consonants, vowels, compoundVowels, doubleConsonants]

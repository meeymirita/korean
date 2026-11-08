/**
 * Правила-«семьи» для режима «Тексты по правилу» (`ptext`): какие частицы собираются в пропусках и какие карточки грамматики к ним относятся.
 * `g` это id карточек из `data/korean/grammar.ts` (их отдаёт разбор предложений в поле `g`), `marks` плитки банка.
 */
export interface RuleFamily {
  id: string
  name: string
  hint: string
  marks: string[]
  g: string[]
}

const BASE: RuleFamily[] = [
  { id: 'topic', name: '은 / 는', hint: 'частица темы: 은 после 받침, 는 без него', marks: ['은', '는'], g: ['eun'] },
  { id: 'subject', name: '이 / 가', hint: 'частица подлежащего: 이 после 받침, 가 без него', marks: ['이', '가'], g: ['iga'] },
  { id: 'object', name: '을 / 를', hint: 'частица объекта: 을 после 받침, 를 без него', marks: ['을', '를'], g: ['eul'] },
  { id: 'place', name: '에 / 에서', hint: '에: куда, где находишься, когда; 에서: где происходит действие', marks: ['에', '에서'], g: ['iss', 'gada', 'eseo', 'when_e'] },
  { id: 'and', name: '하고 / 와 / 과', hint: '«и», «с»: 하고 в любом случае, 와 без 받침, 과 с 받침', marks: ['하고', '와', '과'], g: ['hago'] },
]

export const PFAMS: RuleFamily[] = [
  ...BASE,
  { id: 'all', name: 'Все вместе', hint: 'все пять правил вперемешку', marks: [...new Set(BASE.flatMap(f => f.marks))], g: BASE.flatMap(f => f.g) },
]

/** Семья по id карточки грамматики (для кнопки «Текст по правилу» в окне карточки), у других карточек нет. */
export const famOfCard = (cardId: string): string | undefined => BASE.find(f => f.g.includes(cardId))?.id

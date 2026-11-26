/**
 * Картинки к словам (проба, вкладка «Картинки» на странице «Повторение»): плоские SVG в одном стиле, viewBox 120×120.
 * Рисуем только слова, которые уже есть в словаре (`STUDY`), новых слов тут нет; тест `test/word-pics.spec.ts` следит за этим.
 * Разметка своя, в неё не попадает ничего от пользователя, поэтому её можно вставлять через `v-html`.
 */
export interface WordPic {
  /** слово, как в словаре (`k`) */
  k: string
  /** содержимое `<svg viewBox="0 0 120 120">` */
  svg: string
}

const BASE: WordPic[] = [
  {
    k: '사과',
    svg: `<path d="M60 38q0-14 7-20" fill="none" stroke="#8b5a3c" stroke-width="5" stroke-linecap="round"/>
<path d="M64 32q14-14 28-4-14 14-28 4z" fill="#6cc788"/>
<circle cx="44" cy="68" r="30" fill="#ff6b81"/><circle cx="76" cy="68" r="30" fill="#ff6b81"/><ellipse cx="60" cy="74" rx="30" ry="28" fill="#ff6b81"/>
<ellipse cx="42" cy="58" rx="6" ry="11" fill="#fff" opacity=".45" transform="rotate(20 42 58)"/>`,
  },
  {
    k: '책',
    svg: `<rect x="28" y="20" width="64" height="82" rx="8" fill="#7863ff"/>
<rect x="28" y="20" width="12" height="82" rx="6" fill="#5b45d6"/>
<rect x="48" y="36" width="34" height="20" rx="5" fill="#ffd6e8"/>
<rect x="48" y="66" width="30" height="5" rx="2.5" fill="#cfc6ff"/><rect x="48" y="78" width="22" height="5" rx="2.5" fill="#cfc6ff"/>
<rect x="88" y="26" width="8" height="70" rx="3" fill="#fff"/><path d="M88 34h8M88 44h8M88 54h8M88 64h8M88 74h8M88 84h8" stroke="#e3d9ff" stroke-width="2"/>`,
  },
  {
    k: '집',
    svg: `<rect x="80" y="26" width="10" height="20" rx="2" fill="#d6488e"/>
<polygon points="60,16 14,58 106,58" fill="#ff8fa3"/>
<rect x="26" y="56" width="68" height="46" fill="#ffe9d6"/>
<rect x="52" y="70" width="18" height="32" rx="4" fill="#8f7cf0"/><circle cx="65" cy="87" r="1.8" fill="#fff"/>
<rect x="33" y="68" width="14" height="14" rx="2" fill="#bfe3ff"/><path d="M40 68v14M33 75h14" stroke="#fff" stroke-width="2"/>
<rect x="76" y="68" width="14" height="14" rx="2" fill="#bfe3ff"/><path d="M83 68v14M76 75h14" stroke="#fff" stroke-width="2"/>
<rect x="10" y="102" width="100" height="5" rx="2.5" fill="#bde5b8"/>`,
  },
  {
    k: '우산',
    svg: `<path d="M60 20v6" stroke="#6b5b95" stroke-width="5" stroke-linecap="round"/>
<path d="M14 64A46 46 0 0 1 106 64q-11-9-23 0-11-9-23 0-11-9-23 0-11-9-23 0z" fill="#ff7aa8"/>
<path d="M60 26C46 36 40 50 38 64M60 26C74 36 80 50 82 64M60 26v38" stroke="#fff" stroke-width="3" opacity=".7" fill="none"/>
<path d="M60 64v30q0 10 10 10t10-10" fill="none" stroke="#6b5b95" stroke-width="5" stroke-linecap="round"/>
<circle cx="60" cy="20" r="4" fill="#6b5b95"/>`,
  },
  {
    k: '꽃',
    svg: `<path d="M60 70v36" stroke="#4fb477" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="76" cy="94" rx="14" ry="7" fill="#6cc788" transform="rotate(-25 76 94)"/>
<ellipse cx="44" cy="100" rx="12" ry="6" fill="#6cc788" transform="rotate(20 44 100)"/>
<g fill="#ff9bd0"><circle cx="60" cy="34" r="15"/><circle cx="82" cy="50" r="15"/><circle cx="74" cy="76" r="15"/><circle cx="46" cy="76" r="15"/><circle cx="38" cy="50" r="15"/></g>
<circle cx="60" cy="58" r="13" fill="#ffd966"/><circle cx="56" cy="55" r="3" fill="#fff" opacity=".6"/>`,
  },
  {
    k: '커피',
    svg: `<path d="M44 26q-6 8 0 14t0 14M62 20q-6 8 0 14t0 14M80 26q-6 8 0 14t0 14" fill="none" stroke="#cfc6e8" stroke-width="4" stroke-linecap="round"/>
<ellipse cx="60" cy="100" rx="44" ry="8" fill="#e3d9ff"/>
<path d="M26 58h68v18q0 22-22 22H48q-22 0-22-22z" fill="#fff" stroke="#c9b9ff" stroke-width="3"/>
<ellipse cx="60" cy="58" rx="34" ry="7" fill="#8b5a3c"/>
<path d="M94 64q16 0 16 12t-18 12" fill="none" stroke="#c9b9ff" stroke-width="6" stroke-linecap="round"/>
<path d="M40 72q4 12 14 14" fill="none" stroke="#ffd6e8" stroke-width="4" stroke-linecap="round"/>`,
  },
]

import { FOOD } from './word-pics-food'
import { NATURE } from './word-pics-nature'
import { THINGS } from './word-pics-things'
import { PLACES } from './word-pics-places'

/** Все рисунки: основа и тематические файлы `word-pics-*.ts`. */
export const WORD_PICS: WordPic[] = [...BASE, ...FOOD, ...NATURE, ...THINGS, ...PLACES]

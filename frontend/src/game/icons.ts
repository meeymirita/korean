/** Иконки страницы «Игра на слова»: нарезаны из листов стикеров владельца, лежат в src/assets/game/icons/<имя>.webp. */
import { themedMap } from '@/lib/themed'
const urls = import.meta.glob(['../assets/game/icons/*.webp', '!../assets/game/icons/*-light.webp'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const BASE: Record<string, string> = {}
for (const [path, url] of Object.entries(urls)) BASE[path.split('/').pop()!.replace('.webp', '')] = url
/** Адрес иконки подбирается под тему при чтении (`lib/themed.ts`). */
export const ICON: Record<string, string> = themedMap(BASE)

/** Картинка-иконка как HTML (для движка игры и разметки). */
export const iconImg = (name: string) => `<img class="gi-img" src="${ICON[name] ?? ''}" alt="" aria-hidden="true">`

/** Иконка режима игры (id режима → имя файла). */
export const MODE_ICON: Record<string, string> = {
  mix: 'dice', word: 'speech', rev: 'card', form: 'pen', qw: 'cat-q', part: 'macaron', build: 'board', spot: 'telescope',
  type: 'pencil', err: 'eraser', pair: 'hearts', ord: 'comet', dlg: 'mail', han: 'han',
  days: 'sun', when: 'clock', too: 'hearts', num: 'dice', price: 'croissant', count: 'macaron',
  neg: 'heart', place: 'home', dem: 'telescope', polite: 'star', ptext: 'wand', fut: 'rocket', only: 'sparkle',
}

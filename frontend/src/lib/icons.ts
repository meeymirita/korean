/**
 * Иконки платформы: все картинки лежат в `src/assets/icons/` (стикеры «Быстрого доступа»: fire, lock, bulb, sprout…)
 * и в `src/assets/game/icons/` (иконки игр: dice, star, sakura, heart…). Имя файла без `.webp` и есть имя иконки.
 * В шаблонах: `<Icon name="fire" />`; в данных вместо эмодзи пишем имя иконки.
 */
import { themedMap } from '@/lib/themed'

const files = {
  ...import.meta.glob(['../assets/game/icons/*.webp', '!../assets/game/icons/*-light.webp'], { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob(['../assets/icons/*.webp', '!../assets/icons/*-light.webp'], { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>

const BASE: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) BASE[path.split('/').pop()!.replace('.webp', '')] = url
/** Адрес иконки подбирается под тему при чтении (`lib/themed.ts`). */
export const ICONS: Record<string, string> = themedMap(BASE)

/** Соответствие «эмодзи → иконка», по нему меняли эмодзи в данных (ярлыки, подсказки). */
export const EMOJI_ICON: Record<string, string> = {
  '🔒': 'lock', '🔥': 'fire', '⭐': 'star', '🌸': 'sakura', '⏱': 'stopwatch', '🎯': 'target', '🎉': 'party', '🖼': 'picture',
  '🎲': 'dice', '💡': 'bulb', '🔧': 'wrench', '🧩': 'puzzle', '🌱': 'sprout', '🌿': 'sprout', '💬': 'chat', '❓': 'question',
  '🔍': 'search', '🔎': 'search', '📅': 'calendar', '🏠': 'home', '📖': 'book', '📚': 'dict', '📐': 'grammar', '📝': 'pen',
  '✍': 'han', '👂': 'sparkle', '🔢': 'chart', '🧱': 'board', '🔀': 'arrows', '👯': 'hearts', '🩹': 'bell', '🔁': 'arrows',
  '🕘': 'clock', '❤': 'heart', '🍞': 'bread', '🎮': 'dice', '🔗': 'hearts', '✉': 'mail', '📎': 'notebook', '📄': 'notebook',
  '🖨': 'notebook', '💧': 'sparkle', '👋': 'sparkle', '✨': 'sparkle', '🔤': 'speech', '🏗': 'board', '🕵': 'eraser', '⚖': 'hearts',
}

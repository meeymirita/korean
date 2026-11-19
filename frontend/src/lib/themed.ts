/**
 * Картинки под тему: в тёмных темах (розовая, ночная, тёмная) берётся новый набор, в светлой старый.
 * Старый лежит рядом под именем `<имя>-light.webp`; файла `-light` нет у картинки, значит она общая для всех тем.
 * Подмена идёт по адресу картинки, поэтому работает и для импортов, и для `import.meta.glob`.
 * В шаблонах и `computed` вызывай `themed(url)`: он читает `themeLight`, страница сама перерисуется при смене темы.
 */
import { themeLight } from '@/lib/theme'

const all = import.meta.glob(
  ['../assets/{icons,game,cats,levels,player}/**/*.webp', '../assets/home/dash/*.webp'],
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

const LIGHT = new Map<string, string>()
for (const [path, url] of Object.entries(all)) {
  if (!path.endsWith('-light.webp')) continue
  const base = all[path.replace('-light.webp', '.webp')]
  if (base) LIGHT.set(base, url)
}

/** Адрес картинки под текущую тему. */
export function themed(url: string | undefined): string {
  if (!url) return ''
  return themeLight.value ? (LIGHT.get(url) ?? url) : url
}

/** Словарь «имя → адрес», у которого значение подбирается под тему в момент чтения (`ICONS[name]`). */
export function themedMap(base: Record<string, string>): Record<string, string> {
  return new Proxy(base, {
    get: (t, k) => (typeof k === 'string' && k in t ? themed(t[k]) : undefined),
  })
}

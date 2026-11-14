import { shotName } from '@/data/guide'

/** Скриншоты страниц и игр (`assets/about/*.webp`, снимает `scripts/about-shots.mjs`): окно «Что здесь есть» и страница «О платформе». */
const files = import.meta.glob('../assets/about/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const URLS: Record<string, string> = {}
for (const [path, url] of Object.entries(files)) URLS[path.split('/').pop()!.replace('.webp', '')] = url

/** Адрес картинки для страницы или игры по её адресу `to`; пустая строка, если скриншота нет. */
export const shotUrl = (to: string) => URLS[shotName(to)] ?? ''

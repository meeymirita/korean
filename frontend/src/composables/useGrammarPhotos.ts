import { computed } from 'vue'
import { PHOTO_KEYS, photoKey, photoUrl, type PhotoCard } from '@/data/korean/grammarPhotos'
import { fetchT, LONG_TIMEOUT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

/** список с сервера уже спрашивали (только в браузере: `load` зовут из onMounted) */
let asked = false

/**
 * Фото карточек грамматики: у каких карточек оно есть (список папки `korean_grammar` на Яндекс.Диске) и управление для владельца.
 * До ответа сервера работает список из кода (`PHOTO_KEYS`), поэтому страница с сервера и в браузере рисуется одинаково.
 */
export function useGrammarPhotos() {
  const keys = useState<string[]>('grammar_photos', () => [...PHOTO_KEYS])
  /** имя → метка времени: фото заменили или старая ссылка умерла, адрес идёт с `?fresh=…` */
  const fresh = useState<Record<string, number>>('grammar_photos_fresh', () => ({}))
  const has = computed(() => new Set(keys.value))

  /** Адрес фото карточки или undefined, если фото нет. */
  function photoOf(g: PhotoCard): string | undefined {
    const key = photoKey(g)
    if (!key || !has.value.has(key)) return undefined
    return fresh.value[key] ? `${photoUrl(key)}?fresh=${fresh.value[key]}` : photoUrl(key)
  }

  /** Картинка не загрузилась (файл на Диске заменили, а ссылка в памяти сервера и браузера ещё старая): один раз просим свежую ссылку. */
  function failed(g: PhotoCard) {
    const key = photoKey(g)
    if (key && !fresh.value[key]) fresh.value = { ...fresh.value, [key]: Date.now() }
  }

  /** Список фото с Диска: один раз за заход на сайт; не ответил сервер, остаётся список из кода. */
  async function load() {
    if (asked) return
    asked = true
    try {
      const r = await fetchT('/api/pic/grammar')
      if (!r.ok) return
      const d = (await r.json()) as { keys?: unknown }
      if (Array.isArray(d.keys)) keys.value = d.keys.filter((k): k is string => typeof k === 'string')
    } catch {
      /* остаётся список из кода */
    }
  }

  const headers = () => ({ Authorization: `Bearer ${useProgressStore().bearer}` })
  async function done(r: Response, key: string, has: boolean) {
    if (!r.ok) throw new Error(r.status === 413 ? 'Файл слишком большой' : r.status === 400 ? 'Сервер не принял картинку' : r.status === 503 ? 'Яндекс.Диск не ответил, попробуйте ещё раз' : `Ошибка ${r.status}`)
    const d = (await r.json()) as { keys?: string[] }
    if (Array.isArray(d.keys)) keys.value = d.keys
    if (has) fresh.value = { ...fresh.value, [key]: Date.now() }
  }

  /** Загрузить или заменить фото: сервер сжимает его и кладёт на Яндекс.Диск. Только владелец. */
  async function upload(key: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    await done(await fetchT(`/api/pic/grammar/${encodeURIComponent(key)}/file`, { method: 'POST', headers: headers(), body: form }, LONG_TIMEOUT), key, true)
  }

  /** Убрать фото карточки (на Диске файл уходит в корзину). Только владелец. */
  async function remove(key: string) {
    await done(await fetchT(`/api/pic/grammar/${encodeURIComponent(key)}`, { method: 'DELETE', headers: headers() }), key, false)
  }

  return { photoOf, failed, load, upload, remove }
}

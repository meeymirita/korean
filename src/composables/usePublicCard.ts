import { computed, ref } from 'vue'
import { fetchT, LONG_TIMEOUT } from '@/lib/http'
import { renderCard } from '@/lib/shareCard'
import { useHome } from '@/composables/useHome'
import { D } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

export interface PublicSettings {
  enabled: boolean
  cover: string
  hasOg: boolean
  updated: number
}

/** Публичная визитка /me: настройки на сервере и то, что из личных данных уходит наружу (только короткая выборка). */
export function usePublicCard() {
  const progress = useProgressStore()
  const { days } = useHome()
  const settings = ref<PublicSettings | null>(null)
  const busy = ref(false)
  const headers = (json = false) => ({ Authorization: `Bearer ${progress.bearer}`, ...(json ? { 'Content-Type': 'application/json' } : {}) })

  /** Что показывается на странице: имя, значок, уровень, серия, счётчики. Ответы и слова по одному не публикуются. */
  const card = computed(() => ({
    name: progress.data.profile.name,
    avatar: progress.data.profile.avatar,
    level: progress.info.level,
    title: progress.info.title,
    streak: progress.streak,
    learned: D.filter(d => progress.status(d.k) === 'known').length,
    answers: Object.values(progress.data.sources).reduce((n, s) => n + s.ok + s.bad, 0),
    days: days,
  }))

  async function load() {
    const res = await fetchT('/api/public/settings', { headers: headers() })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    settings.value = (await res.json()) as PublicSettings
  }

  /** Сохраняет настройки вместе со свежей визиткой; coverOn — показывать ли обложку кабинета. */
  async function save(enabled: boolean, coverOn: boolean) {
    busy.value = true
    try {
      const cover = coverOn ? progress.data.profile.cover : ''
      const res = await fetchT('/api/public/settings', { method: 'PUT', headers: headers(true), body: JSON.stringify({ enabled, cover, card: card.value }) })
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      settings.value = (await res.json()) as PublicSettings
      if (enabled) await publishOg()
    } finally {
      busy.value = false
    }
  }

  /** Рисует картинку для превью ссылки и отправляет на сервер. */
  async function publishOg() {
    const c = card.value
    const blob = await renderCard({
      kicker: 'мой путь в корейском',
      title: c.name || 'Изучаю корейский',
      sub: `уровень ${c.level} · ${c.title}`,
      lines: [`${c.days} дней в пути · серия ${c.streak}`, `выучено слов: ${c.learned} · ответов: ${c.answers}`],
      icon: c.avatar.length <= 8 ? c.avatar : '🌸',
      footer: 'korean.meeymirita.ru/me',
    })
    const form = new FormData()
    form.append('file', blob, 'og.png')
    const res = await fetchT('/api/public/og', { method: 'POST', headers: headers(), body: form }, LONG_TIMEOUT)
    if (!res.ok) throw new Error(`картинка для ссылки не загрузилась (${res.status})`)
    if (settings.value) settings.value.hasOg = true
  }

  return { settings, card, busy, load, save }
}

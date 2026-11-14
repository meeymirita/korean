<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import type { DictHit } from '@/lib/dictApi'
import { canonicalOf } from '@/data/seo'
import { ruDescription, ruJsonLd, ruLead, ruTitle } from '@/lib/ruSeo'

/** «школа по-корейски»: слова с точным русским переводом и похожие значения. Открыта поисковикам; данные `GET /api/dict/ru-word/:слово`. */
const route = useRoute()
const config = useRuntimeConfig()
const q = computed(() => String(route.params.word ?? '').toLowerCase())
const { data, error } = await useFetch<{ q: string; exact: DictHit[]; related: DictHit[] }>(() => `/api/dict/ru-word/${encodeURIComponent(q.value)}`, {
  baseURL: import.meta.server ? config.apiBase : undefined,
  timeout: 15_000,
  key: `ru-word-${q.value}`,
  watch: [q],
})
const exact = computed(() => data.value?.exact ?? [])
const related = computed(() => data.value?.related ?? [])
if (import.meta.server && !data.value && error.value?.statusCode === 404) setResponseStatus(useRequestEvent()!, 404)

const firstRu = (h: DictHit) => h.senses[0]?.ru.map(r => r.t).filter(Boolean).join('; ') || h.ru
const example = (h: DictHit) => h.senses.find(s => s.sent.length)?.sent[0] ?? ''
const levelName = (l: string) => (l === 'нет' ? '' : l)

const has = computed(() => exact.value.length > 0)
const title = computed(() => (has.value ? ruTitle(q.value, exact.value) : 'Слова нет · 우리말'))
const description = computed(() => (has.value ? ruDescription(q.value, exact.value) : 'Такого русского слова в словаре нет.'))
useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  twitterTitle: () => title.value,
  twitterDescription: () => description.value,
  robots: () => (has.value ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, nofollow'),
})
useHead({ script: [{ key: 'ru-ld', type: 'application/ld+json', innerHTML: () => (has.value ? JSON.stringify(ruJsonLd(q.value, canonicalOf(route.path))) : '') }] })
</script>

<template>
  <DictShell>
    <nav class="rcrumbs" aria-label="Хлебные крошки">
      <RouterLink to="/">Главная</RouterLink><span>›</span><RouterLink to="/dict">Словарь</RouterLink><span>›</span><RouterLink to="/ru">Русско-корейский</RouterLink><span>›</span><b>{{ q }}</b>
    </nav>

    <section v-if="!has" class="rbox">
      <h1>{{ q }}</h1>
      <p>Такого русского слова в словаре нет. Попробуй <RouterLink :to="{ path: '/dict', query: { q } }">поиск</RouterLink>.</p>
    </section>

    <template v-else>
      <section class="rbox">
        <h1>{{ q }} по-корейски</h1>
        <p class="rlead" lang="ru">{{ ruLead(q, exact) }}</p>
      </section>

      <section class="rbox rlist">
        <h2>Как сказать «{{ q }}»</h2>
        <article v-for="h in exact" :key="h.id" class="ritem">
          <div class="rhead">
            <RouterLink :to="`/dict/${encodeURIComponent(h.word)}`" class="rko" lang="ko">{{ h.word }}</RouterLink>
            <span v-if="h.pron" class="rpron">[{{ h.pron }}]</span>
            <span class="rchip">{{ h.pos }}</span>
            <span v-if="levelName(h.level)" class="rchip lv">{{ levelName(h.level) }}</span>
          </div>
          <p class="rtr">{{ firstRu(h) }}</p>
          <p v-if="example(h)" class="rex" lang="ko">{{ example(h) }}</p>
        </article>
      </section>

      <section v-if="related.length" class="rbox rlist">
        <h2>Слова, где встречается «{{ q }}»</h2>
        <ul class="rrel">
          <li v-for="h in related" :key="h.id"><RouterLink :to="`/dict/${encodeURIComponent(h.word)}`" lang="ko">{{ h.word }}</RouterLink><span>{{ firstRu(h) }}</span></li>
        </ul>
      </section>
    </template>
  </DictShell>
</template>

<style scoped>
.rcrumbs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: fit-content; max-width: 100%; margin: 14px 0 12px; padding: 6px 16px; border-radius: 999px; background: rgba(255, 255, 255, .7); font-size: 12.5px; color: var(--muted); }
.rcrumbs a:hover { color: var(--ink); }
.rcrumbs b { color: var(--ink); font-weight: 600; }
.rbox { margin-bottom: 14px; padding: 20px 26px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); }
.rbox h1 { margin: 0; font-size: clamp(34px, 6vw, 52px); line-height: 1.1; font-weight: 700; }
.rbox h2 { margin: 0 0 12px; font-size: 18px; }
.rlead { margin: 10px 0 0; color: var(--muted); font-size: 16px; line-height: 1.55; }
.ritem { padding: 14px 0; border-top: 1px solid var(--line); }
.ritem:first-of-type { border-top: 0; }
.rhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; }
.rko { font-size: 30px; font-weight: 700; color: var(--ink); text-decoration: none; }
.rko:hover { color: var(--accent); }
.rpron { color: var(--muted); font-size: 16px; }
.rchip { padding: 3px 12px; border-radius: 999px; background: var(--pink); color: var(--accent); font-size: 12.5px; font-weight: 600; }
.rchip.lv { background: var(--soft); color: var(--accent2); }
.rtr { margin: 6px 0 0; font-size: 15px; }
.rex { margin: 6px 0 0; font-size: 15px; color: var(--muted); }
.rrel { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px 18px; }
.rrel li { display: flex; gap: 10px; align-items: baseline; }
.rrel a { font-weight: 700; color: var(--ink); text-decoration: none; }
.rrel a:hover { color: var(--accent); }
.rrel span { color: var(--muted); font-size: 13.5px; }
</style>

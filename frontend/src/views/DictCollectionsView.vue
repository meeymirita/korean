<script setup lang="ts">
import { RouterLink } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import type { DictCollectionInfo } from '@/lib/dictApi'
import { BRAND, SITE } from '@/data/seo'

const config = useRuntimeConfig()
const { data } = await useFetch<DictCollectionInfo[]>('/api/dict/collections', {
  baseURL: import.meta.server ? config.apiBase : undefined,
  timeout: 15_000,
  key: 'dict-collections',
})

const title = `Подборки корейских слов: топ-100, глаголы, темы · ${BRAND}`
const description = 'Подборки корейских слов начального уровня с переводом: 100 главных слов, глаголы, прилагательные, еда, время, числа, семья, цвета. Из словаря 한국어기초사전.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, twitterTitle: title, twitterDescription: description, robots: 'index, follow, max-image-preview:large' })
useHead({
  script: [{
    key: 'dict-ld',
    type: 'application/ld+json',
    innerHTML: () => JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: BRAND, item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Большой словарь', item: `${SITE}/dict` },
          { '@type': 'ListItem', position: 3, name: 'Подборки слов', item: `${SITE}/dict/podborki` },
        ],
      }],
    }),
  }],
})
</script>

<template>
  <DictShell>
    <nav class="crumbs" aria-label="Хлебные крошки">
      <RouterLink to="/">Главная</RouterLink><span>›</span><RouterLink to="/dict">Словарь</RouterLink><span>›</span><b>Подборки</b>
    </nav>

    <section class="box">
      <h1>Подборки корейских слов</h1>
      <p class="intro">Самые частые слова корейского языка, а также слова начального уровня по частям речи и темам. Частота по списку Национального института корейского языка, переводы из 한국어기초사전.</p>
    </section>

    <ul class="grid">
      <li v-for="c in data ?? []" :key="c.slug">
        <RouterLink :to="`/dict/podborki/${c.slug}`">
          <b>{{ c.title }}</b>
          <span>{{ c.count }} слов</span>
        </RouterLink>
      </li>
    </ul>
  </DictShell>
</template>

<style scoped>
.crumbs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: fit-content; max-width: 100%; margin: 14px 0 12px; padding: 6px 16px; border-radius: 18px; background: rgba(255, 255, 255, .7); font-size: 12.5px; color: var(--muted); }
.crumbs a:hover { color: var(--ink); }
.crumbs b { color: var(--ink); font-weight: 600; }
.box { padding: 20px 26px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); }
.box h1 { margin: 0; font-size: clamp(26px, 4.5vw, 38px); line-height: 1.2; font-weight: 700; }
.intro { margin: 10px 0 0; max-width: 70ch; color: #3b3f7a; font-size: 15px; line-height: 1.55; }
.grid { list-style: none; margin: 14px 0 20px; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 10px; }
.grid a { display: flex; flex-direction: column; gap: 6px; height: 100%; box-sizing: border-box; padding: 16px 20px; border: 1px solid #fff; border-radius: 20px; background: var(--surface); box-shadow: var(--shadow); transition: transform .2s, box-shadow .2s; }
.grid a:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(70, 55, 140, .16); }
.grid b { font-size: 16px; color: #43308c; }
.grid span { font-size: 13px; color: var(--muted); }
@media (max-width: 600px) { .box { padding: 16px; } }
</style>

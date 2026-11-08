<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import type { DictCollection } from '@/lib/dictApi'
import { canonicalOf, BRAND } from '@/data/seo'
import { collectionJsonLd } from '@/lib/dictSeo'

const route = useRoute()
const config = useRuntimeConfig()
const slug = computed(() => String(route.params.slug ?? ''))

const { data, error } = await useFetch<DictCollection>(() => `/api/dict/collection/${encodeURIComponent(slug.value)}`, {
  baseURL: import.meta.server ? config.apiBase : undefined,
  timeout: 15_000,
  key: `dict-collection-${slug.value}`,
  watch: [slug],
})

const url = computed(() => canonicalOf(route.path))
if (import.meta.server && !data.value && error.value?.statusCode === 404) setResponseStatus(useRequestEvent()!, 404)
const seoTitle = computed(() => (data.value ? `${data.value.seoTitle} · ${BRAND}` : `Такой подборки нет · ${BRAND}`))
useSeoMeta({
  title: () => seoTitle.value,
  description: () => data.value?.description ?? 'Такой подборки слов нет.',
  ogTitle: () => seoTitle.value,
  ogDescription: () => data.value?.description,
  twitterTitle: () => seoTitle.value,
  twitterDescription: () => data.value?.description,
  robots: () => (data.value ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'),
})
useHead({
  script: [{ key: 'dict-ld', type: 'application/ld+json', innerHTML: () => (data.value ? JSON.stringify(collectionJsonLd(data.value, url.value)) : '') }],
})
const href = (w: string) => `/dict/${encodeURIComponent(w)}`
</script>

<template>
  <DictShell>
    <nav class="crumbs" aria-label="Хлебные крошки">
      <RouterLink to="/">Главная</RouterLink><span>›</span><RouterLink to="/dict">Словарь</RouterLink><span>›</span><RouterLink to="/dict/podborki">Подборки</RouterLink><span>›</span><b>{{ data?.title ?? slug }}</b>
    </nav>

    <section v-if="!data" class="box">
      <h1>Такой подборки нет</h1>
      <p v-if="error?.statusCode === 404">Посмотри <RouterLink to="/dict/podborki">все подборки</RouterLink> или <RouterLink to="/dict">найди слово в словаре</RouterLink>.</p>
      <p v-else>Не получилось загрузить подборку. Обнови страницу или попробуй позже.</p>
    </section>

    <template v-else>
      <section class="box">
        <h1>{{ data.title }}</h1>
        <p class="intro">{{ data.intro }}</p>
        <p class="count">{{ data.items.length }} слов</p>
      </section>

      <ol class="list">
        <li v-for="(w, i) in data.items" :key="`${w.word}-${w.hom}`">
          <span class="n">{{ i + 1 }}</span>
          <RouterLink :to="href(w.word)" class="w" lang="ko">{{ w.word }}</RouterLink>
          <span v-if="w.pron" class="pron">[{{ w.pron }}]</span>
          <span class="ru">{{ w.ru }}</span>
          <span class="pos">{{ w.pos }}</span>
        </li>
      </ol>

      <p class="src">Рейтинг частоты: «한국어 학습용 어휘 목록», Национальный институт корейского языка (국립국어원), лицензия 공공누리 типа 1. Переводы и примеры: 한국어기초사전, CC BY-SA 2.0 KR.</p>

      <p class="src">Рейтинг частоты: «한국어 학습용 어휘 목록», Национальный институт корейского языка (국립국어원), лицензия 공공누리 типа 1. Переводы и примеры: 한국어기초사전, CC BY-SA 2.0 KR.</p>

      <section class="box more">
        <h2>Другие подборки</h2>
        <p class="chips"><RouterLink v-for="o in data.others" :key="o.slug" :to="`/dict/podborki/${o.slug}`">{{ o.title }}</RouterLink></p>
      </section>
    </template>
  </DictShell>
</template>

<style scoped>
.crumbs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: fit-content; max-width: 100%; margin: 14px 0 12px; padding: 6px 16px; border-radius: 18px; background: rgba(255, 255, 255, .7); font-size: 12.5px; color: var(--muted); }
.crumbs a:hover { color: var(--ink); }
.crumbs b { color: var(--ink); font-weight: 600; }
.box { padding: 20px 26px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); }
.box h1 { margin: 0; font-size: clamp(26px, 4.5vw, 38px); line-height: 1.2; font-weight: 700; }
.box h2 { margin: 0 0 10px; font-size: 16px; }
.intro { margin: 10px 0 0; max-width: 70ch; color: #3b3f7a; font-size: 15px; line-height: 1.55; }
.count { margin: 10px 0 0; font-size: 13px; color: var(--muted); }
.list { list-style: none; margin: 14px 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 8px; }
.list li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 10px 16px; border: 1px solid #fff; border-radius: 16px; background: var(--surface); box-shadow: var(--shadow); }
.n { flex: none; min-width: 26px; font-size: 12px; color: var(--muted); }
.w { padding: 4px 14px; border-radius: 999px; background: var(--pink); color: var(--accent); font-weight: 700; font-size: 18px; }
.w:hover { background: var(--soft); }
.pron { color: var(--muted); font-size: 13px; }
.ru { flex: 1 1 140px; min-width: 0; color: #43308c; font-size: 15px; font-weight: 600; }
.pos { font-size: 11.5px; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.chips a { padding: 7px 16px; border-radius: 999px; background: var(--soft); color: var(--accent2); font-size: 13.5px; font-weight: 600; }
.chips a:hover { background: var(--pink); }
.more { margin-bottom: 20px; }
.src { margin: 0 0 14px; padding: 8px 16px; width: fit-content; max-width: 100%; border-radius: 14px; background: rgba(255, 255, 255, .72); font-size: 12px; line-height: 1.5; color: var(--muted); }
.src { margin: 0 0 14px; padding: 8px 16px; width: fit-content; max-width: 100%; border-radius: 14px; background: rgba(255, 255, 255, .72); font-size: 12px; line-height: 1.5; color: var(--muted); }
@media (max-width: 600px) { .box { padding: 16px; } }
</style>

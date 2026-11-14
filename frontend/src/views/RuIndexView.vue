<script setup lang="ts">
import { RouterLink } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import { BRAND, canonicalOf } from '@/data/seo'

/** Указатель русско-корейского словаря: самые частые русские слова ссылками на страницы «X по-корейски». */
const config = useRuntimeConfig()
const { data } = await useFetch<{ total: number; words: string[] }>('/api/dict/ru-index', { baseURL: import.meta.server ? config.apiBase : undefined, timeout: 15_000, key: 'ru-index' })
const title = `Русско-корейский словарь: как сказать по-корейски · ${BRAND}`
const description = 'Русско-корейский словарь: самые частые русские слова с корейским переводом, чтением и примерами. Школа, дом, семья, рынок и другие слова для начала.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, twitterTitle: title, twitterDescription: description, robots: 'index, follow, max-image-preview:large, max-snippet:-1' })
useHead({ link: [{ rel: 'canonical', href: canonicalOf('/ru') }] })
</script>

<template>
  <DictShell>
    <nav class="icrumbs" aria-label="Хлебные крошки"><RouterLink to="/">Главная</RouterLink><span>›</span><RouterLink to="/dict">Словарь</RouterLink><span>›</span><b>Русско-корейский</b></nav>
    <section class="ibox">
      <h1>Русско-корейский словарь</h1>
      <p>Выбери русское слово, и увидишь, как оно звучит по-корейски, с чтением, уровнем и примерами. Здесь самые частые слова для начала: дом, школа, семья, рынок. Нужного слова нет? Попробуй <RouterLink to="/dict">поиск по большому словарю</RouterLink>.</p>
      <ul v-if="data?.words.length" class="iw">
        <li v-for="w in data.words" :key="w"><RouterLink :to="`/ru/${encodeURIComponent(w)}`">{{ w }}</RouterLink></li>
      </ul>
    </section>
  </DictShell>
</template>

<style scoped>
.icrumbs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: fit-content; max-width: 100%; margin: 14px 0 12px; padding: 6px 16px; border-radius: 999px; background: rgba(255, 255, 255, .7); font-size: 12.5px; color: var(--muted); }
.icrumbs b { color: var(--ink); font-weight: 600; }
.ibox { padding: 22px 26px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); }
.ibox h1 { margin: 0 0 10px; font-size: clamp(30px, 5vw, 44px); }
.ibox p { margin: 0 0 16px; color: var(--muted); line-height: 1.6; }
.ibox p a { color: var(--accent); }
.iw { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
.iw a { display: block; padding: 6px 14px; border-radius: 999px; background: var(--pink); color: var(--accent); font-weight: 600; font-size: 14px; text-decoration: none; }
.iw a:hover { background: var(--accent); color: #fff; }
</style>

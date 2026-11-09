<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import { BRAND, SITE } from '@/data/seo'

interface AlphabetList { initial: string; items: { id: string; word: string; hom: number; pos: string; level: string; ru: string }[]; total: number; offset: number; limit: number }
const route = useRoute()
const config = useRuntimeConfig()
const initial = computed(() => String(route.params.initial ?? ''))
const page = computed(() => Math.max(1, Number(route.params.page) || 1))
const { data, error } = await useFetch<AlphabetList>(() => `/api/dict/alphabet/${encodeURIComponent(initial.value)}?offset=${(page.value - 1) * 100}`, {
  baseURL: import.meta.server ? config.apiBase : undefined,
  timeout: 20_000,
  key: `dict-alphabet-${initial.value}-${page.value}`,
  watch: [initial, page],
})
const consonants = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const isLetter = computed(() => consonants.includes(initial.value))
const pages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / 100)))
const pageHref = (n: number) => `/dict/a/${encodeURIComponent(initial.value)}${n === 1 ? '' : `/${n}`}`
const visiblePages = computed(() => Array.from({ length: pages.value }, (_, i) => i + 1).filter(n => n === 1 || n === pages.value || Math.abs(n - page.value) <= 2))
const title = computed(() => `${isLetter.value ? `Корейские слова на ${initial.value}` : `Корейские слова со слога ${initial.value}`} · ${BRAND}`)
const description = computed(() => `Список корейских слов${isLetter.value ? ` на букву ${initial.value}` : ` с начальным слогом ${initial.value}`} с переводом на русский из 한국어기초사전.`)
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, twitterTitle: title, twitterDescription: description, robots: 'index, follow, max-image-preview:large' })
useHead({ link: [{ rel: 'canonical', href: `${SITE}${pageHref(page.value)}` }] })
if (import.meta.server && !data.value && error.value?.statusCode === 404) setResponseStatus(useRequestEvent()!, 404)
</script>

<template>
  <DictShell>
    <nav class="crumbs" aria-label="Хлебные крошки"><RouterLink to="/">Главная</RouterLink><span>›</span><RouterLink to="/dict">Словарь</RouterLink><span>›</span><RouterLink to="/dict/a">Алфавит</RouterLink><span>›</span><b lang="ko">{{ initial }}</b></nav>
    <section class="box">
      <h1>{{ isLetter ? `Слова на ${initial}` : `Слова со слога ${initial}` }}</h1>
      <p v-if="data">{{ data.total.toLocaleString('ru-RU') }} слов · часть {{ page }} из {{ pages }}</p>
      <p v-else-if="error?.statusCode === 404">Такого раздела нет. Открой <RouterLink to="/dict/a">алфавитный указатель</RouterLink>.</p>
      <p v-else>Не получилось загрузить список. Попробуй обновить страницу.</p>
    </section>
    <ol v-if="data" class="list" :start="(page - 1) * 100 + 1">
      <li v-for="word in data.items" :key="word.id"><RouterLink :to="`/dict/${encodeURIComponent(word.word)}`" class="w" lang="ko">{{ word.word }}</RouterLink><span class="ru">{{ word.ru }}</span><span class="pos">{{ word.pos }}</span></li>
    </ol>
    <nav v-if="pages > 1" class="pagination" aria-label="Страницы списка">
      <RouterLink v-if="page > 1" :to="pageHref(page - 1)" rel="prev">← Раньше</RouterLink>
      <template v-for="(n, i) in visiblePages" :key="n"><span v-if="i && n - visiblePages[i - 1]! > 1">…</span><RouterLink :to="pageHref(n)" :aria-current="page === n ? 'page' : undefined">{{ n }}</RouterLink></template>
      <RouterLink v-if="page < pages" :to="pageHref(page + 1)" rel="next">Дальше →</RouterLink>
    </nav>
  </DictShell>
</template>

<style scoped>
.crumbs { display:flex; flex-wrap:wrap; gap:8px; align-items:center; width:fit-content; max-width:100%; margin:14px 0 12px; padding:6px 16px; border-radius:18px; background:rgba(255,255,255,.7); font-size:12.5px; color:var(--muted); }
.box { padding:20px 26px; border:1px solid #fff; border-radius:24px; background:var(--surface); box-shadow:var(--shadow); }
.box h1 { margin:0; font-size:clamp(26px,4.5vw,38px); line-height:1.2; }
.box p { margin:10px 0 0; color:#3b3f7a; line-height:1.5; }
.list { list-style:none; margin:14px 0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr)); gap:8px; }
.list li { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; padding:10px 16px; border:1px solid #fff; border-radius:16px; background:var(--surface); box-shadow:var(--shadow); }
.w { padding:4px 14px; border-radius:999px; background:var(--pink); color:var(--accent); font-weight:700; font-size:18px; }
.ru { flex:1 1 140px; min-width:0; color:#43308c; font-size:15px; font-weight:600; }
.pos { font-size:11.5px; color:var(--muted); }
.pagination { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px; margin:16px 0; }
.pagination a { padding:7px 12px; border-radius:999px; background:var(--surface); color:#43308c; font-weight:600; }
.pagination a[aria-current="page"] { background:var(--pink); }
@media(max-width:600px){.box{padding:16px}}
</style>

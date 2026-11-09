<script setup lang="ts">
import DictShell from '@/components/dict/DictShell.vue'
import { BRAND, SITE } from '@/data/seo'

interface AlphabetIndex { letters: { value: string; count: number; syllables: { value: string; count: number }[] }[] }
const config = useRuntimeConfig()
const { data } = await useFetch<AlphabetIndex>('/api/dict/alphabet-index', {
  baseURL: import.meta.server ? config.apiBase : undefined,
  timeout: 20_000,
  key: 'dict-alphabet-index',
})
const title = `Алфавитный указатель корейских слов · ${BRAND}`
const description = 'Корейские слова по первой букве и начальному слогу. Выбери сочетание хангыля, чтобы открыть список слов с переводом на русский.'
useSeoMeta({ title, description, ogTitle: title, ogDescription: description, twitterTitle: title, twitterDescription: description, robots: 'index, follow, max-image-preview:large' })
useHead({ link: [{ rel: 'canonical', href: `${SITE}/dict/a` }] })
const href = (value: string) => `/dict/a/${encodeURIComponent(value)}`
</script>

<template>
  <DictShell>
    <nav class="crumbs" aria-label="Хлебные крошки"><RouterLink to="/">Главная</RouterLink><span>›</span><RouterLink to="/dict">Словарь</RouterLink><span>›</span><b>Алфавитный указатель</b></nav>
    <section class="box"><h1>Корейские слова по алфавиту</h1><p>Выбери первую букву или слог. На странице — слова с переводом и переходами к следующей части списка.</p></section>
    <section v-for="letter in data?.letters ?? []" :key="letter.value" class="group">
      <h2><RouterLink :to="href(letter.value)" lang="ko">{{ letter.value }}</RouterLink><span>{{ letter.count }} слов</span></h2>
      <div class="syllables"><RouterLink v-for="syllable in letter.syllables" :key="syllable.value" :to="href(syllable.value)" lang="ko">{{ syllable.value }} <small>{{ syllable.count }}</small></RouterLink></div>
    </section>
  </DictShell>
</template>

<style scoped>
.crumbs { display:flex; flex-wrap:wrap; gap:8px; align-items:center; width:fit-content; max-width:100%; margin:14px 0 12px; padding:6px 16px; border-radius:18px; background:rgba(255,255,255,.7); font-size:12.5px; color:var(--muted); }
.box,.group { padding:20px 26px; border:1px solid #fff; border-radius:24px; background:var(--surface); box-shadow:var(--shadow); }
.box h1 { margin:0; font-size:clamp(26px,4.5vw,38px); line-height:1.2; }
.box p { margin:10px 0 0; color:#3b3f7a; line-height:1.5; }
.group { margin-top:12px; }
.group h2 { display:flex; align-items:baseline; gap:12px; margin:0 0 12px; font-size:21px; }
.group h2 span,.syllables small { color:var(--muted); font-size:12px; font-weight:500; }
.syllables { display:flex; flex-wrap:wrap; gap:7px; }
.syllables a { padding:6px 12px; border-radius:999px; background:var(--soft); color:var(--accent2); font-weight:600; }
@media(max-width:600px){.box,.group{padding:16px}}
</style>

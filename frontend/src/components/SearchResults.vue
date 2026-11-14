<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import type { useSiteSearch } from '@/composables/useSiteSearch'
import { hl } from '@/data/korean/render'
import { snippet } from '@/data/korean/search'
import { refTabs } from '@/data/korean/sections'

/**
 * Результаты поиска по платформе, общие для окна ⌘K и главной раздела.
 * `inline`: найденное раскрывается на месте (окно). `link`: слова, справочник, формы и буквы ведут на свои страницы (главная).
 * Логика поиска (запрос, «ещё», подсветка) живёт в `useSiteSearch`, пустой результат рисует сам экран.
 */
const props = defineProps<{ search: ReturnType<typeof useSiteSearch>; q: string; mode: 'inline' | 'link' }>()
const { result, qs, more, take, rest, chunkTabs } = props.search
const { open: openGrammar } = useGrammarModal()
const h = (t: string) => hl(t, qs.value)
const link = props.mode === 'link'

/** Что раскрыто на месте: ключ вида «w:12», «s:предложение», «c:вкладка:номер». */
const opened = ref<string | null>(null)
const toggle = (k: string) => (opened.value = opened.value === k ? null : k)
watch(() => props.q, () => (opened.value = null))
const tabName = (id: string) => refTabs.find(t => t.id === id)?.menu ?? id
const key = (t: string, i: string | number) => `${t}:${i}`
</script>

<template>
  <div v-if="result" class="sr">
    <section v-if="result.words.length" class="sr-g">
      <h3>Слова <small>{{ result.words.length }}</small></h3>
      <template v-for="w in take('w', result.words)" :key="w.n">
        <RouterLink v-if="link" class="sr-r" :to="{ path: '/korean/words', query: { q: w.k } }">
          <span class="k" v-html="h(w.k)"></span>
          <span class="rd" v-html="h(w.r)"></span>
          <span class="tr" v-html="h(w.t)"></span>
        </RouterLink>
        <template v-else>
          <button class="sr-r" :class="{ on: opened === key('w', w.n) }" @click="toggle(key('w', w.n))">
            <span class="k" v-html="h(w.k)"></span>
            <span class="rd" v-html="h(w.r)"></span>
            <span class="tr" v-html="h(w.t)"></span>
          </button>
          <div v-if="opened === key('w', w.n) && w.s" class="sr-open"><SentenceBreakdown :sentence="w.s" /></div>
        </template>
      </template>
      <button v-if="rest('w', result.words.length)" class="chip" @click="more.w = true">ещё {{ rest('w', result.words.length) }}</button>
    </section>

    <section v-if="result.grammar.length" class="sr-g">
      <h3>Грамматика <small>{{ result.grammar.length }}</small></h3>
      <button v-for="e in take('g', result.grammar)" :key="e.g.id" class="sr-r col" @click="openGrammar(e.g.id)">
        <span><b class="k" v-html="h(e.g.ko)"></b> <span class="tr" v-html="h(e.g.ru)"></span></span>
        <span class="rd" v-html="h(snippet(e.text, q))"></span>
      </button>
      <button v-if="rest('g', result.grammar.length)" class="chip" @click="more.g = true">ещё {{ rest('g', result.grammar.length) }}</button>
    </section>

    <section v-for="t in chunkTabs" :key="t.id" class="sr-g">
      <h3>{{ tabName(t.id) }} <small>{{ result.chunks[t.id]!.length }}</small></h3>
      <template v-for="(c, i) in take(t.id, result.chunks[t.id]!)" :key="i">
        <RouterLink v-if="link" class="sr-r col" :to="{ path: `/korean/ref/${t.id}`, query: { q } }">
          <span v-if="c.group" class="rd grp">{{ c.group }}</span>
          <span v-html="h(snippet(c.text, q))"></span>
        </RouterLink>
        <button v-else class="sr-r col" :class="{ on: opened === key(t.id, i) }" @click="toggle(key(t.id, i))">
          <span v-if="c.group" class="rd grp">{{ c.group }}</span>
          <span v-html="h(opened === key(t.id, i) ? c.text : snippet(c.text, q))"></span>
        </button>
      </template>
      <button v-if="rest(t.id, result.chunks[t.id]!.length)" class="chip" @click="more[t.id] = true">ещё {{ rest(t.id, result.chunks[t.id]!.length) }}</button>
    </section>

    <section v-if="result.sentences.length" class="sr-g">
      <h3>Примеры предложений <small>{{ result.sentences.length }}</small></h3>
      <template v-for="e in take('s', result.sentences)" :key="e.s">
        <button class="sr-r col" :class="{ on: opened === key('s', e.s) }" @click="toggle(key('s', e.s))">
          <span class="k ko" v-html="h(e.s)"></span>
          <span class="rd" v-html="h(e.tr)"></span>
        </button>
        <div v-if="opened === key('s', e.s)" class="sr-open"><SentenceBreakdown :sentence="e.s" /></div>
      </template>
      <button v-if="rest('s', result.sentences.length)" class="chip" @click="more.s = true">ещё {{ rest('s', result.sentences.length) }}</button>
    </section>

    <section v-if="result.forms.length" class="sr-g">
      <h3>Формы слов <small>{{ result.forms.length }}</small></h3>
      <template v-for="c in take('f', result.forms)" :key="c.k">
        <RouterLink v-if="link" class="sr-r" :to="{ path: '/korean/forms', query: { q: c.k } }">
          <span class="k ko" v-html="h(c.k)"></span>
          <span class="rd" v-html="h(c.r)"></span>
          <span class="tr">{{ c.present }} · {{ c.past }} · {{ c.neg }}</span>
        </RouterLink>
        <div v-else class="sr-r static">
          <span class="k ko" v-html="h(c.k)"></span>
          <span class="rd" v-html="h(c.r)"></span>
          <span class="tr">{{ c.present }} · {{ c.past }} · {{ c.neg }}</span>
        </div>
      </template>
      <button v-if="rest('f', result.forms.length)" class="chip" @click="more.f = true">ещё {{ rest('f', result.forms.length) }}</button>
    </section>

    <section v-if="result.letters.length" class="sr-g">
      <h3>Буквы <small>{{ result.letters.length }}</small></h3>
      <template v-for="l in take('l', result.letters)" :key="l.char">
        <RouterLink v-if="link" class="sr-r" to="/korean/ref/alphabet">
          <span class="k" v-html="h(l.char)"></span>
          <span class="rd" v-html="h(l.text.slice(l.char.length).trim())"></span>
        </RouterLink>
        <div v-else class="sr-r static">
          <span class="k" v-html="h(l.char)"></span>
          <span class="rd" v-html="h(l.text.slice(l.char.length).trim())"></span>
        </div>
      </template>
      <button v-if="rest('l', result.letters.length)" class="chip" @click="more.l = true">ещё {{ rest('l', result.letters.length) }}</button>
    </section>
  </div>
</template>

<style>
.sr-g { display: flex; flex-direction: column; align-items: flex-start; margin-top: 18px; }
.sr-g h3 { margin: 0 0 6px; font-size: 16px; width: 100%; }
.sr-g h3 small { font-weight: 500; font-size: 12px; color: var(--muted, #8b8fc4); margin-left: 6px; }
.sr-r { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(0, 1fr) minmax(0, 2fr); gap: 4px 16px; width: 100%; align-items: baseline; padding: 10px 12px;
  border: 0; border-radius: 12px; background: transparent; text-align: left; color: inherit; font: inherit; text-decoration: none; cursor: pointer; transition: background .15s; }
.sr-r:hover, .sr-r.on { background: rgba(143, 124, 240, .12); }
.sr-r.static { cursor: default; }
.sr-r.static:hover { background: transparent; }
.sr-r.col { display: flex; flex-direction: column; }
.sr-r .k { font-family: var(--ko); font-size: 19px; font-weight: 700; }
.sr-r .k.ko { font-size: 16px; }
.sr-r .rd { color: var(--muted, #6c70a8); font-size: 14px; }
.sr-r .rd.grp { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.sr-r .tr { font-size: 15px; }
.sr-open { width: 100%; padding: 4px 6px 10px; }
.sr-g > .chip { margin-top: 8px; cursor: pointer; }
@media (max-width: 700px) { .sr-r:not(.col) { grid-template-columns: 1fr; } }
</style>

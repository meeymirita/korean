<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { closeSearch, searchOpen, searchQuery as q, toggleSearch } from '@/composables/useSearchWindow'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { hl } from '@/data/korean/render'
import { search, snippet } from '@/data/korean/search'
import { refTabs } from '@/data/korean/sections'
import { parseQuery } from '@/data/korean/words'

const { open: openGrammar } = useGrammarModal()
const input = ref<HTMLInputElement>()
const result = computed(() => search(q.value))
const qs = computed(() => parseQuery(q.value))
const h = (t: string) => hl(t, qs.value)

const LIMIT = 6
const more = reactive<Record<string, boolean>>({})
const take = <T,>(key: string, list: T[]) => (more[key] ? list : list.slice(0, LIMIT))
const rest = (key: string, n: number) => (!more[key] && n > LIMIT ? n - LIMIT : 0)
/** Что раскрыто прямо в окне: ключ вида «w:12», «s:предложение», «c:вкладка:номер». Никуда не переходим. */
const opened = ref<string | null>(null)
const toggle = (k: string) => (opened.value = opened.value === k ? null : k)

const tabName = (id: string) => refTabs.find(t => t.id === id)?.menu ?? id
const chunkTabs = computed(() => refTabs.filter(t => result.value?.chunks[t.id]?.length))

watch(searchOpen, async o => {
  document.body.style.overflow = o ? 'hidden' : ''
  if (o) {
    await nextTick()
    input.value?.focus()
    input.value?.select()
  } else opened.value = null
})
watch(q, () => ((opened.value = null), Object.keys(more).forEach(k => delete more[k])))

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    toggleSearch()
  } else if (e.key === 'Escape' && searchOpen.value) closeSearch()
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sw">
      <div v-if="searchOpen" class="study sky study-modal sw" @click.self="closeSearch()">
        <section class="sw-box" role="dialog" aria-modal="true" aria-label="Поиск по платформе">
          <header class="sw-head">
            <h2>Поиск по платформе</h2>
            <button class="sw-x" aria-label="Закрыть" @click="closeSearch()">✕</button>
          </header>
          <div class="sb">
            <input ref="input" v-model="q" type="text" autocomplete="off" placeholder="Слово, правило, фраза, буква, пример…" />
            <button title="Очистить" @click="((q = ''), input?.focus())">✕</button>
          </div>
          <p class="sw-meta">
            <span v-if="result">Найдено: {{ result.total }}</span>
            <span v-else>ищет в словаре, грамматике, справочнике, примерах и буквах · Ctrl/⌘ + K — открыть и закрыть</span>
          </p>

          <div v-if="result" class="sw-res">
            <div v-if="!result.total" class="empty">Ничего не нашлось. Попробуй другое слово или русскую форму («ем» → «есть»).</div>

            <section v-if="result.words.length" class="sw-g">
              <h3>Слова <small>{{ result.words.length }}</small></h3>
              <template v-for="w in take('w', result.words)" :key="w.n">
                <button class="sw-r" :class="{ on: opened === 'w:' + w.n }" @click="toggle('w:' + w.n)">
                  <span class="k" v-html="h(w.k)"></span>
                  <span class="rd" v-html="h(w.r)"></span>
                  <span class="tr" v-html="h(w.t)"></span>
                </button>
                <div v-if="opened === 'w:' + w.n && w.s" class="sw-open"><SentenceBreakdown :sentence="w.s" /></div>
              </template>
              <button v-if="rest('w', result.words.length)" class="chip" @click="more.w = true">ещё {{ rest('w', result.words.length) }}</button>
            </section>

            <section v-if="result.grammar.length" class="sw-g">
              <h3>Грамматика <small>{{ result.grammar.length }}</small></h3>
              <button v-for="e in take('g', result.grammar)" :key="e.g.id" class="sw-r col" @click="openGrammar(e.g.id)">
                <span><b class="k" v-html="h(e.g.ko)"></b> <span class="tr" v-html="h(e.g.ru)"></span></span>
                <span class="rd" v-html="h(snippet(e.text, q))"></span>
              </button>
              <button v-if="rest('g', result.grammar.length)" class="chip" @click="more.g = true">ещё {{ rest('g', result.grammar.length) }}</button>
            </section>

            <section v-for="t in chunkTabs" :key="t.id" class="sw-g">
              <h3>{{ tabName(t.id) }} <small>{{ result.chunks[t.id]!.length }}</small></h3>
              <template v-for="(c, i) in take(t.id, result.chunks[t.id]!)" :key="i">
                <button class="sw-r col" :class="{ on: opened === `c:${t.id}:${i}` }" @click="toggle(`c:${t.id}:${i}`)">
                  <span v-if="c.group" class="rd grp">{{ c.group }}</span>
                  <span v-html="h(opened === `c:${t.id}:${i}` ? c.text : snippet(c.text, q))"></span>
                </button>
              </template>
              <button v-if="rest(t.id, result.chunks[t.id]!.length)" class="chip" @click="more[t.id] = true">ещё {{ rest(t.id, result.chunks[t.id]!.length) }}</button>
            </section>

            <section v-if="result.sentences.length" class="sw-g">
              <h3>Примеры предложений <small>{{ result.sentences.length }}</small></h3>
              <template v-for="e in take('s', result.sentences)" :key="e.s">
                <button class="sw-r col" :class="{ on: opened === 's:' + e.s }" @click="toggle('s:' + e.s)">
                  <span class="k ko" v-html="h(e.s)"></span>
                  <span class="rd" v-html="h(e.tr)"></span>
                </button>
                <div v-if="opened === 's:' + e.s" class="sw-open"><SentenceBreakdown :sentence="e.s" /></div>
              </template>
              <button v-if="rest('s', result.sentences.length)" class="chip" @click="more.s = true">ещё {{ rest('s', result.sentences.length) }}</button>
            </section>

            <section v-if="result.letters.length" class="sw-g">
              <h3>Буквы <small>{{ result.letters.length }}</small></h3>
              <div v-for="l in take('l', result.letters)" :key="l.char" class="sw-r static">
                <span class="k" v-html="h(l.char)"></span>
                <span class="rd" v-html="h(l.text.slice(l.char.length).trim())"></span>
              </div>
              <button v-if="rest('l', result.letters.length)" class="chip" @click="more.l = true">ещё {{ rest('l', result.letters.length) }}</button>
            </section>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* z-index ниже окна грамматики (50): правило из результатов открывается поверх поиска */
.sw.study-modal { z-index: 45; align-items: flex-start; padding-top: 7vh; overflow-y: auto; }
.sw-box { width: min(860px, 100%); max-height: 86vh; overflow-y: auto; padding: 22px 26px 26px; background: #f6f1ff; border: 1px solid #fff; border-radius: 26px;
  box-shadow: 0 40px 80px -30px rgba(32, 38, 92, .5); }
.sw-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.sw-head h2 { margin: 0; font-size: 22px; }
.sw-x { width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: #fff; color: #20265c; cursor: pointer; }
.sw-x:hover { color: #d64da9; }
.sw .sb { margin: 0; }
.sw-meta { margin: 10px 4px 0; font-size: 12.5px; color: #6c70a8; }
.sw-res { margin-top: 8px; }
.sw-g { display: flex; flex-direction: column; align-items: flex-start; margin-top: 18px; }
.sw-g h3 { margin: 0 0 6px; font-size: 16px; width: 100%; }
.sw-g h3 small { font-weight: 500; font-size: 12px; color: #8b8fc4; margin-left: 6px; }
.sw-r { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(0, 1fr) minmax(0, 2fr); gap: 4px 16px; width: 100%; align-items: baseline; padding: 10px 12px;
  border: 0; border-radius: 12px; background: transparent; text-align: left; color: inherit; font: inherit; cursor: pointer; transition: background .15s; }
.sw-r:hover, .sw-r.on { background: rgba(143, 124, 240, .12); }
.sw-r.static { cursor: default; }
.sw-r.static:hover { background: transparent; }
.sw-r.col { display: flex; flex-direction: column; }
.sw-r .k { font-family: var(--ko); font-size: 19px; font-weight: 700; }
.sw-r .k.ko { font-size: 16px; }
.sw-r .rd { color: #6c70a8; font-size: 14px; }
.sw-r .rd.grp { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.sw-r .tr { font-size: 15px; }
.sw-open { width: 100%; padding: 4px 6px 10px; }
.sw-g > .chip { margin-top: 8px; cursor: pointer; }
.sw .empty { padding: 28px 8px; color: #6c70a8; }
.sw-enter-active, .sw-leave-active { transition: opacity .18s; }
.sw-enter-from, .sw-leave-to { opacity: 0; }
@media (max-width: 700px) { .sw.study-modal { padding: 10px; } .sw-box { padding: 16px; max-height: 94vh; } .sw-r:not(.col) { grid-template-columns: 1fr; } }
</style>

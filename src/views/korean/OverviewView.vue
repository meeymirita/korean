<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DashboardHome from '@/components/korean/DashboardHome.vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { hl } from '@/data/korean/render'
import { search, snippet } from '@/data/korean/search'
import { refTabs } from '@/data/korean/sections'
import { parseQuery } from '@/data/korean/words'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { useProgressStore } from '@/stores/progress'
import { lastVisited } from '@/composables/useLastVisited'

const progress = useProgressStore()
const { open } = useGrammarModal()

const q = ref(String(useRoute().query.q ?? ''))
const input = ref<HTMLInputElement>()
const result = computed(() => search(q.value))
const qs = computed(() => parseQuery(q.value))
const h = (t: string) => hl(t, qs.value)

const LIMIT = 6
const more = reactive<Record<string, boolean>>({})
const take = <T,>(key: string, list: T[]) => (more[key] ? list : list.slice(0, LIMIT))
const rest = (key: string, n: number) => (!more[key] && n > LIMIT ? n - LIMIT : 0)
const openSentence = ref('')

const chunkTabs = computed(() => refTabs.filter(t => result.value?.chunks[t.id]?.length))

function onKey(e: KeyboardEvent) {
  if (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT') {
    e.preventDefault()
    input.value?.focus()
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  input.value?.focus()
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="wrap ov">
    <header class="greet">
      <div>
        <h1>Привет! 안녕 👋</h1>
        <p>{{ progress.unlocked && progress.data.profile.name ? progress.data.profile.name + ', сегодня' : 'Сегодня' }} ты ближе к своей цели, чем вчера.</p>
      </div>
      <div class="greet-r">
        <RouterLink v-if="lastVisited" :to="lastVisited.path" class="chip">↩ {{ lastVisited.title }}</RouterLink>
        <span v-if="progress.unlocked" class="streak">🔥 <b>{{ progress.streak }}</b> дн. подряд</span>
      </div>
    </header>

    <div class="ov-search">
      <div class="sb">
        <input ref="input" data-page-search v-model="q" type="text" autocomplete="off" placeholder="Слово, правило, фраза, буква… по всему сайту" />
        <button title="Очистить" aria-label="Очистить" @click="((q = ''), input?.focus())">✕</button>
      </div>
      <div class="meta">
        <span v-if="result">Найдено: {{ result.total }}</span>
        <span v-else>ищет в словаре, грамматике, справочнике, примерах и буквах</span>
        <span><b>/</b> — фокус на поиск</span>
      </div>
    </div>

    <template v-if="result">
      <div v-if="!result.total" class="empty">
        <div class="big">✿</div>
        Ничего не нашлось. Попробуй другое слово или русскую форму («ем» → «есть»).
      </div>

      <section v-if="result.words.length" class="ov-g">
        <h2 class="today-h">Слова <small>{{ result.words.length }}</small></h2>
        <RouterLink v-for="w in take('w', result.words)" :key="w.n" class="ov-r" :to="{ path: '/korean/words', query: { q: w.k } }">
          <span class="k" v-html="h(w.k)"></span>
          <span class="rd" v-html="h(w.r)"></span>
          <span class="tr" v-html="h(w.t)"></span>
        </RouterLink>
        <button v-if="rest('w', result.words.length)" class="chip" @click="more.w = true">ещё {{ rest('w', result.words.length) }}</button>
      </section>

      <section v-if="result.grammar.length" class="ov-g">
        <h2 class="today-h">Грамматика <small>{{ result.grammar.length }}</small></h2>
        <button v-for="e in take('g', result.grammar)" :key="e.g.id" class="ov-r col" @click="open(e.g.id)">
          <span><b class="k" v-html="h(e.g.ko)"></b> <span class="tr" v-html="h(e.g.ru)"></span></span>
          <span class="rd" v-html="h(snippet(e.text, q))"></span>
        </button>
        <button v-if="rest('g', result.grammar.length)" class="chip" @click="more.g = true">ещё {{ rest('g', result.grammar.length) }}</button>
      </section>

      <section v-for="t in chunkTabs" :key="t.id" class="ov-g">
        <h2 class="today-h">{{ t.menu }} <small>{{ result.chunks[t.id]!.length }}</small></h2>
        <RouterLink v-for="(c, i) in take(t.id, result.chunks[t.id]!)" :key="i" class="ov-r col" :to="{ path: `/korean/ref/${t.id}`, query: { q } }">
          <span v-if="c.group" class="rd grp">{{ c.group }}</span>
          <span v-html="h(snippet(c.text, q))"></span>
        </RouterLink>
        <button v-if="rest(t.id, result.chunks[t.id]!.length)" class="chip" @click="more[t.id] = true">
          ещё {{ rest(t.id, result.chunks[t.id]!.length) }}
        </button>
      </section>

      <section v-if="result.sentences.length" class="ov-g">
        <h2 class="today-h">Примеры предложений <small>{{ result.sentences.length }}</small></h2>
        <template v-for="e in take('s', result.sentences)" :key="e.s">
          <button class="ov-r col" @click="openSentence = openSentence === e.s ? '' : e.s">
            <span class="k ko" v-html="h(e.s)"></span>
            <span class="rd" v-html="h(e.tr)"></span>
          </button>
          <div v-if="openSentence === e.s" class="row-detail"><SentenceBreakdown :sentence="e.s" /></div>
        </template>
        <button v-if="rest('s', result.sentences.length)" class="chip" @click="more.s = true">ещё {{ rest('s', result.sentences.length) }}</button>
      </section>

      <section v-if="result.letters.length" class="ov-g">
        <h2 class="today-h">Буквы <small>{{ result.letters.length }}</small></h2>
        <RouterLink v-for="l in take('l', result.letters)" :key="l.char" class="ov-r" to="/korean/ref/alphabet">
          <span class="k" v-html="h(l.char)"></span>
          <span class="rd" v-html="h(l.text.slice(l.char.length).trim())"></span>
        </RouterLink>
        <button v-if="rest('l', result.letters.length)" class="chip" @click="more.l = true">ещё {{ rest('l', result.letters.length) }}</button>
      </section>
    </template>

    <DashboardHome v-else />
  </div>
</template>

<style scoped>
.greet { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin: 8px 4px 6px; }
.greet h1 { font-size: 25px; margin: 0 0 6px; }
.greet p { margin: 0; color: var(--muted); font-size: 14px; }
.greet-r { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.streak { font-size: 13px; padding: 8px 12px; border-radius: 16px; background: var(--surface); white-space: nowrap; }
.streak b { font-size: 18px; }
.ov .chip { text-decoration: none; color: inherit; }
</style>

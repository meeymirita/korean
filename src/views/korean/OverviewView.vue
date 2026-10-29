<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { groups } from '@/data/alphabet'
import { CATN, D, SE } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { hl } from '@/data/korean/render'
import { index, search, snippet } from '@/data/korean/search'
import { refTabs } from '@/data/korean/sections'
import { parseQuery } from '@/data/korean/words'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { KNOWN_STREAK, useProgressStore } from '@/stores/progress'
import { lastVisited } from '@/composables/useLastVisited'
import { MAX_LEVEL } from '@/data/levels'

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

const tabName = (id: string) => refTabs.find(t => t.id === id)?.menu ?? id
const chunkTabs = computed(() => refTabs.filter(t => result.value?.chunks[t.id]?.length))

/* статистика сайта */
const ix = index
const phrases = computed(() => ix().chunks.filter(c => c.phrase).length)
const letters = groups.reduce((n, g) => n + g.letters.length, 0)
const grammarDone = G.filter(g => g.st === 'ok').length
const site = computed(() => [
  { k: 'Слов в словаре', v: D.length, to: '/korean/words' },
  { k: 'Правил грамматики', v: G.length, to: '/korean/grammar', s: `${grammarDone} пройдено` },
  { k: 'Примеров предложений', v: SE.length, to: '/korean/ref/sentences' },
  { k: 'Фраз в разговорнике', v: phrases.value, to: '/korean/ref/talk' },
  { k: 'Букв хангыля', v: letters, to: '/korean/ref/alphabet' },
  { k: 'Тем словаря', v: Object.keys(CATN).length, to: '/korean/words' },
])

const known = computed(() => D.filter(d => progress.status(d.k) === 'known').length)
const learning = computed(() => D.filter(d => progress.status(d.k) === 'learning').length)
const answers = computed(() =>
  Object.values(progress.data.sources).reduce((n, x) => ({ ok: n.ok + x.ok, bad: n.bad + x.bad }), { ok: 0, bad: 0 }),
)
const accuracy = computed(() => {
  const t = answers.value.ok + answers.value.bad
  return t ? Math.round((answers.value.ok / t) * 100) : 0
})

const weak = computed(() =>
  D.filter(d => {
    const w = progress.data.words[d.k]
    return w && w.streak < KNOWN_STREAK && w.bad > 0
  })
    .map(d => ({ d, w: progress.data.words[d.k]! }))
    .sort((a, b) => b.w.bad - b.w.ok - (a.w.bad - a.w.ok) || b.w.bad - a.w.bad)
    .slice(0, 8)
    .map(x => x.d),
)

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
    <SectionHead id="home" />

    <div class="ov-search">
      <div class="sb">
        <input ref="input" v-model="q" type="text" autocomplete="off" placeholder="Слово, правило, фраза, буква… по всему сайту" />
        <button title="Очистить" @click="((q = ''), input?.focus())">✕</button>
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

    <template v-else>
      <template v-if="lastVisited || (progress.unlocked && weak.length)">
        <h2 class="today-h">Продолжить</h2>
        <div class="ov-cont">
          <RouterLink v-if="lastVisited" :to="lastVisited.path" class="pg-card ov-card">
            <div class="pg-k">Последний раздел</div>
            <div class="pg-v ov-last">{{ lastVisited.title }}</div>
            <div class="pg-s">вернуться туда, где остановился</div>
          </RouterLink>
          <div v-if="progress.unlocked && weak.length" class="pg-card">
            <div class="pg-k">Слабые слова</div>
            <div class="ov-weak">
              <RouterLink v-for="d in weak" :key="d.n" :to="{ path: '/korean/words', query: { q: d.k } }" class="chip">
                {{ d.k }} <small>{{ d.t }}</small>
              </RouterLink>
            </div>
            <RouterLink :to="{ path: '/korean/cabinet', query: { tab: 'repeat' } }" class="pg-s ov-go">Повторить в кабинете →</RouterLink>
          </div>
        </div>
      </template>

      <h2 class="today-h">Сайт в цифрах</h2>
      <div class="pg-cards">
        <RouterLink v-for="s in site" :key="s.k" :to="s.to" class="pg-card ov-card">
          <div class="pg-k">{{ s.k }}</div>
          <div class="pg-v">{{ s.v }}</div>
          <div v-if="s.s" class="pg-s">{{ s.s }}</div>
        </RouterLink>
      </div>

      <h2 class="today-h">Мой прогресс</h2>
      <div v-if="progress.unlocked" class="pg-cards">
        <div class="pg-card">
          <div class="pg-k">Уровень</div>
          <div class="pg-v">{{ progress.info.level }} <small>из {{ MAX_LEVEL }}</small></div>
          <div class="pg-t">{{ progress.info.title }}</div>
          <div class="pg-bar"><i :style="{ width: progress.info.pct + '%' }"></i></div>
          <div class="pg-s">всего {{ progress.info.xp }} очков</div>
        </div>
        <div class="pg-card">
          <div class="pg-k">Серия дней</div>
          <div class="pg-v">🔥 {{ progress.streak }}</div>
          <div class="pg-s">лучшая серия: {{ progress.bestStreak }}</div>
        </div>
        <div class="pg-card">
          <div class="pg-k">Цель дня</div>
          <div class="pg-v">🎯 {{ Math.min(progress.todayOk, progress.goal) }} <small>из {{ progress.goal }}</small></div>
          <div class="pg-bar goal"><i :style="{ width: Math.min(100, (progress.todayOk / progress.goal) * 100) + '%' }"></i></div>
        </div>
        <div class="pg-card">
          <div class="pg-k">Выученные слова</div>
          <div class="pg-v">🌸 {{ known }} <small>из {{ D.length }}</small></div>
          <div class="pg-bar"><i :style="{ width: (known / D.length) * 100 + '%' }"></i></div>
          <div class="pg-s">{{ learning }} в процессе · выучено после {{ KNOWN_STREAK }} верных подряд</div>
        </div>
        <div class="pg-card">
          <div class="pg-k">Ответов всего</div>
          <div class="pg-v">{{ answers.ok + answers.bad }}</div>
          <div class="pg-s">{{ answers.ok }} верных · {{ accuracy }}%</div>
        </div>
        <RouterLink to="/korean/cabinet" class="pg-card ov-card">
          <div class="pg-k">Подробнее</div>
          <div class="pg-v">→</div>
          <div class="pg-s">календарь, неделя, история, достижения — в кабинете</div>
        </RouterLink>
      </div>
      <RouterLink v-else to="/korean/cabinet" class="pg-card ov-card ov-lock">
        🔒 Личная статистика откроется после входа по токену
      </RouterLink>
    </template>
  </div>
</template>

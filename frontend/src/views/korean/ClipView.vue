<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { CLIP_LOOKUP_MAX, CLIP_MAX, clipText, pickDictHit, type ClipState, type ClipWord } from '@/data/korean/clip'
import { searchDict, type DictHit } from '@/lib/dictApi'
import { useProgressStore, KNOWN_STREAK } from '@/stores/progress'

/**
 * «Вырезка из текста»: вставил корейский текст, слова подсветились по тому, знает ли их владелец.
 * Текст живёт только в этом ref: ни в хранилище, ни в адресе, ни в журнале; наружу уходят лишь отдельные слова
 * запросами к своему серверу (`/api/dict/search`), когда слова нет в словаре платформы.
 */
const progress = useProgressStore()
const text = ref('')

const result = computed(() => clipText(text.value, k => progress.data.words[k]?.streak ?? 0))

type Look = { status: 'busy' | 'found' | 'none' | 'error'; hit?: DictHit }
const looks = ref<Record<string, Look>>({})
const picked = ref<ClipWord | null>(null)

/** Класс подсветки слова: свой словарь по очкам, большой словарь или «не найдено». */
function cls(w: ClipWord): ClipState | 'dict' | 'none' {
  if (w.state !== 'unknown') return w.state
  return looks.value[w.key]?.status === 'found' ? 'dict' : 'none'
}

async function lookup(w: ClipWord, gen: number) {
  if (w.own || looks.value[w.key]) return
  looks.value[w.key] = { status: 'busy' }
  let found: DictHit | null = null
  let failed = false
  for (const q of w.queries) {
    try {
      found = pickDictHit(q, await searchDict(q, '', '', 0))
    } catch {
      failed = true
      break
    }
    if (found) break
  }
  if (gen !== generation) return
  looks.value[w.key] = failed ? { status: 'error' } : found ? { status: 'found', hit: found } : { status: 'none' }
}

let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
let loading = false

/** Проверка слов в большом словаре: по три запроса разом, первые CLIP_LOOKUP_MAX слов, остальные по нажатию. */
async function lookupAll() {
  if (loading) return
  loading = true
  const gen = generation
  try {
    const todo = result.value.words.filter(w => !w.own && !looks.value[w.key]).slice(0, CLIP_LOOKUP_MAX)
    for (let i = 0; i < todo.length && gen === generation; i += 3) {
      await Promise.all(todo.slice(i, i + 3).map(w => lookup(w, gen)))
    }
  } finally {
    loading = false
  }
}

watch(text, () => {
  clearTimeout(timer)
  picked.value = null
  timer = setTimeout(() => {
    void lookupAll()
  }, 600)
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(timer)
})

function pick(w: ClipWord) {
  picked.value = picked.value?.key === w.key ? null : w
  if (picked.value && !picked.value.own) {
    const cur = looks.value[w.key]
    if (!cur || cur.status === 'error') {
      delete looks.value[w.key]
      void lookup(w, generation)
    }
  }
}

function clear() {
  generation++
  clearTimeout(timer)
  loading = false
  text.value = ''
  looks.value = {}
  picked.value = null
}

const dictFound = computed(() => result.value.words.filter(w => looks.value[w.key]?.status === 'found').length)
const pickedLook = computed(() => (picked.value ? looks.value[picked.value.key] : undefined))
const STATE_TEXT: Record<string, string> = {
  learned: 'выучено',
  learning: 'учишь',
  new: 'есть в словаре, очков пока нет',
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="clip" />
    <p class="intro">Вставь корейский текст: слова из твоего словаря подсветятся, нажми на любое слово, чтобы увидеть перевод. Текст нигде не сохраняется.</p>

    <div class="clip-form">
      <textarea v-model="text" rows="6" :maxlength="CLIP_MAX" lang="ko" placeholder="Вставь сюда корейский текст (до 2000 знаков)" aria-label="Корейский текст" />
      <div class="clip-row">
        <small :class="{ low: text.length >= CLIP_MAX }">{{ text.length }} / {{ CLIP_MAX }}</small>
        <button type="button" class="clip-clear" :disabled="!text" @click="clear">Очистить</button>
      </div>
    </div>

    <template v-if="result.total">
      <div class="clip-count" aria-live="polite">
        <b>Известно {{ result.known }} из {{ result.total }} слов</b>
        <span>выучено {{ result.learned }}</span>
        <span v-if="dictFound">ещё {{ dictFound }} в большом словаре</span>
      </div>
      <div class="clip-legend" aria-hidden="true">
        <span class="cw learned">выучено</span>
        <span class="cw learning">в словаре</span>
        <span class="cw dict">только в большом словаре</span>
        <span class="cw none">не найдено</span>
      </div>

      <div class="clip-text" lang="ko">
        <template v-for="(p, i) in result.parts" :key="i">
          <button v-if="p.word" type="button" class="cw" :class="[cls(p.word), { on: picked?.key === p.word.key }]" :aria-pressed="picked?.key === p.word.key" @click="pick(p.word)">{{ p.text }}</button>
          <template v-else>{{ p.text }}</template>
        </template>
      </div>
      <p v-if="result.cut" class="clip-note">Текст длиннее {{ CLIP_MAX }} знаков, лишнее отброшено.</p>

      <div v-if="picked" class="clip-card" role="status">
        <template v-if="picked.own">
          <div class="clip-head">
            <h2 lang="ko">{{ picked.own.k }}</h2>
            <span v-if="picked.own.r" class="clip-read">{{ picked.own.r }}</span>
            <span class="clip-state" :class="picked.state">{{ STATE_TEXT[picked.state] }}</span>
          </div>
          <p class="clip-tr">{{ picked.own.t }}</p>
          <p v-if="picked.core !== picked.own.k" class="clip-form-of">В тексте: <span lang="ko">{{ picked.core }}</span>, словарная форма <span lang="ko">{{ picked.own.k }}</span></p>
          <p v-if="picked.streak && picked.state !== 'learned'" class="clip-points">Очки: {{ picked.streak }} из {{ KNOWN_STREAK }}</p>
          <p v-if="picked.own.s" class="clip-ex" lang="ko">{{ picked.own.s }}</p>
        </template>
        <template v-else-if="pickedLook?.status === 'found' && pickedLook.hit">
          <div class="clip-head">
            <h2 lang="ko">{{ pickedLook.hit.word }}</h2>
            <span v-if="pickedLook.hit.pron" class="clip-read">[{{ pickedLook.hit.pron }}]</span>
            <span class="clip-state dict">только в большом словаре</span>
          </div>
          <p class="clip-tr">{{ pickedLook.hit.ru }}</p>
          <p class="clip-form-of">
            {{ pickedLook.hit.pos }}<template v-if="pickedLook.hit.level && pickedLook.hit.level !== 'нет'">, уровень: {{ pickedLook.hit.level }}</template>
            <template v-if="picked.core !== pickedLook.hit.word"> · в тексте: <span lang="ko">{{ picked.core }}</span></template>
          </p>
          <NuxtLink class="clip-link" :to="`/dict/${encodeURIComponent(pickedLook.hit.word)}`">Открыть в словаре</NuxtLink>
        </template>
        <template v-else>
          <div class="clip-head">
            <h2 lang="ko">{{ picked.core }}</h2>
            <span class="clip-state none">{{ !pickedLook || pickedLook.status === 'busy' ? 'ищу в словаре…' : pickedLook.status === 'error' ? 'словарь недоступен' : 'не найдено' }}</span>
          </div>
          <p v-if="pickedLook?.status === 'none'" class="clip-tr">Слова нет ни в твоём словаре, ни в большом. Возможно, это имя или редкая форма.</p>
          <p v-else-if="pickedLook?.status === 'error'" class="clip-tr">Не удалось спросить сервер, нажми на слово ещё раз.</p>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.intro { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.clip-form { margin-top: 16px; }
.clip-form textarea { width: 100%; box-sizing: border-box; resize: vertical; border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; font: inherit; font-size: 16px; line-height: 1.6; color: var(--ink); background: var(--surface); }
.clip-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
.clip-row small { color: var(--muted); }
.clip-row small.low { color: var(--bad); }
.clip-clear { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 8px 20px; font: inherit; font-size: 14px; cursor: pointer; }
.clip-clear:disabled { opacity: .5; cursor: default; }
.clip-count { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin-top: 18px; font-size: 15px; }
.clip-count span { color: var(--muted); font-size: 13.5px; }
.clip-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; font-size: 12.5px; }
.clip-legend .cw { cursor: default; padding: 2px 10px; }
.clip-text { margin-top: 12px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); font-size: 18px; line-height: 2.1; white-space: pre-wrap; overflow-wrap: anywhere; }
.cw { display: inline; border: 0; border-bottom: 2px solid transparent; border-radius: 8px; background: transparent; color: var(--ink); padding: 1px 3px; font: inherit; cursor: pointer; }
.cw.learned { background: var(--ok-bg); border-bottom-color: var(--ok); }
.cw.learning, .cw.new { background: var(--gold-soft); border-bottom-color: var(--gold); }
.cw.dict { border-bottom: 2px dashed var(--accent); background: rgba(150, 190, 255, .18); }
.cw.none { color: var(--muted); border-bottom-color: var(--line-soft); }
.cw.on { outline: 2px solid var(--accent); outline-offset: 1px; }
.clip-note { margin: 8px 0 0; color: var(--muted); font-size: 13px; }
.clip-card { margin-top: 14px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.clip-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.clip-head h2 { margin: 0; font-size: 22px; }
.clip-read { color: var(--muted); font-size: 14px; }
.clip-state { border-radius: 999px; padding: 2px 10px; font-size: 12.5px; background: var(--gold-soft); }
.clip-state.learned { background: var(--ok-bg); color: var(--ok); }
.clip-state.dict { background: rgba(150, 190, 255, .22); }
.clip-state.none { background: var(--line-soft); color: var(--muted); }
.clip-tr { margin: 8px 0 0; font-size: 16px; line-height: 1.5; }
.clip-form-of, .clip-points { margin: 6px 0 0; color: var(--muted); font-size: 13.5px; }
.clip-ex { margin: 8px 0 0; font-size: 15px; color: var(--muted); }
.clip-link { display: inline-block; margin-top: 10px; color: var(--accent); font-size: 14px; }
@media (max-width: 520px) { .clip-text { padding: 12px; font-size: 17px; } }
</style>

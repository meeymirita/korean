<script setup lang="ts">
import MarkStar from '@/components/korean/MarkStar.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { F, blk } from '@/data/korean/render'
import { useShareCard } from '@/composables/useShareCard'
import { useProgressStore } from '@/stores/progress'
import { CHANNEL, videoOf } from '@/data/korean/course'
import { titleOfVideo } from '@/data/korean/videoTitles'

const { current, close, prev, next } = useGrammarModal()
const { share, busy } = useShareCard()
const progress = useProgressStore()
/** Отметка «урок пройден» ведёт сам владелец (у гостя записи не сохраняются). */
const owner = computed(() => progress.unlocked && !progress.isGuest)
const passed = computed(() => !!current.value && progress.isMarked('d', current.value.id))
/** Видео урока; если файла на сервере нет (или локально), показываем заглушку. */
const broken = ref('')
const video = computed(() => {
  const v = current.value?.video ?? videoOf(current.value?.l)
  return v && v !== broken.value ? v : undefined
})

/** Метки цвета ({o|…}) и теги — в простой текст для карточки. */
const plain = (s: string) => s.replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '')
function shareRule() {
  const g = current.value
  if (!g) return
  const formula = g.b.find(b => b[0] === 'formula')?.[1] as string | undefined
  const ex = g.b.find(b => b[0] === 'ex')?.[1] as [string, string][] | undefined
  const lines = [formula ? plain(formula) : '', ...(ex ?? []).slice(0, 2).map(([k, r]) => `${plain(k)}  ${r}`)].filter(Boolean)
  void share({ kicker: g.l ? `правило · ${g.l}` : 'правило', title: plain(g.ko), sub: plain(g.ru), lines, icon: '📘' }, `правило-${g.id}`)
}

/* ---------- движок между описанием и видео ---------- */
const SPLIT_KEY = 'gram_split'
const SPLIT_DEFAULT = 0.46
/** доля ширины, которую занимает видео справа */
const split = ref(SPLIT_DEFAULT)
try {
  const v = Number(localStorage.getItem(SPLIT_KEY))
  if (v >= 0.2 && v <= 0.75) split.value = v
} catch {
  /* без хранилища остаётся значение по умолчанию */
}
const gm = ref<HTMLElement>()
const dragging = ref(false)
function splitDown(e: PointerEvent) {
  if (e.button !== 0) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
}
function splitMove(e: PointerEvent) {
  if (!dragging.value || !gm.value) return
  const r = gm.value.getBoundingClientRect()
  split.value = Math.min(0.75, Math.max(0.2, (r.right - e.clientX) / r.width))
}
function splitUp() {
  if (!dragging.value) return
  dragging.value = false
  try {
    localStorage.setItem(SPLIT_KEY, String(split.value))
  } catch {
    /* не страшно */
  }
}
function splitReset() {
  split.value = SPLIT_DEFAULT
  splitUp()
}

function onKey(e: KeyboardEvent) {
  if (!current.value) return
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
watch(current, g => (document.body.style.overflow = g ? 'hidden' : ''))
</script>

<template>
  <div v-if="current" class="study sky study-modal" @click.self="close">
    <div class="gp wide" role="dialog" aria-modal="true">
      <div class="gh">
        <div class="tt">
          <h2 v-html="F(current.ko)"></h2>
          <div class="rn">{{ current.ru }}</div>
          <div class="pl">
            <span class="pill">{{ current.s }}</span>
            <span v-if="current.l" class="pill l">{{ current.l }}</span>
            <span class="pill" :class="current.st === 'ok' ? 's' : 'n'">
              {{ current.st === 'ok' ? 'пройдено' : 'ещё рано' }}
            </span>
            <button v-if="owner && current && current.st !== 'ok'" type="button" class="pass" :class="{ on: passed }" :aria-pressed="passed" @click="progress.toggleMark('d', current.id)">
              {{ passed ? `✓ ${current.l || 'Тема'} пройдено` : `Отметить пройденным${current.l ? ': ' + current.l.toLowerCase() : ''}` }}
            </button>
          </div>
        </div>
        <MarkStar kind="g" :id="current.id" />
        <button title="Поделиться карточкой" aria-label="Поделиться карточкой" :disabled="busy" @click="shareRule">🖼</button>
        <button title="Предыдущая" aria-label="Предыдущая" @click="prev">←</button>
        <button title="Следующая" aria-label="Следующая" @click="next">→</button>
        <button title="Закрыть" aria-label="Закрыть" @click="close">✕</button>
      </div>
      <div ref="gm" class="gm" :class="{ dragging }" :style="{ '--vw': split * 100 + '%' }">
        <div :key="current.id" class="gb rich" v-html="current.b.map(blk).join('')"></div>
        <div class="gsplit" role="separator" aria-orientation="vertical" title="Потяни, чтобы изменить ширину. Двойной щелчок возвращает как было" @pointerdown="splitDown" @pointermove="splitMove" @pointerup="splitUp" @pointercancel="splitUp" @dblclick="splitReset"><i></i></div>
        <aside class="gv">
          <video v-if="video" :key="video" class="gvp" :src="video" controls preload="metadata" @error="broken = video!"></video>
          <div v-else class="gvp stub">
            <span class="play" aria-hidden="true">▶</span>
            <b>{{ current.l ? `Видео · ${current.l}` : 'Видео' }}</b>
            <small>{{ broken ? 'Не проигралось в этом браузере: смотри в Яндекс Браузере или Chrome' : 'появится, когда скачаю урок' }}</small>
          </div>
          <p v-if="video && titleOfVideo(video)" class="vt">{{ titleOfVideo(video) }}</p>
          <p v-if="video" class="src">Видео в формате AV1: в Яндекс Браузере, Chrome и Firefox играет, в Safari и на части iPad может не открываться.</p>
          <p class="src">Автор видеоурока: <a :href="CHANNEL" target="_blank" rel="noopener">Учитель Ян · 양쌤의 한국어 교실</a></p>
        </aside>
      </div>
    </div>
  </div>
</template>

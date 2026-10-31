<script setup lang="ts">
import MarkStar from '@/components/korean/MarkStar.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { F, blk } from '@/data/korean/render'
import { useShareCard } from '@/composables/useShareCard'
import { useProgressStore } from '@/stores/progress'
import { CHANNEL, videoOf } from '@/data/korean/course'

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
          </div>
          <button v-if="owner && current" type="button" class="pass" :class="{ on: passed }" :aria-pressed="passed" @click="progress.toggleMark('d', current.id)">
            {{ passed ? `✓ ${current.l || 'Тема'} пройдено` : `Отметить пройденным${current.l ? ': ' + current.l.toLowerCase() : ''}` }}
          </button>
        </div>
        <MarkStar kind="g" :id="current.id" />
        <button title="Поделиться карточкой" aria-label="Поделиться карточкой" :disabled="busy" @click="shareRule">🖼</button>
        <button title="Предыдущая" aria-label="Предыдущая" @click="prev">←</button>
        <button title="Следующая" aria-label="Следующая" @click="next">→</button>
        <button title="Закрыть" aria-label="Закрыть" @click="close">✕</button>
      </div>
      <div class="gm">
        <div :key="current.id" class="gb rich" v-html="current.b.map(blk).join('')"></div>
        <aside class="gv">
          <video v-if="video" :key="video" class="gvp" :src="video" controls preload="metadata" @error="broken = video!"></video>
          <div v-else class="gvp stub">
            <span class="play" aria-hidden="true">▶</span>
            <b>{{ current.l ? `Видео · ${current.l}` : 'Видео' }}</b>
            <small>появится, когда скачаю урок</small>
          </div>
          <p class="src">Видеоуроки: <a :href="CHANNEL" target="_blank" rel="noopener">양쌤의 한국어 교실</a></p>
        </aside>
      </div>
    </div>
  </div>
</template>

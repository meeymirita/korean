<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { D } from '@/data/korean/words'
import { useProgressStore, type LogEntry } from '@/stores/progress'

const progress = useProgressStore()
const PAGE = 20
const shown = ref(PAGE)
const byK = new Map(D.map(d => [d.k, d]))
const SRC: Record<string, string> = { game: 'Игра', trainer: 'Тренажёры', today: 'Сегодня', review: 'Повторение', quick: '5 минут' }
const MODE: Record<string, string> = { typing: 'ввод с клавиатуры', match: 'найди пару', syllables: 'слоги', build: 'собери предложение' }

const rows = computed(() => progress.data.log.slice(0, shown.value))
const open = ref<LogEntry | null>(null)
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (open.value = null)
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

function when(t: number) {
  const d = new Date(t)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === new Date().toDateString()) return `сегодня ${hm}`
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
}
const whenFull = (t: number) => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(t))
const where = (r: LogEntry) => [SRC[r.s] ?? r.s, r.m ? (MODE[r.m] ?? r.m) : ''].filter(Boolean).join(' · ')
/** Короткая подпись строки: слово с переводом или вопрос из подробностей. */
const label = (r: LogEntry) => r.w ?? r.d?.q ?? 'предложение'
</script>

<template>
  <div class="cb-body">
    <div v-if="rows.length" class="hs-list">
      <button v-for="(r, i) in rows" :key="i" type="button" class="hs-row hs-click" :class="r.ok ? 'ok' : 'bad'" @click="open = r">
        <span class="mk">{{ r.ok ? '✓' : '✗' }}</span>
        <span class="when">{{ when(r.t) }}</span>
        <span>
          <template v-if="r.w"><b>{{ r.w }}</b>{{ byK.get(r.w)?.t ?? '' }}</template>
          <template v-else>{{ label(r) }}</template>
        </span>
        <span class="src">{{ SRC[r.s] ?? r.s }}</span>
      </button>
    </div>
    <p v-else class="cb-empty">Здесь будут последние ответы: слово, верно или нет, где и когда. Нажми на строку, чтобы увидеть подробности.</p>
    <div v-if="progress.data.log.length > shown" class="pg-btns">
      <button class="plain" @click="shown += PAGE">Загрузить ещё</button>
    </div>
    <p v-if="progress.data.log.length" class="pg-note">Показано {{ Math.min(shown, progress.data.log.length) }} из {{ progress.data.log.length }}. Хранятся последние 300 ответов.</p>

    <Teleport to="body">
      <div v-if="open" class="study sky study-modal" @click.self="open = null">
        <div class="gp hs-modal" role="dialog" aria-modal="true">
          <div class="gh">
            <div class="tt">
              <h2>{{ open.ok ? 'Верно' : 'Ошибка' }}</h2>
              <div class="rn">{{ whenFull(open.t) }} · {{ where(open) }}</div>
            </div>
            <button title="Закрыть" aria-label="Закрыть" @click="open = null">✕</button>
          </div>
          <div class="gb">
            <dl class="hs-det">
              <template v-if="open.w"><dt>Слово</dt><dd><b class="ko">{{ open.w }}</b> {{ byK.get(open.w)?.t ?? '' }}</dd></template>
              <template v-if="open.d?.q"><dt>Что было</dt><dd>{{ open.d.q }}</dd></template>
              <template v-if="open.d?.a"><dt>Верный ответ</dt><dd>{{ open.d.a }}</dd></template>
              <template v-if="open.d?.y"><dt>Твой ответ</dt><dd class="bad">{{ open.d.y }}</dd></template>
              <dt>Где</dt><dd>{{ where(open) }}</dd>
            </dl>
            <p v-if="!open.d" class="pg-note">Подробности этого ответа не записаны: так сохранялись старые ответы. Новые будут с вопросом и ответом.</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { highlight, listTalks, type Talk } from '@/lib/talks'
import { useProgressStore } from '@/stores/progress'
import { useVoiceStore } from '@/stores/voice'

/** Общая история: чаты с помощником и голосовые разговоры в одном списке с поиском по тексту. */
const progress = useProgressStore()
const voice = useVoiceStore()
const q = ref('')
const talks = ref<Talk[]>([])
const loaded = ref(false)
const error = ref('')
const searched = ref('')

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

async function load() {
  const asked = q.value
  try {
    const r = await listTalks(progress.bearer, asked)
    // ответ на устаревший запрос (успели набрать дальше) не показываем
    if (asked !== q.value) return
    talks.value = r
    searched.value = asked.trim().length >= 2 ? asked.trim() : ''
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loaded.value = true
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(() => void load(), 300)
})
onMounted(() => {
  if (!progress.isGuest) void load()
})

/** Чат открывается на странице помощника, голосовой разговор в окне голоса на вкладке «История». */
async function openTalk(t: Talk) {
  if (t.kind === 'chat') return void navigateTo(`/korean/chat?c=${t.id}`)
  voice.tab = 'history'
  voice.open = true
  await voice.openItem(t.id)
}
</script>

<template>
  <div class="wrap talks">
    <SectionHead id="talks" />
    <p v-if="progress.isGuest" class="cb-empty">История доступна только владельцу сайта.</p>
    <template v-else>
      <div class="tk-search">
        <input v-model="q" type="search" placeholder="Поиск по тексту всех разговоров" aria-label="Поиск по тексту разговоров" autocomplete="off" @keydown.esc="q = ''" />
      </div>
      <p v-if="error" class="tk-err">{{ error }}</p>
      <p v-else-if="loaded && !talks.length" class="cb-empty">{{ searched ? `Ничего не нашлось по «${searched}».` : 'Разговоров пока нет: они появятся после первого вопроса помощнику или голосового разговора.' }}</p>
      <ul v-else class="tk-list">
        <li v-for="t in talks" :key="t.kind + t.id">
          <button type="button" class="tk-item" @click="openTalk(t)">
            <span class="tk-kind" :class="t.kind">{{ t.kind === 'chat' ? 'Чат' : 'Голос' }}</span>
            <b class="tk-title">{{ t.title || 'Без названия' }}</b>
            <small class="tk-meta">{{ when(t.when) }} · сообщений: {{ t.messages }}<template v-if="t.matches && t.matches > 1"> · совпадений: {{ t.matches }}</template></small>
            <span v-if="t.snippet" class="tk-snip"><template v-for="(p, i) in highlight(t.snippet, searched)" :key="i"><mark v-if="p.hit">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.tk-search input { width: 100%; box-sizing: border-box; padding: 11px 16px; font: inherit; font-size: 15px; color: var(--ink); background: #fff; border: 1px solid var(--line); border-radius: 999px; }
.tk-search input:focus { outline: none; border-color: var(--accent); }
.tk-err { color: var(--bad); }
.tk-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.tk-item { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; align-items: baseline; padding: 12px 16px; text-align: left; font: inherit; color: inherit; cursor: pointer; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
.tk-item:hover { border-color: var(--accent); }
.tk-kind { grid-row: 1 / span 2; align-self: start; padding: 2px 10px; font-size: 12px; font-weight: 700; border-radius: 999px; color: var(--accent); background: var(--gold-soft); }
.tk-kind.voice { color: #fff; background: var(--accent); }
.tk-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 600; }
.tk-meta { color: var(--muted); font-size: 12px; }
.tk-snip { grid-column: 2; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.tk-snip mark { color: var(--ink); background: var(--gold-soft); border-radius: 4px; padding: 0 2px; }
html[data-theme='dark'] .tk-search input { background: var(--surface); }
</style>

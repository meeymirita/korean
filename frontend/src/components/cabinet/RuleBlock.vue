<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

interface Status {
  enabled: boolean
  time: string
  topicReady: boolean
  cards: number
  left: number
}

const progress = useProgressStore()
const toast = useToastStore()
const st = ref<Status | null>(null)
const failed = ref(false)
const busy = ref(false)
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })

async function load() {
  const res = await fetchT('/api/rule', { headers: headers() })
  if (!res.ok) throw new Error(String(res.status))
  st.value = (await res.json()) as Status
}

onMounted(async () => {
  try {
    await load()
  } catch {
    failed.value = true
  }
})

async function save(patch: { enabled?: boolean; time?: string }) {
  busy.value = true
  try {
    const res = await fetchT('/api/rule', { method: 'PUT', headers: headers(), body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(res.status === 400 ? 'проверьте время' : `сервер ответил ${res.status}`)
    st.value = (await res.json()) as Status
    toast.ok(st.value.enabled ? `Правило будет приходить в ${st.value.time}` : 'Правило дня выключено')
  } catch (e) {
    toast.error(errText(e))
    try {
      await load()
    } catch {
      /* оставляем как есть */
    }
  } finally {
    busy.value = false
  }
}

async function test() {
  busy.value = true
  try {
    const res = await fetchT('/api/rule/test', { method: 'POST', headers: headers() }, 60_000)
    const r = (await res.json()) as { ok: boolean; message: string }
    if (r.ok) toast.ok('Отправлено, проверьте тему «Правило дня» в Telegram.')
    else toast.error(r.message || 'Не получилось отправить.')
  } catch (e) {
    toast.error('Не получилось: ' + errText(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="st && !failed" class="st-block">
    <h3>Правило дня</h3>
    <p class="st-sub">Каждый день в выбранное время в Telegram приходит одна пройденная карточка из «Мои карточки»: картинка и текст правила. Карточки идут по кругу без повторов. Время по часам сервера.</p>
    <p v-if="!st.topicReady" class="bk-warn">⚠ Тема не подключена: нужен номер темы TELEGRAM_TOPIC_RULE в .env (см. docs/telegram.md).</p>
    <div class="rm-row">
      <label class="rm-on"><input type="checkbox" :checked="st.enabled" :disabled="busy || !st.topicReady" @change="save({ enabled: ($event.target as HTMLInputElement).checked })" /> Присылать</label>
      <label class="rm-time">в <input type="time" :value="st.time" :disabled="busy" aria-label="Время правила дня" @change="save({ time: ($event.target as HTMLInputElement).value })" /></label>
      <button type="button" class="plain" :disabled="busy || !st.topicReady" @click="test">Отправить пробное</button>
    </div>
    <p class="st-sub">Карточек в круге: {{ st.cards }}, ещё не приходило: {{ st.left }}. Если включить после выбранного времени, первое правило придёт завтра.</p>
  </div>
</template>

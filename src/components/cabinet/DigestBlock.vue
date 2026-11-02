<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

interface Status {
  enabled: boolean
  time: string
  words: number
  sentences: number
  mailReady: boolean
  to: string
  maxWords: number
  maxSentences: number
}

const progress = useProgressStore()
const toast = useToastStore()
const st = ref<Status | null>(null)
const failed = ref(false)
const busy = ref(false)
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })

onMounted(async () => {
  try {
    const res = await fetchT('/api/digest', { headers: headers() })
    if (!res.ok) throw new Error(String(res.status))
    st.value = (await res.json()) as Status
  } catch {
    failed.value = true
  }
})

async function save(patch: { enabled?: boolean; time?: string; words?: number; sentences?: number }) {
  busy.value = true
  try {
    const res = await fetchT('/api/digest', { method: 'PUT', headers: headers(), body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(res.status === 400 ? 'проверьте время и числа (в подборке должно быть хоть что-то)' : `сервер ответил ${res.status}`)
    st.value = (await res.json()) as Status
    toast.ok(st.value.enabled ? `Подборка будет приходить в ${st.value.time}` : 'Подборка выключена')
  } catch (e) {
    toast.error(errText(e))
    // вернуть в полях то, что на сервере
    try {
      const res = await fetchT('/api/digest', { headers: headers() })
      if (res.ok) st.value = (await res.json()) as Status
    } catch {
      /* оставляем как есть */
    }
  } finally {
    busy.value = false
  }
}

const num = (e: Event) => Number((e.target as HTMLInputElement).value)

async function test() {
  busy.value = true
  try {
    const res = await fetchT('/api/digest/test', { method: 'POST', headers: headers() }, 60_000)
    const r = (await res.json()) as { ok: boolean; message: string }
    if (r.ok) toast.ok('Письмо отправлено, проверьте ящик.')
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
    <h3>Подборка на повторение</h3>
    <p class="st-sub">Каждый день в выбранное время приходит письмо со случайными словами и предложениями из пройденного, занимались вы в этот день или нет. Время по часам сервера.</p>
    <p v-if="!st.mailReady" class="bk-warn">⚠ Некуда отправлять: настройте почту (SMTP_* в server/.env) и адрес защиты кодом или REMINDER_MAIL_TO.</p>
    <div class="rm-row">
      <label class="rm-on"><input type="checkbox" :checked="st.enabled" :disabled="busy || !st.mailReady" @change="save({ enabled: ($event.target as HTMLInputElement).checked })" /> Присылать</label>
      <label class="rm-time">в <input type="time" :value="st.time" :disabled="busy" aria-label="Время подборки" @change="save({ time: ($event.target as HTMLInputElement).value })" /></label>
    </div>
    <div class="rm-row">
      <label class="rm-time">слов <input class="rm-num" type="number" min="0" :max="st.maxWords" :value="st.words" :disabled="busy" aria-label="Сколько слов" @change="save({ words: num($event) })" /></label>
      <label class="rm-time">предложений <input class="rm-num" type="number" min="0" :max="st.maxSentences" :value="st.sentences" :disabled="busy" aria-label="Сколько предложений" @change="save({ sentences: num($event) })" /></label>
      <button type="button" class="plain" :disabled="busy || !st.mailReady" @click="test">Отправить пробное</button>
    </div>
    <p v-if="st.mailReady" class="st-sub">Письмо придёт на {{ st.to }}. Если включить после выбранного времени, первое письмо придёт завтра.</p>
  </div>
</template>

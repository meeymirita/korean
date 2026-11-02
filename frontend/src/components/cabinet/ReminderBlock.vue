<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

interface Status {
  enabled: boolean
  time: string
  mailReady: boolean
  to: string
}

const progress = useProgressStore()
const toast = useToastStore()
const st = ref<Status | null>(null)
const failed = ref(false)
const busy = ref(false)
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })

onMounted(async () => {
  try {
    const res = await fetchT('/api/reminder', { headers: headers() })
    if (!res.ok) throw new Error(String(res.status))
    st.value = (await res.json()) as Status
  } catch {
    failed.value = true
  }
})

async function save(patch: { enabled?: boolean; time?: string }) {
  busy.value = true
  try {
    const res = await fetchT('/api/reminder', { method: 'PUT', headers: headers(), body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(res.status === 400 ? 'неверное время' : `сервер ответил ${res.status}`)
    st.value = (await res.json()) as Status
    toast.ok(st.value.enabled ? `Напомню в ${st.value.time}, если до этого не позанимаешься` : 'Напоминание выключено')
  } catch (e) {
    toast.error(errText(e))
  } finally {
    busy.value = false
  }
}

async function test() {
  busy.value = true
  try {
    const res = await fetchT('/api/reminder/test', { method: 'POST', headers: headers() }, 60_000)
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
    <h3>Напоминание заниматься</h3>
    <p class="st-sub">В выбранное время приходит письмо, если за день ещё не было ни одного ответа. Время по часам сервера. Если уже позанимался, письма не будет.</p>
    <p v-if="!st.mailReady" class="bk-warn">⚠ Некуда отправлять: настройте почту (SMTP_* в server/.env) и адрес защиты кодом или REMINDER_MAIL_TO.</p>
    <div class="rm-row">
      <label class="rm-on"><input type="checkbox" :checked="st.enabled" :disabled="busy || !st.mailReady" @change="save({ enabled: ($event.target as HTMLInputElement).checked })" /> Напоминать</label>
      <label class="rm-time">в <input type="time" :value="st.time" :disabled="busy" aria-label="Время напоминания" @change="save({ time: ($event.target as HTMLInputElement).value })" /></label>
      <button type="button" class="plain" :disabled="busy || !st.mailReady" @click="test">Отправить пробное</button>
    </div>
    <p v-if="st.mailReady" class="st-sub">Письмо придёт на {{ st.to }}.</p>
  </div>
</template>

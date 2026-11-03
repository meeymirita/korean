<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

interface Status {
  enabled: boolean
  /** 0 — воскресенье … 6 — суббота */
  weekday: number
  time: string
  mailReady: boolean
  to: string
}
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const WD_IN = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу']

const progress = useProgressStore()
const toast = useToastStore()
const st = ref<Status | null>(null)
const failed = ref(false)
const busy = ref(false)
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })

onMounted(async () => {
  try {
    const res = await fetchT('/api/lesson', { headers: headers() })
    if (!res.ok) throw new Error(String(res.status))
    st.value = (await res.json()) as Status
  } catch {
    failed.value = true
  }
})

async function save(patch: { enabled?: boolean; weekday?: number; time?: string }) {
  busy.value = true
  try {
    const res = await fetchT('/api/lesson', { method: 'PUT', headers: headers(), body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(res.status === 400 ? 'неверное значение' : `сервер ответил ${res.status}`)
    st.value = (await res.json()) as Status
    if (patch.enabled !== undefined) toast.ok(st.value.enabled ? `Напомню ${WD_IN[st.value.weekday]} в ${st.value.time}` : 'Напоминание о созвоне выключено')
  } catch (e) {
    toast.error(errText(e))
  } finally {
    busy.value = false
  }
}

async function test() {
  busy.value = true
  try {
    const res = await fetchT('/api/lesson/test', { method: 'POST', headers: headers() }, 60_000)
    const r = (await res.json()) as { ok: boolean; message: string }
    if (r.ok) toast.ok('Письмо отправлено, проверьте ящик.')
    else toast.error(r.message || 'Не получилось отправить.')
  } catch (e) {
    toast.error('Не получилось: ' + errText(e))
  } finally {
    busy.value = false
  }
}

/** Обратный отсчёт до ближайшего созвона: считается в браузере от дня недели и времени, обновляется раз в минуту. */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 60_000)
})
onUnmounted(() => clearInterval(timer))
const countdown = computed(() => {
  if (!st.value) return null
  const [h, m] = st.value.time.split(':').map(Number)
  const d = new Date(now.value)
  const delta = (st.value.weekday - d.getDay() + 7) % 7
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, h, m, 0, 0)
  if (target.getTime() <= now.value) target.setDate(target.getDate() + 7)
  const ms = target.getTime() - now.value
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  if (days === 0 && hours === 0) return `через ${mins} мин.`
  if (days === 0) return `через ${hours} ч. ${mins} мин.`
  return `через ${days} дн. ${hours} ч.`
})
</script>

<template>
  <div v-if="st && !failed" class="st-block">
    <h3>Созвон с учителем</h3>
    <p class="st-sub">В выбранный день недели и время приходит письмо «Сегодня созвон» — независимо от того, занимался ли уже.</p>
    <p v-if="!st.mailReady" class="bk-warn">⚠ Некуда отправлять: настройте почту (SMTP_* в server/.env) и адрес защиты кодом или REMINDER_MAIL_TO.</p>
    <div class="rm-row">
      <label class="rm-on"><input type="checkbox" :checked="st.enabled" :disabled="busy || !st.mailReady" @change="save({ enabled: ($event.target as HTMLInputElement).checked })" /> Напоминать</label>
      <label class="rm-time">в <input type="time" :value="st.time" :disabled="busy" aria-label="Время напоминания о созвоне" @change="save({ time: ($event.target as HTMLInputElement).value })" /></label>
      <button type="button" class="plain" :disabled="busy || !st.mailReady" @click="test">Отправить пробное</button>
    </div>
    <div class="rm-days" role="group" aria-label="День недели">
      <button v-for="(d, i) in WD" :key="i" type="button" class="daychip" :class="{ on: st.weekday === i }" :disabled="busy" :aria-pressed="st.weekday === i" @click="save({ weekday: i })">{{ d }}</button>
    </div>
    <p v-if="st.enabled" class="st-sub">Ближайший созвон {{ countdown }}.</p>
    <p v-if="st.mailReady" class="st-sub">Письмо придёт на {{ st.to }}.</p>
  </div>
</template>

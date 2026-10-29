<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useProgressStore, type GuestToken } from '@/stores/progress'

const progress = useProgressStore()

const DURATIONS: [number, string][] = [[1, '1 час'], [3, '3 часа'], [24, '1 день'], [168, '7 дней']]
const hours = ref(24)
const label = ref('')
const busy = ref(false)
const error = ref('')
const created = ref<(GuestToken & { token: string }) | null>(null)
const list = ref<GuestToken[]>([])
const copied = ref(false)
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined

const link = computed(() => (created.value ? `${location.origin}/?guest=${encodeURIComponent(created.value.token)}` : ''))

async function refresh() {
  try {
    list.value = await progress.listGuests()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function create() {
  busy.value = true
  error.value = ''
  copied.value = false
  try {
    created.value = await progress.createGuest(hours.value, label.value)
    label.value = ''
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
  busy.value = false
}

async function revoke(g: GuestToken) {
  if (!confirm(`Отозвать доступ${g.label ? ' «' + g.label + '»' : ''}? Гость сразу потеряет вход.`)) return
  try {
    await progress.revokeGuest(g.id)
    if (created.value?.id === g.id) created.value = null
    await refresh()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
  } catch {
    error.value = 'Не получилось скопировать, выделите и скопируйте вручную.'
  }
}

/** «осталось 2 ч 15 мин» */
function left(expires: number) {
  const min = Math.max(0, Math.round((expires - now.value) / 60_000))
  if (min < 60) return `${min} мин`
  if (min < 48 * 60) return `${Math.floor(min / 60)} ч ${min % 60} мин`
  return `${Math.round(min / 1440)} дн`
}

onMounted(() => {
  void refresh()
  tick = setInterval(() => (now.value = Date.now()), 30_000)
})
onBeforeUnmount(() => clearInterval(tick))
</script>

<template>
  <div class="st-block">
    <h3>Гостевой доступ</h3>
    <p>
      Временный токен для тех, кто хочет попробовать: гость открывает всё (игру, тренажёры, кабинет), но у него ничего не сохраняется,
      ни на сервере, ни в браузере, а ваш прогресс ему не виден. Когда срок выйдет, доступ закроется сам.
    </p>

    <div class="st-chips">
      <button v-for="[h, name] in DURATIONS" :key="h" class="chip" :class="{ on: hours === h }" @click="hours = h">{{ name }}</button>
    </div>
    <form class="pg-form" @submit.prevent="create">
      <input v-model="label" maxlength="40" placeholder="Для кого (необязательно)" aria-label="Для кого" />
      <button type="submit" :disabled="busy">{{ busy ? 'Создаю…' : 'Создать токен' }}</button>
    </form>

    <div v-if="created" class="gu-new">
      <b>Токен показывается один раз:</b>
      <code>{{ created.token }}</code>
      <div class="pg-btns">
        <button @click="copy(created.token)">Скопировать токен</button>
        <button class="plain" @click="copy(link)">Скопировать ссылку для входа</button>
        <span v-if="copied" class="gu-ok">скопировано</span>
      </div>
      <small>Ссылка открывает сайт сразу с этим токеном. Проверять её лучше в окне инкогнито: в вашем браузере она не сработает.</small>
    </div>

    <ul v-if="list.length" class="gu-list">
      <li v-for="g in list" :key="g.id">
        <span>{{ g.label || 'Без имени' }} <small>· осталось {{ left(g.expires) }}</small></span>
        <button class="plain danger" @click="revoke(g)">Отозвать</button>
      </li>
    </ul>
    <p v-else class="gu-empty">Действующих гостевых токенов нет.</p>
    <p v-if="error" class="gu-err">{{ error }}</p>
  </div>
</template>

<style>
.gu-new { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding: 14px 16px; border: 1px dashed var(--gold); border-radius: 12px; }
.gu-new code { padding: 10px 12px; font-size: 16px; word-break: break-all; user-select: all; background: var(--bg); border-radius: 8px; }
.gu-new small { color: var(--muted); }
.gu-ok { align-self: center; color: var(--gold); font-weight: 600; }
.gu-list { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.gu-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; }
.gu-list small { color: var(--muted); }
.gu-list button { padding: 6px 14px; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.gu-list button:hover { border-color: var(--bad, #a4402f); color: var(--bad, #a4402f); }
.gu-empty { margin-top: 12px; color: var(--muted); }
.gu-err { margin-top: 10px; color: var(--bad, #a4402f); font-weight: 600; }
</style>

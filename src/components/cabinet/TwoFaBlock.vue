<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { askTokenDo } from '@/composables/useConfirm'
import { useTwoFa } from '@/composables/useTwoFa'
import { useToastStore } from '@/stores/toast'

const tf = useTwoFa()
const toast = useToastStore()
const email = ref('')
const code = ref('')
const sentTo = ref('')
const busy = ref(false)
const loaded = ref(false)

onMounted(async () => {
  try {
    await tf.load()
  } catch {
    /* сервер недоступен: блок останется пустым */
  }
  loaded.value = true
})

async function run(fn: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  try {
    await fn()
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = false
  }
}
const start = () =>
  run(async () => {
    sentTo.value = await tf.startEnable(email.value.trim())
    toast.ok(`Код отправлен на ${sentTo.value}`)
  })
const confirm = () =>
  run(async () => {
    await tf.confirmEnable(code.value.trim())
    code.value = ''
    sentTo.value = ''
    email.value = ''
    toast.ok('Двухфакторная защита включена')
  })
const off = () => askTokenDo({ title: 'Выключить защиту кодом?', text: 'Вход снова будет только по токену. Введите токен, чтобы подтвердить.', ok: 'Выключить' }, t => tf.disable(t)).then(done => done && toast.ok('Защита кодом выключена'))
const revoke = () => askTokenDo({ title: 'Выйти на всех устройствах?', text: 'На каждом устройстве при следующем входе понадобится новый код, в том числе здесь. Введите токен, чтобы подтвердить.', ok: 'Выйти везде' }, t => tf.revokeAll(t)).then(done => done && toast.ok('Все сеансы закрыты'))
</script>

<template>
  <div v-if="loaded && tf.status.value" class="st-block">
    <h3>Защита кодом из письма</h3>
    <p>После токена сайт просит ещё код из 4 цифр, который приходит на вашу почту. Токен без почты уже не откроет кабинет.</p>

    <template v-if="tf.status.value.enabled">
      <p class="tf-on">✓ Включена. Коды приходят на <b>{{ tf.status.value.email }}</b>.</p>
      <p v-if="tf.status.value.bypassed" class="tf-warn">Сейчас защита отключена аварийным выключателем на сервере (DISABLE_2FA=1 в server/.env). Уберите строку и перезапустите службу, чтобы вернуть её.</p>
      <div class="pg-btns">
        <button class="plain" @click="revoke">Выйти на всех устройствах</button>
        <button class="plain danger" @click="off">Выключить защиту</button>
      </div>
    </template>

    <template v-else>
      <p v-if="!tf.status.value.mailConfigured" class="tf-warn">На сервере не настроена почта: добавьте SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS и SMTP_FROM в server/.env и перезапустите службу (см. docs/server.md).</p>
      <form v-else-if="!sentTo" class="pg-form" @submit.prevent="start">
        <input v-model="email" type="email" placeholder="почта для кодов" autocomplete="email" aria-label="Почта для кодов" />
        <button type="submit" :disabled="busy || !email.trim()">Отправить код</button>
      </form>
      <form v-else class="pg-form" @submit.prevent="confirm">
        <input v-model="code" inputmode="numeric" maxlength="4" pattern="\d{4}" placeholder="код из письма" autocomplete="one-time-code" aria-label="Код из письма" />
        <button type="submit" :disabled="busy || code.trim().length !== 4">Включить защиту</button>
        <button type="button" class="plain" :disabled="busy" @click="sentTo = ''; code = ''">Другой адрес</button>
      </form>
      <p v-if="sentTo" class="st-sub">Письмо ушло на {{ sentTo }}. Защита включится, только когда код подойдёт: так вы не потеряете доступ из-за опечатки в адресе.</p>
      <p v-else class="st-sub">Защита включается кодом, присланным на этот же адрес. Если письма перестанут приходить, на сервере есть аварийный выключатель (DISABLE_2FA=1 в server/.env).</p>
    </template>
  </div>
</template>

<style>
.study .tf-on { color: var(--ok, #3d8b5f); font-weight: 600; }
.study .tf-warn { color: #b27300; }
</style>

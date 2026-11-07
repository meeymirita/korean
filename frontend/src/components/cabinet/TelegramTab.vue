<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TelegramGuide from '@/components/cabinet/TelegramGuide.vue'
import { askTokenDo } from '@/composables/useConfirm'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

interface Topic {
  id: string
  name: string
  ready: boolean
}
interface Info {
  group: boolean
  topics: Topic[]
}

/** Вкладка «Telegram»: по полю и кнопке на каждую тему группы, чтобы проверить, что сообщение приходит куда надо. */
const progress = useProgressStore()
const toast = useToastStore()
const info = ref<Info | null>(null)
const failed = ref(false)
const busy = ref('')
const texts = ref<Record<string, string>>({})
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })

onMounted(async () => {
  try {
    const res = await fetchT('/api/notify/topics', { headers: headers() })
    if (!res.ok) throw new Error(String(res.status))
    info.value = (await res.json()) as Info
    for (const t of info.value.topics) texts.value[t.id] = `Проверка темы «${t.name}»`
  } catch {
    failed.value = true
  }
})

async function call(t: Topic, path: string, payload: object, okText: string) {
  busy.value = t.id
  try {
    const res = await fetchT(path, { method: 'POST', headers: headers(), body: JSON.stringify(payload) }, 60_000)
    const r = (await res.json()) as { ok: boolean; message: string }
    if (r.ok) toast.ok(okText)
    else toast.error(r.message || 'Не получилось отправить.')
  } catch (e) {
    toast.error('Не получилось: ' + errText(e))
  } finally {
    busy.value = ''
  }
}

/** Очистка опасна: окно просит ввести токен ещё раз, и только потом сервер удаляет сообщения. Ошибка остаётся внутри окна. */
async function clear(t: Topic | null) {
  let removed = 0
  const done = await askTokenDo(
    t
      ? {
          title: `Очистить тему «${t.name}»?`,
          text: 'Удалятся сообщения, которые сайт отправил в эту тему. Твои записи, например закреплённое описание, останутся. Введи свой токен, чтобы подтвердить.',
          ok: 'Очистить тему',
        }
      : {
          title: 'Очистить все темы?',
          text: 'Удалятся все сообщения во всех темах и в General, вместе с закреплёнными описаниями. Темы останутся. Отменить нельзя. Введи свой токен, чтобы подтвердить.',
          ok: 'Очистить всё',
        },
    async token => {
      if (!/^[\x20-\x7e]+$/.test(token)) throw new Error('неверный токен подтверждения')
      busy.value = t?.id ?? 'all'
      try {
        const res = await fetchT('/api/notify/clear', { method: 'POST', headers: { ...headers(), 'X-Confirm-Token': token }, body: JSON.stringify({ topic: t?.id ?? 'all' }) }, 120_000)
        if (res.status === 403) throw new Error('неверный токен подтверждения')
        if (res.status === 429) throw new Error('слишком много попыток, подождите несколько минут')
        const r = (await res.json()) as { ok: boolean; message: string; removed: number }
        if (!r.ok) throw new Error(r.message || 'не получилось очистить')
        removed = r.removed
      } finally {
        busy.value = ''
      }
    },
  )
  if (done) toast.ok(t ? `Тема «${t.name}» очищена, удалено сообщений: ${removed}.` : `Все темы очищены, обработано сообщений: ${removed}.`)
}

/** Свой текст строго в тему. */
function send(t: Topic) {
  const text = (texts.value[t.id] ?? '').trim()
  if (!text) return toast.error('Введите текст.')
  return call(t, '/api/notify/topic', { topic: t.id, text }, `Отправлено в тему «${t.name}».`)
}

/** Настоящее сообщение темы с выдуманными данными. */
function sample(t: Topic) {
  return call(t, '/api/notify/sample', { topic: t.id }, `Пример отправлен в тему «${t.name}».`)
}
</script>

<template>
  <div class="cb-body">
    <template v-if="progress.unlocked && !progress.isGuest">
      <div v-if="info && !failed" class="st-block">
        <h3>Telegram: темы группы</h3>
        <p class="st-sub">Каждый вид уведомлений приходит в свою тему группы с баннером и сердечком своего цвета. «Пример сообщения» отправляет настоящее сообщение этой темы с выдуманными данными, ровно такое, как придёт на самом деле. Поле ниже отправляет любой свой текст. В обоих случаях сообщение уходит строго в эту тему, не на почту.</p>
        <p v-if="!info.group" class="bk-warn">⚠ Группа не подключена: нужны TELEGRAM_BOT_TOKEN и TELEGRAM_GROUP_ID в .env, номера тем TELEGRAM_TOPIC_… (см. docs/disk-and-telegram.md).</p>
        <p class="st-sub">В личный чат бота ничего не приходит: всё, включая код входа, идёт только в темы группы. Следи, чтобы в группе были только ты и бот.</p>
        <div class="tg-tools">
          <button type="button" class="tg-btn danger" :disabled="busy !== '' || !info.group" @click="clear(null)">{{ busy === 'all' ? 'Очищаю…' : 'Очистить все темы' }}</button>
        </div>
        <p class="st-sub">«Очистить» просит токен ещё раз: удаляются сообщения в темах и в General.</p>
        <TelegramGuide :group="info.group" :topics="info.topics" />
        <div class="tg-list">
          <form v-for="t in info.topics" :key="t.id" class="tg-card" @submit.prevent="send(t)">
            <div class="tg-top">
              <b class="tg-name">{{ t.name }}</b>
              <span class="tg-badge" :class="t.ready ? 'ok' : 'no'">{{ t.ready ? 'тема подключена' : 'номер темы не задан' }}</span>
            </div>
            <div class="tg-line">
              <button type="button" class="tg-btn main" :disabled="busy !== '' || !t.ready || !info.group" @click="sample(t)">{{ busy === t.id ? 'Отправляю…' : 'Пример сообщения' }}</button>
              <button type="button" class="tg-btn danger" :disabled="busy !== '' || !t.ready || !info.group" @click="clear(t)">Очистить тему</button>
            </div>
            <div class="tg-line">
              <input v-model="texts[t.id]" type="text" maxlength="900" :disabled="busy !== '' || !t.ready" autocomplete="off" :aria-label="'Свой текст в тему «' + t.name + '»'" placeholder="Свой текст" />
              <button type="submit" class="tg-btn soft" :disabled="busy !== '' || !t.ready || !info.group">Отправить</button>
            </div>
          </form>
        </div>
      </div>
      <p v-else-if="failed" class="cb-empty">Не удалось получить настройки Telegram, попробуйте обновить страницу.</p>
    </template>
    <p v-else class="cb-empty">Telegram доступен после входа по токену владельца.</p>
  </div>
</template>

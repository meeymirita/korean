<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

async function send(t: Topic) {
  const text = (texts.value[t.id] ?? '').trim()
  if (!text) return toast.error('Введите текст.')
  busy.value = t.id
  try {
    const res = await fetchT('/api/notify/topic', { method: 'POST', headers: headers(), body: JSON.stringify({ topic: t.id, text }) }, 60_000)
    const r = (await res.json()) as { ok: boolean; message: string }
    if (r.ok) toast.ok(`Отправлено в тему «${t.name}».`)
    else toast.error(r.message || 'Не получилось отправить.')
  } catch (e) {
    toast.error('Не получилось: ' + errText(e))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="cb-body">
    <template v-if="progress.unlocked && !progress.isGuest">
      <div v-if="info && !failed" class="st-block">
        <h3>Telegram: темы группы</h3>
        <p class="st-sub">Каждый вид уведомлений приходит в свою тему группы с баннером. Напиши текст и нажми «Отправить»: он уйдёт строго в эту тему (не на почту), так видно, что тема и баннер настроены верно.</p>
        <p v-if="!info.group" class="bk-warn">⚠ Группа не подключена: нужны TELEGRAM_BOT_TOKEN и TELEGRAM_GROUP_ID в .env, номера тем TELEGRAM_TOPIC_… (см. docs/disk-and-telegram.md).</p>
        <p class="st-sub">В личный чат бота ничего не приходит: всё, включая код входа, идёт только в темы группы. Следи, чтобы в группе были только ты и бот.</p>
        <form v-for="t in info.topics" :key="t.id" class="tg-row" @submit.prevent="send(t)">
          <label :for="'tg-' + t.id"><b>{{ t.name }}</b> <small :class="t.ready ? 'tg-ok' : 'tg-no'">{{ t.ready ? 'тема подключена' : 'номер темы не задан' }}</small></label>
          <div class="tg-line">
            <input :id="'tg-' + t.id" v-model="texts[t.id]" type="text" maxlength="900" :disabled="busy !== '' || !t.ready" autocomplete="off" />
            <button type="submit" class="plain" :disabled="busy !== '' || !t.ready || !info.group">{{ busy === t.id ? 'Отправляю…' : 'Отправить' }}</button>
          </div>
        </form>
      </div>
      <p v-else-if="failed" class="cb-empty">Не удалось получить настройки Telegram, попробуйте обновить страницу.</p>
    </template>
    <p v-else class="cb-empty">Telegram доступен после входа по токену владельца.</p>
  </div>
</template>

<style scoped>
.tg-row { margin-top: 14px; }
.tg-row label { display: block; margin-bottom: 6px; }
.tg-line { display: flex; gap: 10px; flex-wrap: wrap; }
.tg-line input { flex: 1 1 240px; min-width: 0; }
.tg-ok { color: var(--ok, #2e8b57); }
.tg-no { color: var(--muted, #8b8fc4); }
</style>

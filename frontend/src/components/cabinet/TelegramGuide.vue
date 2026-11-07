<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ group: boolean; topics: { id: string; name: string; ready: boolean }[] }>()

/** Редактор закреплённого сообщения в «General»: текст, баннер, предпросмотр; кнопки сами идут под сообщением (переходы в темы). */
const progress = useProgressStore()
const toast = useToastStore()
const HEART: Record<string, string> = { login: '💙', remind: '🩷', digest: '💜', lesson: '🩵', backup: '🤍', alert: '❤️' }
const auth = () => ({ Authorization: `Bearer ${progress.bearer}` })

const text = ref('')
const defaultText = ref('')
const hasBanner = ref(false)
const published = ref(false)
const loaded = ref(false)
const busy = ref(false)
const file = ref<File | null>(null)
/** показанный баннер: выбранный файл или тот, что уже отправлен (скачан у сервера) */
const shown = ref('')
let serverUrl = ''
let pickedUrl = ''

onMounted(async () => {
  try {
    const res = await fetchT('/api/notify/guide', { headers: auth() })
    if (!res.ok) throw new Error(String(res.status))
    const r = (await res.json()) as { text: string; defaultText: string; hasBanner: boolean; published: boolean }
    text.value = r.text
    defaultText.value = r.defaultText
    hasBanner.value = r.hasBanner
    published.value = r.published
    if (r.hasBanner) {
      const img = await fetchT('/api/notify/guide/banner', { headers: auth() }, 30_000)
      if (img.ok) shown.value = serverUrl = URL.createObjectURL(await img.blob())
    }
    loaded.value = true
  } catch {
    toast.error('Не удалось загрузить сообщение General.')
  }
})
onBeforeUnmount(() => {
  if (serverUrl) URL.revokeObjectURL(serverUrl)
  if (pickedUrl) URL.revokeObjectURL(pickedUrl)
})

function pick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return void toast.error('Нужен баннер в формате JPG, PNG или WebP.')
  if (f.size > 8 * 1024 * 1024) return void toast.error('Баннер больше 8 МБ, сожми его.')
  if (pickedUrl) URL.revokeObjectURL(pickedUrl)
  file.value = f
  shown.value = pickedUrl = URL.createObjectURL(f)
}
function dropPick() {
  if (pickedUrl) URL.revokeObjectURL(pickedUrl)
  pickedUrl = ''
  file.value = null
  shown.value = serverUrl
}

const withBanner = computed(() => hasBanner.value || !!file.value)
const limit = computed(() => (withBanner.value ? 1024 : 4000))
const visible = computed(() => text.value.replace(/<[^>]*>/g, '').length)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Предпросмотр: всё экранируется, разрешены только теги Telegram b, i, u, s, code и ссылки http(s). */
const preview = computed(() =>
  esc(text.value)
    .replace(/&lt;(\/?)(b|i|u|s|code)&gt;/g, '<$1$2>')
    .replace(/&lt;a href="(https?:\/\/[^"<>\s]*)"&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">')
    .replace(/&lt;\/a&gt;/g, '</a>'),
)

async function publish(mode: 'send' | 'new') {
  if (!text.value.trim()) return void toast.error('Введите текст сообщения.')
  if (visible.value > limit.value) return void toast.error(`Текст длиннее ${limit.value} знаков.`)
  busy.value = true
  try {
    const fd = new FormData()
    fd.append('text', text.value)
    fd.append('mode', mode)
    if (file.value) fd.append('banner', file.value)
    const res = await fetchT('/api/notify/guide', { method: 'POST', headers: auth(), body: fd }, 120_000)
    const r = (await res.json()) as { ok: boolean; message: string; edited?: boolean }
    if (!r.ok) return void toast.error(r.message || 'Не получилось отправить.')
    if (file.value) {
      // выбранный файл теперь баннер сообщения
      if (serverUrl && serverUrl !== pickedUrl) URL.revokeObjectURL(serverUrl)
      serverUrl = pickedUrl
      pickedUrl = ''
      hasBanner.value = true
      file.value = null
    }
    published.value = true
    if (r.message) toast.error(r.message)
    else toast.ok(r.edited ? 'Сообщение в General обновлено.' : 'Сообщение отправлено в General и закреплено.')
  } catch (e) {
    toast.error('Не получилось: ' + errText(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tg-guide">
    <h4>Сообщение в General</h4>
    <p class="st-sub">Закреплённое сообщение в общем чате: баннер, текст и кнопки-переходы по темам (кнопки добавляются под сообщением сами). Если оно уже отправлено, «Сохранить и отправить» исправит его на месте, закреп сохранится.</p>
    <div v-if="loaded" class="tg-editor">
      <div class="tg-col">
        <label class="tg-label" for="tg-guide-text">Текст сообщения</label>
        <textarea id="tg-guide-text" v-model="text" rows="12" :disabled="busy" spellcheck="false"></textarea>
        <div class="tg-count" :class="{ over: visible > limit }">знаков: {{ visible }} из {{ limit }}{{ withBanner ? ' (с баннером короче)' : '' }}</div>
        <p class="st-sub">Можно: <code>&lt;b&gt;жирный&lt;/b&gt;</code>, <code>&lt;i&gt;курсив&lt;/i&gt;</code>, <code>&lt;a href="https://…"&gt;ссылка&lt;/a&gt;</code>, <code>&lt;code&gt;код&lt;/code&gt;</code>. Сердечки и любые значки можно вставлять прямо в текст.</p>
        <div class="tg-line">
          <label class="tg-btn soft tg-file">
            {{ hasBanner || file ? 'Заменить баннер' : 'Выбрать баннер' }}
            <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="pick" />
          </label>
          <button v-if="file" type="button" class="tg-btn soft" :disabled="busy" @click="dropPick">Не менять баннер</button>
          <button type="button" class="tg-btn soft" :disabled="busy" @click="text = defaultText">Сбросить текст</button>
        </div>
        <p class="st-sub">Баннер: JPG, PNG или WebP до 8 МБ, лучше 1280×640. Он загружается прямо в Telegram, на сайте файл не хранится. Без баннера придёт только текст.</p>
        <div class="tg-line">
          <button type="button" class="tg-btn main" :disabled="busy || !group" @click="publish('send')">{{ busy ? 'Отправляю…' : 'Сохранить и отправить' }}</button>
          <button type="button" class="tg-btn soft" :disabled="busy || !group" @click="publish('new')">Отправить заново</button>
        </div>
        <p v-if="!published" class="st-sub">Сообщение ещё не отправлено в General.</p>
      </div>
      <div class="tg-col">
        <div class="tg-label">Так будет выглядеть</div>
        <div class="tg-bubble">
          <img v-if="shown" :src="shown" alt="Баннер сообщения" />
          <div v-else class="tg-nobanner">баннер не выбран</div>
          <div class="tg-bubble-text" v-html="preview"></div>
          <div class="tg-bubble-btns">
            <span v-for="t in topics.filter(x => x.ready)" :key="t.id">{{ HEART[t.id] }} {{ t.name }}</span>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="st-sub">Загружаю…</p>
  </div>
</template>

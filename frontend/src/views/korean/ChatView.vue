<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { askConfirm } from '@/composables/useConfirm'
import { usePersisted } from '@/composables/usePersisted'
import { askChat, CHAT_MAX_TEXT, chatStatus, deleteChat, koreanParts, listChats, loadChat, richReply, type ChatInfo, type ChatMsg } from '@/lib/chat'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

const progress = useProgressStore()
const route = useRoute()
const toast = useToastStore()
const msgs = ref<ChatMsg[]>([])
/** номер открытого чата (на сервере хранится вся история); пусто, пока чат не начат */
const conv = usePersisted<string | null>('chat_conv', null, v => v === null || typeof v === 'string')
const chats = ref<ChatInfo[]>([])
const showHistory = ref(false)
const input = ref('')
const busy = ref(false)
const left = ref<number | null>(null)
const limit = ref(0)
const configured = ref(true)
const box = ref<HTMLElement | null>(null)
/** номера ответов, у которых открыт разбор */
const opened = ref(new Set<number>())
function toggle(i: number) {
  const s = new Set(opened.value)
  if (!s.delete(i)) s.add(i)
  opened.value = s
}

const HINTS = ['Как сказать «я ем хлеб»?', 'Чем отличаются 은/는 и 이/가?', 'Проверь: 저는 학생이에요', 'Объясни 받침 на примере']

const down = () => nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight, behavior: 'smooth' }))

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const refreshList = async () => (chats.value = await listChats(progress.bearer))

onMounted(async () => {
  if (progress.isGuest) return
  const [st] = await Promise.all([chatStatus(progress.bearer), refreshList()])
  if (st) {
    configured.value = st.configured
    left.value = st.left
    limit.value = st.limit
  }
  // чат из общей истории («Разговоры»): ?c=<номер>; иначе после обновления страницы открывается тот же чат
  const wanted = typeof route.query.c === 'string' && /^[0-9a-f]{16}$/.test(route.query.c) ? route.query.c : ''
  if (wanted) conv.value = wanted
  if (conv.value) {
    const m = await loadChat(progress.bearer, conv.value)
    if (m) msgs.value = m
    else conv.value = null
  }
  down()
})

/** Закрыть текущий чат и начать новый (старый остаётся в истории). */
function newChat() {
  if (busy.value) return
  conv.value = null
  msgs.value = []
  opened.value = new Set()
  showHistory.value = false
}

async function openChat(id: string) {
  if (busy.value || id === conv.value) {
    showHistory.value = false
    return
  }
  const m = await loadChat(progress.bearer, id)
  if (!m) return toast.error('Не получилось открыть чат')
  conv.value = id
  msgs.value = m
  opened.value = new Set()
  showHistory.value = false
  down()
}

async function removeChat(c: ChatInfo) {
  if (!(await askConfirm({ title: 'Удалить чат?', text: `«${c.title || 'Без названия'}» и все его сообщения исчезнут.`, ok: 'Удалить', danger: true }))) return
  try {
    await deleteChat(progress.bearer, c.id)
  } catch (e) {
    return toast.error((e as Error).message)
  }
  if (conv.value === c.id) newChat()
  await refreshList()
  toast.ok('Чат удалён')
}

async function send(text = input.value) {
  const t = text.trim()
  if (!t || busy.value) return
  if (t.length > CHAT_MAX_TEXT) return toast.error(`Вопрос длиннее ${CHAT_MAX_TEXT} знаков, сократи его`)
  msgs.value = [...msgs.value, { role: 'user', text: t }]
  input.value = ''
  busy.value = true
  down()
  try {
    const r = await askChat(progress.bearer, msgs.value, conv.value ?? 'new')
    msgs.value = [...msgs.value, { role: 'assistant', text: r.reply }]
    left.value = r.left
    if (r.conv) conv.value = r.conv
    void refreshList()
  } catch (e) {
    toast.error((e as Error).message)
    // вопрос возвращаем в поле, чтобы не набирать заново
    msgs.value = msgs.value.slice(0, -1)
    input.value = t
  } finally {
    busy.value = false
    down()
  }
}

function onKey(e: KeyboardEvent) {
  // Enter отправляет, Shift+Enter — новая строка; клавиши заданий (1–4, Enter) тут не мешают
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    e.stopPropagation()
    void send()
  }
}
</script>

<template>
  <div class="wrap chat">
    <SectionHead id="chat" />
    <p v-if="progress.isGuest" class="cb-empty">Помощник доступен только владельцу сайта.</p>
    <template v-else>
    <p v-if="!configured" class="cb-empty">Помощник пока не подключён: на сервере нет ключа. Как подключить — в <code>backend/.env.example</code>.</p>
    <p class="chat-note">Вопросы уходят в сторонний сервис (OpenRouter), бесплатные модели могут сохранять тексты. Личного не пиши. Бесплатная модель может ошибаться в переводе и примерах. Чтение и разбор корейского считает сайт по своему словарю (кнопка «Разобрать»), сверяй с грамматикой и учителем.</p>

    <div class="chat-bar">
      <button type="button" class="chat-new" :disabled="busy || (!msgs.length && !conv)" @click="newChat">＋ Новый чат</button>
      <button type="button" class="chat-clear" :aria-expanded="showHistory" @click="showHistory = !showHistory">История чатов · {{ chats.length }}</button>
      <NuxtLink to="/korean/talks" class="chat-all">Все разговоры и поиск →</NuxtLink>
    </div>
    <ul v-if="showHistory" class="chat-hist">
      <li v-if="!chats.length" class="chat-hist-empty">Сохранённых чатов пока нет: первый появится после первого вопроса.</li>
      <li v-for="c in chats" :key="c.id" class="chat-hist-row" :class="{ cur: c.id === conv }">
        <button type="button" class="chat-hist-open" @click="openChat(c.id)">
          <b>{{ c.title || 'Без названия' }}</b>
          <small>{{ when(c.updated) }} · сообщений: {{ c.messages }}</small>
        </button>
        <button type="button" class="chat-hist-del" :aria-label="`Удалить чат «${c.title}»`" @click="removeChat(c)">✕</button>
      </li>
    </ul>

    <div ref="box" class="chat-box" aria-live="polite">
      <div v-if="!msgs.length" class="chat-hints">
        <p>Спроси про слово, правило или проверь своё предложение.</p>
        <button v-for="h in HINTS" :key="h" type="button" class="chat-hint" :disabled="busy || !configured" @click="send(h)">{{ h }}</button>
      </div>
      <div v-for="(m, i) in msgs" :key="i" class="chat-msg" :class="m.role">
        <template v-if="m.role === 'user'">{{ m.text }}</template>
        <template v-else>
          <template v-for="(l, j) in richReply(m.text)" :key="j">
            <div v-if="l.kind === 'phrase'" class="chat-phrase">
              <span v-if="l.num" class="chat-num">{{ l.num }}</span>
              <div><span class="ko">{{ l.ko }}</span><small v-if="l.ru">{{ l.ru }}</small></div>
            </div>
            <p v-else-if="l.kind === 'head'" class="chat-head">{{ l.parts[0]?.text }}</p>
            <p v-else class="chat-line" :class="{ li: l.bullet || l.num, tip: l.kind === 'tip' }">
              <span v-if="l.num" class="chat-num">{{ l.num }}</span>
              <template v-for="(p, k) in l.parts" :key="k"><span v-if="p.ko" class="ko" :class="{ b: p.bold }">{{ p.text }}</span><b v-else-if="p.bold">{{ p.text }}</b><template v-else>{{ p.text }}</template></template>
            </p>
          </template>
          <template v-if="koreanParts(m.text).length">
            <button type="button" class="chat-parse" @click="toggle(i)">{{ opened.has(i) ? 'Скрыть разбор' : 'Разобрать' }}</button>
            <div v-if="opened.has(i)" class="chat-bd">
              <SentenceBreakdown v-for="k in koreanParts(m.text)" :key="k" :sentence="k" />
            </div>
          </template>
        </template>
      </div>
      <div v-if="busy" class="chat-msg assistant chat-wait">Думаю…</div>
    </div>

    <form class="chat-form" @submit.prevent="send()">
      <textarea v-model="input" rows="2" maxlength="2000" placeholder="Напиши вопрос… Enter — отправить, Shift+Enter — новая строка" :disabled="busy" @keydown="onKey" />
      <div class="chat-row">
        <small v-if="left !== null" class="chat-left" :class="{ low: left <= 5 }">Вопросов на сегодня: осталось {{ left }}<template v-if="limit"> из {{ limit }}</template></small>
        <span v-else />
        <button type="submit" class="chat-send" :disabled="busy || !input.trim() || !configured">Спросить</button>
      </div>
    </form>
    </template>
  </div>
</template>

<style scoped>
.chat-note { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
.chat-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.chat-all { align-self: center; color: var(--accent); font-size: 14px; text-decoration: none; }
.chat-all:hover { text-decoration: underline; }
.chat-new { border: 1px solid var(--accent); border-radius: 999px; background: transparent; color: var(--accent); padding: 7px 18px; font: inherit; font-size: 14px; cursor: pointer; }
.chat-new:hover:not(:disabled) { background: var(--gold-soft); }
.chat-hist { list-style: none; margin: 0 0 12px; padding: 6px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; max-height: 280px; overflow-y: auto; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.chat-hist-empty { padding: 10px 12px; color: var(--muted); font-size: 14px; }
.chat-hist-row { display: flex; align-items: center; gap: 4px; min-width: 0; border-radius: 12px; }
.chat-hist-row.cur { background: var(--gold-soft); }
.chat-hist-open { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; border: 0; background: transparent; padding: 8px 12px; font: inherit; color: var(--ink); text-align: left; cursor: pointer; }
.chat-hist-open b { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
.chat-hist-open small { color: var(--muted); font-size: 12px; }
.chat-hist-del { border: 0; background: transparent; color: var(--muted); padding: 8px 12px; font: inherit; cursor: pointer; }
.chat-hist-del:hover { color: var(--bad); }
.chat-box { display: flex; flex-direction: column; gap: 10px; min-height: 280px; max-height: 58vh; overflow-y: auto; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.chat-msg { max-width: min(640px, 88%); padding: 10px 14px; border-radius: 16px; font-size: 15px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-msg.user { align-self: flex-end; background: var(--gold-soft); border-bottom-right-radius: 4px; }
.chat-msg.assistant { align-self: flex-start; color: var(--ink); background: rgba(255, 255, 255, .9); border: 1px solid var(--line-soft); border-bottom-left-radius: 4px; }
.chat-line { margin: 0 0 8px; }
.ko { font-family: 'Noto Sans KR', sans-serif; font-weight: 600; color: var(--accent); }
.ko.b { font-weight: 700; }
.chat-head { margin: 12px 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.chat-head:first-child { margin-top: 0; }
.chat-phrase { display: flex; align-items: baseline; gap: 10px; margin: 6px 0; padding: 10px 14px; border-left: 3px solid var(--accent); border-radius: 12px; background: var(--gold-soft); }
.chat-phrase .ko { display: block; font-size: 18px; line-height: 1.4; }
.chat-phrase small { display: block; margin-top: 2px; color: var(--muted); font-size: 13px; }
.chat-num { display: inline-block; flex: none; min-width: 22px; color: var(--accent); font-weight: 700; }
.chat-line.tip { margin-top: 10px; padding: 10px 14px; border: 1px dashed var(--accent); border-radius: 12px; }
.chat-line:last-child { margin-bottom: 0; }
.chat-line.li { position: relative; padding-left: 16px; }
.chat-line.li::before { content: '•'; position: absolute; left: 3px; color: var(--accent); }
.chat-line.li:has(.chat-num)::before { content: none; }
.chat-parse { margin-top: 8px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--accent); padding: 4px 14px; font: inherit; font-size: 13px; cursor: pointer; }
.chat-bd { margin-top: 10px; display: grid; gap: 14px; white-space: normal; }
.chat-wait { color: var(--muted); }
.chat-hints { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--muted); }
.chat-hints p { flex-basis: 100%; margin: 0 0 4px; }
.chat-hint { border: 1px solid var(--line); border-radius: 999px; background: rgba(255, 255, 255, .9); color: var(--ink); padding: 7px 14px; font: inherit; font-size: 14px; cursor: pointer; }
.chat-hint:hover:not(:disabled) { background: var(--gold-soft); }
.chat-form { margin-top: 12px; }
.chat-form textarea { width: 100%; box-sizing: border-box; resize: vertical; border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; font: inherit; font-size: 15px; color: var(--ink); background: #fff; }
.chat-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.chat-row small { flex: 1; color: var(--muted); }
.chat-left.low { color: var(--bad); }
.chat-row span { flex: 1; }
.chat-send, .chat-clear { border-radius: 999px; padding: 8px 20px; font: inherit; font-size: 14px; cursor: pointer; }
.chat-send { border: 0; background: var(--accent); color: #fff; }
.chat-clear { border: 1px solid var(--line); background: transparent; color: var(--muted); }
button:disabled { opacity: .5; cursor: default; }
/* тёмная и ночная темы: светлые подложки заменены цветом карточки темы (--surface), иначе светлый текст стоит на белом */
html[data-theme='dark'] .chat-msg.assistant, html[data-theme='dark'] .chat-hint, html[data-theme='dark'] .chat-form textarea { background: var(--surface); }
@media (max-width: 520px) { .chat-box { max-height: 52vh; padding: 12px; } .chat-msg { max-width: 94%; } }
</style>

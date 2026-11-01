<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { askConfirm } from '@/composables/useConfirm'
import { usePersisted } from '@/composables/usePersisted'
import { askChat, CHAT_MAX_TEXT, chatStatus, parseReply, type ChatMsg } from '@/lib/chat'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

const progress = useProgressStore()
const toast = useToastStore()
const msgs = usePersisted<ChatMsg[]>('chat_msgs', [], v => Array.isArray(v))
const input = ref('')
const busy = ref(false)
const left = ref<number | null>(null)
const limit = ref(0)
const configured = ref(true)
const box = ref<HTMLElement | null>(null)

const HINTS = ['Как сказать «я ем хлеб»?', 'Чем отличаются 은/는 и 이/가?', 'Проверь: 저는 학생이에요', 'Объясни 받침 на примере']

const down = () => nextTick(() => box.value?.scrollTo({ top: box.value.scrollHeight, behavior: 'smooth' }))

onMounted(async () => {
  const st = await chatStatus(progress.bearer)
  if (st) {
    configured.value = st.configured
    left.value = st.left
    limit.value = st.limit
  }
  down()
})

async function send(text = input.value) {
  const t = text.trim()
  if (!t || busy.value) return
  if (t.length > CHAT_MAX_TEXT) return toast.error(`Вопрос длиннее ${CHAT_MAX_TEXT} знаков, сократи его`)
  msgs.value = [...msgs.value, { role: 'user', text: t }]
  input.value = ''
  busy.value = true
  down()
  try {
    const r = await askChat(progress.bearer, msgs.value)
    msgs.value = [...msgs.value, { role: 'assistant', text: r.reply }]
    left.value = r.left
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

async function clear() {
  if (!msgs.value.length) return
  if (await askConfirm({ title: 'Очистить переписку?', text: 'Все сообщения на этой странице исчезнут.', ok: 'Очистить', danger: true })) msgs.value = []
}
</script>

<template>
  <div class="wrap chat">
    <SectionHead id="chat" />
    <p v-if="!configured" class="cb-empty">Помощник пока не подключён: на сервере нет ключа. Как подключить — в <code>server/.env.example</code>.</p>
    <p class="chat-note">Вопросы уходят в сторонний сервис (OpenRouter), бесплатные модели могут сохранять тексты. Личного не пиши. Бесплатная модель может ошибаться (особенно в чтении и переводе): сверяй с грамматикой и учителем.</p>

    <div ref="box" class="chat-box" aria-live="polite">
      <div v-if="!msgs.length" class="chat-hints">
        <p>Спроси про слово, правило или проверь своё предложение.</p>
        <button v-for="h in HINTS" :key="h" type="button" class="chat-hint" :disabled="busy || !configured" @click="send(h)">{{ h }}</button>
      </div>
      <div v-for="(m, i) in msgs" :key="i" class="chat-msg" :class="m.role">
        <template v-if="m.role === 'user'">{{ m.text }}</template>
        <template v-else>
          <p v-for="(l, j) in parseReply(m.text)" :key="j" class="chat-line" :class="{ li: l.bullet }">
            <template v-for="(p, k) in l.pieces" :key="k"><b v-if="p.bold">{{ p.text }}</b><template v-else>{{ p.text }}</template></template>
          </p>
        </template>
      </div>
      <div v-if="busy" class="chat-msg assistant chat-wait">Думаю…</div>
    </div>

    <form class="chat-form" @submit.prevent="send()">
      <textarea v-model="input" rows="2" maxlength="2000" placeholder="Напиши вопрос… Enter — отправить, Shift+Enter — новая строка" :disabled="busy" @keydown="onKey" />
      <div class="chat-row">
        <small v-if="left !== null" class="chat-left" :class="{ low: left <= 5 }">Вопросов на сегодня: осталось {{ left }}<template v-if="limit"> из {{ limit }}</template></small>
        <span v-else />
        <button type="button" class="chat-clear" :disabled="!msgs.length" @click="clear">Очистить</button>
        <button type="submit" class="chat-send" :disabled="busy || !input.trim() || !configured">Спросить</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.chat-note { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
.chat-box { display: flex; flex-direction: column; gap: 10px; min-height: 280px; max-height: 58vh; overflow-y: auto; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.chat-msg { max-width: min(640px, 88%); padding: 10px 14px; border-radius: 16px; font-size: 15px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.chat-msg.user { align-self: flex-end; background: var(--gold-soft); border-bottom-right-radius: 4px; }
.chat-msg.assistant { align-self: flex-start; background: rgba(255, 255, 255, .9); border: 1px solid var(--line-soft); border-bottom-left-radius: 4px; }
.chat-line { margin: 0 0 6px; }
.chat-line:last-child { margin-bottom: 0; }
.chat-line.li { position: relative; padding-left: 16px; }
.chat-line.li::before { content: '•'; position: absolute; left: 3px; color: var(--accent); }
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
@media (max-width: 520px) { .chat-box { max-height: 52vh; padding: 12px; } .chat-msg { max-width: 94%; } }
</style>

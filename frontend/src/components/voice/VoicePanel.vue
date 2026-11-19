<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { askConfirm } from '@/composables/useConfirm'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { dragEdge } from '@/lib/dragdrop'
import { errText } from '@/lib/http'
import { sceneIcon, VOICE_IMG as IMG } from '@/components/voice/voiceAssets'
import { clampPanelWidth, koreanOnly, splitKorean } from '@/lib/voiceText'
import { mmss, useVoiceAvailable, useVoiceStore } from '@/stores/voice'
import { useToastStore } from '@/stores/toast'

/**
 * Голосовой собеседник: окно справа и мини-плашка сверху, пока идёт разговор, а окно закрыто (как у музыкального плеера).
 * Соединение живёт в `stores/voice.ts`, разговор не прерывается при переходе между страницами. Описание: `docs/voice.md`.
 */
const store = useVoiceStore()
const toast = useToastStore()
const show = useVoiceAvailable()
onMounted(() => void (show.value && store.load()))
watch(show, v => v && void store.load())
watch(
  () => [store.open, store.tab] as const,
  ([o, t]) => {
    if (o && show.value) void store.load()
    if (o && t === 'history') void store.loadHistory()
  },
)

/** Ширина окна: тянется за левый край (запоминается в браузере), двойное нажатие на край возвращает обычную. */
const WIDTH_KEY = 'voice_panel_width'
const panelW = ref(0)
const grip = ref<HTMLElement>()
const panel = ref<HTMLElement>()
let startW = 0
let offDrag: (() => void) | null = null
onMounted(() => {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    if (v > 0) panelW.value = clampPanelWidth(v, window.innerWidth)
  } catch {
    /* без запоминания */
  }
})
function setupGrip() {
  offDrag?.()
  offDrag = null
  if (!grip.value) return
  offDrag = dragEdge({
    handle: grip.value,
    onStart: () => (startW = panel.value?.getBoundingClientRect().width ?? 0),
    onMove: dx => (panelW.value = clampPanelWidth(startW - dx, window.innerWidth)),
    onEnd: () => {
      try {
        localStorage.setItem(WIDTH_KEY, String(panelW.value))
      } catch {
        /* без запоминания */
      }
    },
  })
}
function resetWidth() {
  panelW.value = 0
  try {
    localStorage.removeItem(WIDTH_KEY)
  } catch {
    /* без запоминания */
  }
}
watch(
  () => store.open,
  async o => {
    if (!o) return void (offDrag?.(), (offDrag = null))
    await nextTick()
    setupGrip()
  },
)
onBeforeUnmount(() => offDrag?.())

const log = ref<HTMLElement>()
watch(
  () => store.lines.length,
  async () => {
    await nextTick()
    log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' })
  },
)

const moodText = computed(() => {
  if (store.phase === 'connecting') return 'Соединяюсь…'
  if (store.phase === 'idle') return 'Выбери тему и нажми на микрофон'
  if (store.ptt && store.phase === 'live' && store.talking) return 'Говори, я слушаю'
  if (store.ptt && store.phase === 'live' && store.mood === 'listening') return 'Удерживай микрофон и говори'
  return { listening: 'Слушаю', thinking: 'Думаю', speaking: 'Говорю' }[store.mood]
})
/** Надпись на главной кнопке: до разговора приглашение, во время разговора статус (запись, пауза, думает, говорит). */
const goLabel = computed(() => {
  if (store.phase === 'connecting') return 'Соединяюсь…'
  if (store.phase === 'idle' && store.status && !canStart.value) return store.status.configured ? 'Минуты на сегодня закончились' : 'Голос не настроен на сервере'
  if (store.phase === 'idle') return 'Выбери тему и нажми на микрофон'
  const t = mmss(store.elapsed)
  if (store.ptt) {
    if (store.talking) return `Запись · отпусти, чтобы отправить · ${t}`
    if (store.mood === 'speaking') return `Говорю · нажми и говори, чтобы перебить · ${t}`
    if (store.mood === 'thinking') return `Думаю… · ${t}`
    return `Удерживай и говори · ${t}`
  }
  if (store.muted) return `Пауза: микрофон выключен · нажми, чтобы включить · ${t}`
  return `${store.mood === 'speaking' ? 'Говорю' : store.mood === 'thinking' ? 'Думаю…' : 'Слушаю, говори'} · нажми для паузы · ${t}`
})
const goDown = (e: PointerEvent) => {
  if (store.live && store.ptt) {
    e.preventDefault()
    store.holdStart()
  }
}
const goClick = () => {
  if (!store.live) void store.start()
  else if (!store.ptt) store.toggleMute()
}
const goKey = (e: KeyboardEvent, down: boolean) => {
  if (store.live && store.ptt) holdKey(e, down)
}
const leftMin = computed(() => Math.ceil((store.status?.leftSec ?? 0) / 60))
const limitMin = computed(() => Math.round((store.status?.limitSec ?? 0) / 60))
/** Примерная стоимость того, что потрачено сегодня, и оставшегося. */
const money = (sec: number) => '≈ $' + (((sec / 60) * (store.status?.costPerMin ?? 0)).toFixed(2))
const usedPct = computed(() => (store.status?.limitSec ? Math.min(100, ((store.status.limitSec - store.left) / store.status.limitSec) * 100) : 0))
const canStart = computed(() => !!store.status?.configured && (store.status?.leftSec ?? 0) > 0)

/** Какие корейские фразы раскрыты разбором (ключ «номер реплики:номер куска»). */
const openBd = ref<Set<string>>(new Set())
function toggleBd(key: string) {
  const next = new Set(openBd.value)
  if (!next.delete(key)) next.add(key)
  openBd.value = next
}
const draft = ref('')
/** Последняя реплика ученика: под ней спрашиваем «верно услышал?». */
const lastUser = computed(() => {
  for (let i = store.lines.length - 1; i >= 0; i--) if (store.lines[i]!.role === 'user') return i
  return -1
})
function fix(i: number) {
  store.fixing = i
  draft.value = store.lines[i]?.text ?? ''
}
function submit() {
  const t = draft.value.trim()
  if (!t) return
  if (store.fixing >= 0) store.fixLine(store.fixing, t)
  else store.sendText(t)
  draft.value = ''
}
const holdKey = (e: KeyboardEvent, down: boolean) => {
  if (e.key !== ' ' && e.key !== 'Enter') return
  e.preventDefault()
  if (down) {
    if (!e.repeat) store.holdStart()
  } else store.holdEnd()
}

const dateText = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

async function removeItem(id: string) {
  if (!(await askConfirm({ title: 'Удалить разговор?', text: 'Расшифровка будет стёрта. Потраченные сегодня минуты не вернутся.', ok: 'Удалить', danger: true }))) return
  try {
    await store.removeItem(id)
    toast.ok('Разговор удалён')
  } catch (e) {
    toast.error(errText(e))
  }
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') store.open = false
}
</script>

<template>
  <div v-if="show" class="vp-root">
    <!-- мини-плашка: виден разговор, а окно закрыто -->
    <Transition name="vp-mini">
      <div v-if="store.live && !store.open" class="vp-mini" role="group" aria-label="Голосовой разговор идёт">
        <i class="vp-dot" aria-hidden="true"></i>
        <div class="vp-mini-text"><b>{{ moodText }}</b><small>{{ mmss(store.elapsed) }} · осталось {{ mmss(store.left) }}</small></div>
        <button v-if="!store.ptt" type="button" class="vp-ic" :class="{ off: store.muted }" :aria-pressed="store.muted" :aria-label="store.muted ? 'Включить микрофон' : 'Выключить микрофон'" @click="store.toggleMute()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /><path v-if="store.muted" d="M4 4l16 16" /></svg>
        </button>
        <button type="button" class="vp-ic" aria-label="Развернуть окно разговора" title="Развернуть" @click="store.open = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M5 6h14M5 18h14" /></svg>
        </button>
        <button type="button" class="vp-ic vp-stop" aria-label="Закончить разговор" title="Закончить" @click="store.stop()">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        </button>
      </div>
    </Transition>

    <Teleport to="body">
      <Transition name="vp-panel">
        <aside v-if="store.open" ref="panel" class="vp-panel" :style="panelW ? { width: panelW + 'px' } : undefined" role="dialog" aria-label="Голосовой собеседник" @keydown="onKey">
          <div ref="grip" class="vp-grip" title="Потяни, чтобы изменить ширину (двойное нажатие: обычная)" aria-hidden="true" @dblclick="resetWidth"><i></i></div>
          <header class="vp-head">
            <img :src="IMG.mic" alt="" class="vp-hico" />
            <div class="vp-ht">
              <h2>음성 대화</h2>
              <p>Практикуй устную речь на корейском</p>
            </div>
            <button type="button" class="vp-ic" aria-label="Закрыть окно (разговор продолжится)" title="Закрыть окно" @click="store.open = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div class="vp-tabs" role="tablist" aria-label="Вкладки">
            <button type="button" role="tab" :aria-selected="store.tab === 'talk'" :class="{ on: store.tab === 'talk' }" @click="store.tab = 'talk'"><img :src="IMG.chat" alt="" />Разговор</button>
            <button type="button" role="tab" :aria-selected="store.tab === 'history'" :class="{ on: store.tab === 'history' }" @click="store.tab = 'history'"><img :src="IMG.history" alt="" />История</button>
          </div>

          <template v-if="store.tab === 'talk'">
            <div v-if="!store.live && !store.lines.length" class="vp-hero">
              <img :src="IMG.banner" alt="" />
              <div class="vp-cloud">
                <img :src="IMG.wave" alt="" />
                <template v-if="store.status && !store.status.configured"><b>Голос не подключён</b><small>На сервере нет ключа OpenAI (docs/voice.md).</small></template>
                <template v-else><b>Здесь появится текст разговора.</b><small>Он сохраняется, его можно открыть во вкладке «История».</small></template>
              </div>
            </div>
            <div v-if="store.live || store.lines.length" ref="log" class="vp-log vp-log-scene" :style="{ '--vp-scene': `url(${IMG.scene})` }" aria-live="polite">
              <div v-for="(l, i) in store.lines" :key="i" class="vp-msg" :class="l.role">
                <div class="vp-line" :class="[l.role, { wrong: l.wrong }]">
                  <template v-if="l.role === 'assistant'">
                    <template v-for="(p, j) in splitKorean(l.text)" :key="j">
                      <button v-if="p.ko" type="button" class="vp-ko" :class="{ on: openBd.has(`${i}:${j}`) }" title="Разобрать по частям" @click="toggleBd(`${i}:${j}`)">{{ p.text }}</button>
                      <span v-else>{{ p.text }}</span>
                    </template>
                  </template>
                  <template v-else>{{ l.text }}</template>
                </div>
                <template v-if="l.role === 'assistant'">
                  <template v-for="(p, j) in splitKorean(l.text)" :key="j">
                    <div v-if="p.ko && openBd.has(`${i}:${j}`)" class="vp-bd"><SentenceBreakdown :sentence="koreanOnly(p.text)" /></div>
                  </template>
                </template>
                <div v-if="i === lastUser && store.live && !l.ok && !l.wrong && store.fixing !== i" class="vp-chk">
                  <span>Верно услышал?</span>
                  <button type="button" @click="l.ok = true">Да</button>
                  <button type="button" @click="fix(i)">Нет</button>
                </div>
              </div>
            </div>

            <div v-if="!store.live" class="vp-scenes">
              <p class="vp-sub"><img :src="IMG.list" alt="" />Тема разговора</p>
              <div class="vp-chips">
                <button v-for="sc in store.status?.scenes ?? []" :key="sc.id" type="button" class="vp-chip" :class="{ on: store.scene === sc.id }" :aria-pressed="store.scene === sc.id" @click="store.scene = sc.id">
                  <img :src="sceneIcon(sc.id)" alt="" />
                  <span><b>{{ sc.title }}</b><small>{{ sc.hint }}</small></span>
                  <img v-if="store.scene === sc.id" :src="IMG.check" alt="" class="vp-tick" />
                </button>
              </div>
            </div>

            <form v-if="store.live" class="vp-type" @submit.prevent="submit">
              <input v-model="draft" type="text" maxlength="300" :placeholder="store.fixing >= 0 ? 'Напиши, как должно быть' : 'Или напиши ответ текстом'" autocomplete="off" />
              <button v-if="store.fixing >= 0" type="button" class="vp-ic" aria-label="Отменить исправление" @click="((store.fixing = -1), (draft = ''))">×</button>
              <button type="submit" class="vp-ic" :disabled="!draft.trim()" aria-label="Отправить">→</button>
            </form>

            <div class="vp-prow">
              <label v-if="!store.live" class="vp-ptt"><input v-model="store.ptt" type="checkbox" /> Говорить, удерживая кнопку (без перебиваний и эха)</label>
              <button
                type="button"
                class="vp-go"
                :class="{ rec: store.ptt && store.talking, off: store.live && !store.ptt && store.muted, hold: store.live && store.ptt }"
                :disabled="store.phase === 'connecting' || (!store.live && !canStart) || (store.live && store.phase !== 'live')"
                :aria-label="store.live ? goLabel : 'Начать разговор'"
                @pointerdown="goDown"
                @pointerup="store.holdEnd()"
                @pointercancel="store.holdEnd()"
                @pointerleave="store.holdEnd()"
                @keydown="goKey($event, true)"
                @keyup="goKey($event, false)"
                @contextmenu.prevent
                @click="goClick"
              >{{ goLabel }}</button>
              <button v-if="store.live" type="button" class="vp-go vp-end" :disabled="store.phase === 'connecting'" @click="store.stop()">Закончить</button>
            </div>

            <footer class="vp-foot">
              <div class="vp-bar"><i :style="{ width: usedPct + '%' }"></i></div>
              <p v-if="store.status" class="vp-fl">
                <img :src="IMG.clock" alt="" />Осталось {{ store.live ? mmss(store.left) : `${leftMin} мин` }} из {{ limitMin }} мин · потрачено сегодня {{ money(store.status.usedSec + (store.live ? store.elapsed : 0)) }}
              </p>
              <p v-if="store.loadError" class="vp-err">Не получилось узнать остаток: {{ store.loadError }}</p>
            </footer>
          </template>

          <div v-else class="vp-hist">
            <template v-if="!store.opened">
              <ul v-if="store.history.length" class="vp-list">
                <li v-for="h in store.history" :key="h.id">
                  <button type="button" class="vp-item" @click="store.openItem(h.id)">
                    <b>{{ dateText(h.started) }}</b>
                    <small>{{ mmss(h.seconds) }} · реплик: {{ h.messages }}{{ h.live ? ' · идёт' : '' }}</small>
                    <span v-if="h.preview">{{ h.preview }}</span>
                  </button>
                  <button type="button" class="vp-ic vp-del" aria-label="Удалить разговор" title="Удалить" @click="removeItem(h.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                  </button>
                </li>
              </ul>
              <p v-else class="vp-hint">Разговоров пока нет.</p>
            </template>
            <template v-else>
              <button type="button" class="vp-back" @click="store.opened = null">← К списку</button>
              <p class="vp-when">{{ dateText(store.opened.started) }} · {{ mmss(store.opened.seconds) }}</p>
              <div class="vp-log vp-log-old">
                <p v-if="!store.opened.lines.length" class="vp-hint">Текст стёрт или не успел сохраниться.</p>
                <div v-for="(l, i) in store.opened.lines" :key="i" class="vp-line" :class="l.role">{{ l.text }}</div>
              </div>
            </template>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* Голосовой собеседник: окно в стиле музыкального плеера (светлая панель справа, розовые кнопки); классы с префиксом vp- */
.vp-root, .vp-panel { --vp-pink: #e86bc0; --vp-pink-d: #d64da9; --vp-ink: #2b2a5c; --vp-muted: #8a86b8; --vp-line: #eadff7; }
.vp-panel { position: fixed; z-index: 48; top: 12px; right: 12px; bottom: 12px; width: min(clamp(380px, 55vw, 900px), calc(100vw - 24px)); display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 14px; overflow: hidden;
  color: var(--vp-ink); background: linear-gradient(165deg, #fff7fd 0%, #f1efff 100%); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 24px 60px rgba(70, 55, 140, .35); }
.vp-panel-enter-active, .vp-panel-leave-active { transition: transform .3s cubic-bezier(.2, .8, .2, 1), opacity .25s; }
.vp-panel-enter-from, .vp-panel-leave-to { transform: translateX(32px); opacity: 0; }
.vp-head { display: flex; align-items: center; gap: 10px; }
.vp-head h2 { margin: 0; flex: 1; font-size: 19px; font-weight: 700; }
.vp-ic { position: relative; width: 40px; height: 40px; display: grid; place-items: center; padding: 8px; cursor: pointer; color: var(--vp-ink); background: rgba(255, 255, 255, .7); border: 1px solid #fff; border-radius: 50%; flex: none; transition: transform .15s, background .15s; }
.vp-ic svg { width: 100%; height: 100%; pointer-events: none; }
.vp-ic:hover:not(:disabled) { transform: scale(1.08); }
.vp-ic:disabled { opacity: .45; cursor: default; }
.vp-ic.off { color: #c0392b; }
.vp-tabs { display: flex; gap: 8px; flex: none; }
.vp-tabs button { padding: 9px 18px; font: inherit; font-size: 14px; font-weight: 700; color: var(--vp-muted); cursor: pointer; background: rgba(255, 255, 255, .7); border: 1px solid #fff; border-radius: 99px; transition: color .15s, background .15s; }
.vp-tabs button:hover { color: var(--vp-pink-d); }
.vp-tabs button.on { color: #fff; background: linear-gradient(100deg, var(--vp-pink), var(--vp-pink-d)); box-shadow: 0 6px 14px rgba(214, 77, 169, .3); }

.vp-log { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; }
.vp-hint { margin: auto; max-width: 320px; text-align: center; font-size: 14px; line-height: 1.5; color: var(--vp-muted); }
.vp-line { max-width: 86%; padding: 9px 14px; font-size: 15px; line-height: 1.45; border-radius: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
.vp-line.user { align-self: flex-end; color: #fff; background: linear-gradient(100deg, var(--vp-pink), var(--vp-pink-d)); border-bottom-right-radius: 6px; }
.vp-line.assistant { align-self: flex-start; background: #fff; border: 1px solid var(--vp-line); border-bottom-left-radius: 6px; }

.vp-panel { max-width: calc(100vw - 24px); }
.vp-grip { position: absolute; z-index: 3; left: 0; top: 0; bottom: 0; width: 16px; display: flex; align-items: center; justify-content: center; cursor: ew-resize; touch-action: none; user-select: none; -webkit-user-select: none; }
.vp-grip i { width: 4px; height: 56px; border-radius: 4px; background: var(--vp-pink); opacity: .35; transition: opacity .15s, height .15s; }
.vp-grip:hover i { opacity: .9; height: 84px; }
.vp-hico { width: 46px; height: 46px; flex: none; object-fit: contain; }
.vp-ht { flex: 1; min-width: 0; }
.vp-ht h2 { flex: none; line-height: 1.1; }
.vp-ht p { margin: 2px 0 0; font-size: 13px; color: var(--vp-muted); }
.vp-tabs button { display: inline-flex; align-items: center; gap: 8px; }
.vp-tabs button img { width: 20px; height: 20px; object-fit: contain; }
.vp-tabs button.on img { filter: brightness(0) invert(1); }
.vp-hero { flex: none; }
.vp-hero > img { display: block; width: 100%; height: auto; }
.vp-cloud { position: relative; margin: -16px 6% 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 18px 12px; text-align: center; background: rgba(255, 255, 255, .88); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 10px 26px rgba(150, 110, 200, .22); backdrop-filter: blur(4px); }
.vp-cloud img { width: 34px; height: 22px; object-fit: contain; }
.vp-cloud b { font-size: 15px; }
.vp-cloud small { font-size: 12px; color: var(--vp-muted); }
.vp-log-scene { padding: 10px; border-radius: 20px; background: linear-gradient(rgba(255, 247, 253, .78), rgba(241, 239, 255, .84)), var(--vp-scene) center / cover; border: 1px solid #fff; }
.vp-sub { display: flex; align-items: center; gap: 8px; }
.vp-sub img { width: 22px; height: 22px; object-fit: contain; }
.vp-scenes .vp-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.vp-scenes .vp-chip { position: relative; flex-direction: row; align-items: center; gap: 10px; }
.vp-scenes .vp-chip > img:first-child { width: 38px; height: 38px; flex: none; object-fit: contain; }
.vp-scenes .vp-chip span { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.vp-tick { position: absolute; top: -8px; right: -6px; width: 24px; height: 24px; object-fit: contain; }
.vp-prow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; }
.vp-go.hold { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; padding: 12px 18px; font-size: 13px; }
.vp-go.rec { color: #fff; background: linear-gradient(140deg, #ef7a8c, #d6455d); border-color: #d6455d; animation: vp-pulse 1.2s ease-in-out infinite; }
.vp-go.off { color: #c0392b; }
.vp-go.vp-end { color: #fff; background: #d6455d; border-color: #d6455d; }
.vp-prow .vp-go:not(.vp-end) { flex: 1 1 auto; }
.vp-go { padding: 8px 16px; font: inherit; font-size: 12px; font-weight: 700; color: var(--vp-pink-d); cursor: pointer; white-space: nowrap; background: rgba(255, 255, 255, .85); border: 1px solid var(--vp-line); border-radius: 99px; transition: background .15s, transform .15s; }
.vp-go:hover:not(:disabled) { background: #fff; transform: translateY(-1px); }
.vp-go:disabled { opacity: .5; cursor: default; }
.vp-fl { display: flex; align-items: center; gap: 8px; }
.vp-fl img { width: 20px; height: 20px; object-fit: contain; }
.vp-msg { display: flex; flex-direction: column; gap: 4px; max-width: 92%; }
.vp-msg.user { align-self: flex-end; align-items: flex-end; }
.vp-msg.assistant { align-self: flex-start; }
.vp-msg .vp-line { max-width: 100%; }
.vp-line.wrong { opacity: .5; text-decoration: line-through; }
.vp-ko { display: inline; padding: 0 4px; margin: 0 1px; font: inherit; font-size: 19px; font-weight: 700; color: var(--vp-pink-d); cursor: pointer; background: rgba(232, 107, 192, .1); border: 0; border-radius: 8px; }
.vp-ko:hover, .vp-ko.on { background: rgba(232, 107, 192, .22); }
.vp-bd { max-width: 100%; padding: 8px; background: #fff; border: 1px solid var(--vp-line); border-radius: 14px; overflow-x: auto; }
.vp-chk { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--vp-muted); }
.vp-chk button { padding: 3px 12px; font: inherit; font-size: 12px; font-weight: 700; color: var(--vp-pink-d); cursor: pointer; background: rgba(255, 255, 255, .8); border: 1px solid var(--vp-line); border-radius: 99px; }
.vp-scenes { flex: none; margin-top: auto; display: flex; flex-direction: column; gap: 8px; max-height: 38%; overflow-y: auto; }
.vp-sub { margin: 0; font-size: 12px; font-weight: 700; color: var(--vp-muted); }
.vp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vp-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 7px 12px; font: inherit; text-align: left; color: inherit; cursor: pointer; background: rgba(255, 255, 255, .7); border: 1px solid #fff; border-radius: 14px; }
.vp-chip b { font-size: 13px; }
.vp-chip small { font-size: 11px; color: var(--vp-muted); }
.vp-chip.on { border-color: var(--vp-pink); background: #fff; box-shadow: 0 0 0 2px rgba(232, 107, 192, .25); }
.vp-ptt { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--vp-muted); }
.vp-type { flex: none; display: flex; gap: 6px; align-items: center; }
.vp-type input { flex: 1 1 auto; min-width: 0; padding: 10px 14px; font: inherit; font-size: 14px; color: inherit; background: rgba(255, 255, 255, .85); border: 1px solid var(--vp-line); border-radius: 99px; }
.vp-type .vp-ic { width: 38px; height: 38px; font-size: 18px; padding: 0; }
@keyframes vp-pulse { 50% { box-shadow: 0 0 0 10px rgba(214, 69, 93, .18), 0 10px 24px rgba(214, 69, 93, .4); } }

.vp-foot { flex: none; padding-top: 10px; border-top: 1px solid var(--vp-line); }
.vp-foot p { margin: 6px 0 0; font-size: 12px; color: var(--vp-muted); }
.vp-bar { height: 5px; border-radius: 5px; background: var(--vp-line); overflow: hidden; }
.vp-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--vp-pink), var(--vp-pink-d)); transition: width .4s; }
.vp-err { color: #c0392b !important; }

.vp-hist { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.vp-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.vp-list li { display: flex; align-items: center; gap: 8px; }
.vp-item { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 14px; font: inherit; text-align: left; color: inherit; cursor: pointer; background: rgba(255, 255, 255, .7); border: 1px solid #fff; border-radius: 16px; }
.vp-item:hover { background: #fff; }
.vp-item b { font-size: 14px; }
.vp-item small { font-size: 12px; color: var(--vp-muted); }
.vp-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.vp-del { width: 34px; height: 34px; padding: 7px; color: #c0392b; }
.vp-back { align-self: flex-start; padding: 6px 4px; font: inherit; font-size: 14px; font-weight: 700; color: var(--vp-pink-d); background: none; border: 0; cursor: pointer; }
.vp-when { margin: 0; font-size: 12px; color: var(--vp-muted); }
.vp-log-old { flex: 1 1 auto; }

/* мини-плашка по центру у самого верха, как мини-плеер, но чуть левее него не мешает: стоит выше */
.vp-mini { position: fixed; top: 12px; left: 0; right: 0; margin-inline: auto; width: max-content; z-index: 42; display: flex; align-items: center; gap: 8px; max-width: min(380px, calc(100vw - 24px)); padding: 6px 10px 6px 14px;
  color: var(--vp-ink); background: rgba(255, 255, 255, .95); border: 1px solid #fff; border-radius: 30px; box-shadow: 0 10px 26px rgba(100, 87, 170, .25); }
.vp-dot { width: 10px; height: 10px; flex: none; border-radius: 50%; background: #d6455d; animation: vp-blink 1.2s ease-in-out infinite; }
.vp-mini-text { display: flex; flex-direction: column; min-width: 0; font-size: 13px; line-height: 1.25; }
.vp-mini-text small { color: var(--vp-muted); font-size: 11px; }
.vp-mini .vp-ic { width: 32px; height: 32px; padding: 6px; }
.vp-stop { color: #fff; background: #d6455d; border-color: #d6455d; }
.vp-mini-enter-active, .vp-mini-leave-active { transition: opacity .2s, transform .2s; }
.vp-mini-enter-from, .vp-mini-leave-to { opacity: 0; transform: translateY(-14px); }
@keyframes vp-blink { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .vp-panel-enter-active, .vp-panel-leave-active, .vp-mini-enter-active, .vp-mini-leave-active { transition: none; } .vp-go.rec, .vp-dot { animation: none; } }

html[data-theme='dark'] .vp-root, html[data-theme='dark'] .vp-panel { --vp-ink: #ece9ff; --vp-muted: #a49fd6; --vp-line: #3b3866; }
html[data-theme='dark'] .vp-panel { background: linear-gradient(165deg, #2b2450 0%, #1f1e42 100%); border-color: #3b3866; }
html[data-theme='dark'] .vp-mini { background: rgba(43, 36, 80, .95); border-color: #3b3866; }
html[data-theme='dark'] .vp-ic, html[data-theme='dark'] .vp-item { background: rgba(255, 255, 255, .08); border-color: #3b3866; }
html[data-theme='dark'] .vp-stop { background: #d6455d; border-color: #d6455d; }
html[data-theme='dark'] .vp-tabs button:not(.on) { background: rgba(255, 255, 255, .08); border-color: #3b3866; }
html[data-theme='dark'] .vp-bd { background: #2b2450; border-color: #3b3866; }
html[data-theme='dark'] .vp-cloud, html[data-theme='dark'] .vp-chip { background: rgba(43, 36, 80, .85); border-color: #3b3866; }
html[data-theme='dark'] .vp-log-scene { background: linear-gradient(rgba(31, 30, 66, .82), rgba(31, 30, 66, .88)), var(--vp-scene) center / cover; border-color: #3b3866; }
html[data-theme='dark'] .vp-line.assistant { background: #2b2450; border-color: #3b3866; }
</style>

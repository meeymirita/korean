import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { splitKorean } from '@/lib/voiceText'
import { usePersisted } from '@/composables/usePersisted'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Состояние сервера: ключ, лимит и остаток минут за сегодня (`GET /api/voice`). */
export interface VoiceStatus {
  configured: boolean
  model: string
  limitSec: number
  maxSessionSec: number
  usedSec: number
  leftSec: number
  costPerMin: number
  costToday: number
  scenes?: { id: string; title: string; hint: string }[]
  /** Подключённые бесплатные модели и есть ли Whisper (Groq): без них бесплатный режим недоступен. */
  providers?: { id: string; title: string; model: string }[]
  whisper?: boolean
  /** Есть ли озвучка Gemini и какие голоса можно выбрать. */
  tts?: boolean
  ttsVoices?: string[]
}

export interface VoiceLine {
  role: 'user' | 'assistant'
  text: string
  /** Номер реплики в OpenAI (нужен, чтобы убрать неверно услышанную). */
  itemId?: string
  /** Ученик отметил: услышано неверно / верно. */
  wrong?: boolean
  ok?: boolean
  /** Ответ другой (текстовой) модели на вопрос ученика: показывается отдельной карточкой, на сервер не сохраняется. */
  other?: boolean
  /** Вопрос, на который отвечала другая модель, и какая именно. */
  asked?: string
  by?: string
  /** Проверка ответа другой (или той же) моделью. */
  check?: { provider: string; text: string }
  /** Кто из выбранных моделей отказал и почему (ответила запасная). */
  note?: string
}

/** Разговор в истории (список без текста). */
export interface VoiceItem {
  id: string
  started: number
  seconds: number
  messages: number
  preview: string
  live: boolean
}

export type VoicePhase = 'idle' | 'connecting' | 'live'
/** Что происходит в разговоре: слушаю ученика, ждёт ответа, отвечает голосом. */
export type VoiceMood = 'listening' | 'thinking' | 'speaking'

/** Голосовой собеседник доступен только владельцу с токеном (гостю и без входа кнопки и окна нет). */
export function useVoiceAvailable() {
  const progress = useProgressStore()
  return computed(() => progress.unlocked && !progress.isGuest)
}

/** Без слов дольше минуты разговор заканчивается сам (экономим минуты и закрываем микрофон). */
const IDLE_MS = 60_000

/** Что и откуда читаем в событиях Realtime: готовая расшифровка речи ученика и ответа. */
export function lineFromEvent(ev: unknown): VoiceLine | null {
  const e = (ev ?? {}) as { type?: unknown; transcript?: unknown; item_id?: unknown }
  const text = typeof e.transcript === 'string' ? e.transcript.replace(/\s+/g, ' ').trim() : ''
  if (!text) return null
  const itemId = typeof e.item_id === 'string' ? e.item_id : undefined
  if (e.type === 'conversation.item.input_audio_transcription.completed') return itemId ? { role: 'user', text, itemId } : { role: 'user', text }
  if (e.type === 'response.output_audio_transcript.done') return { role: 'assistant', text }
  return null
}

/** «7:05» из секунд. */
export const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`

/**
 * Голосовой собеседник. Соединение (микрофон и звук ответа) живёт в этом хранилище, а не в странице: переход между страницами разговор не прерывает,
 * закрытие окна тоже (пока идёт разговор, сверху мини-плашка с таймером). Звук идёт из браузера прямо в OpenAI (WebRTC), сервер выдаёт временный ключ,
 * считает минуты и хранит расшифровки (`docs/voice.md`).
 */
export const useVoiceStore = defineStore('voice', () => {
  const progress = useProgressStore()
  const toast = useToastStore()

  const open = ref(false)
  const tab = ref<'talk' | 'history'>('talk')
  const status = ref<VoiceStatus | null>(null)
  const loadError = ref('')
  const phase = ref<VoicePhase>('idle')
  const mood = ref<VoiceMood>('listening')
  /** Сценка разговора (`GET /api/voice` → `scenes`) и режим «удерживай и говори». */
  const scene = usePersisted('voice_scene', 'free')
  const ptt = usePersisted('voice_ptt', true)
  /** Чем разговариваем: `openai` (голос OpenAI, платно) или `free` (Groq Whisper слышит, бесплатная модель отвечает, озвучивает браузер). */
  const engine = usePersisted<'openai' | 'free'>('voice_engine', 'openai', v => v === 'openai' || v === 'free')
  /** Какая бесплатная модель отвечает ('' = первая из подключённых) и кто проверяет ответ. */
  const provider = usePersisted('voice_provider', '')
  const check = usePersisted<'none' | 'cross' | 'self'>('voice_check', 'none', v => v === 'none' || v === 'cross' || v === 'self')
  /** Чем озвучивать ответы в бесплатном режиме: голосом Gemini (приятнее) или голосом браузера, и какой голос Gemini. */
  const voiceOut = usePersisted<'gemini' | 'browser'>('voice_out', 'gemini', v => v === 'gemini' || v === 'browser')
  const ttsVoice = usePersisted('voice_tts', 'Kore')
  /** На каком языке ученик говорит (для распознавания): `ko` и `ru` подсказывают Whisper язык, `auto` пробует оба. Корейская речь с русским акцентом в `auto` иногда записывается русскими буквами. */
  const speechLang = usePersisted<'auto' | 'ko' | 'ru'>('voice_lang', 'auto', v => v === 'auto' || v === 'ko' || v === 'ru')
  function setEngine(v: 'openai' | 'free') {
    engine.value = v
    if (v === 'free') ptt.value = true
  }
  /** Идёт ли сейчас удержание кнопки (говорит ученик). */
  const talking = ref(false)
  /** Номер реплики ученика, которую он исправляет (-1: никакую). */
  const fixing = ref(-1)
  const muted = ref(false)
  const elapsed = ref(0)
  const lines = ref<VoiceLine[]>([])
  const history = ref<VoiceItem[]>([])
  /** Разборы разговоров по номеру разговора, номер того, что идёт сейчас, и последнего оконченного. */
  const reviews = ref<Record<string, string>>({})
  const reviewing = ref('')
  const lastId = ref('')
  const opened = ref<{ id: string; started: number; seconds: number; lines: VoiceLine[] } | null>(null)

  const live = computed(() => phase.value === 'live' || phase.value === 'connecting')
  /** Сколько секунд ещё можно говорить: остаток за сегодня минус то, что идёт сейчас, и не больше предела одного разговора. */
  const maxSec = ref(0)
  const left = computed(() => Math.max(0, (live.value ? maxSec.value : (status.value?.leftSec ?? 0)) - (live.value ? elapsed.value : 0)))

  const headers = () => ({ Authorization: `Bearer ${progress.bearer}` })
  const jsonHeaders = () => ({ ...headers(), 'Content-Type': 'application/json' })

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchT(`/api/voice${path}`, { ...init, headers: init.body ? jsonHeaders() : headers() })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
      if ((path === '/ask' || path === '/transcribe' || path.endsWith('/review')) && typeof body.message === 'string') throw new Error(body.message)
      if (res.status === 503) throw new Error('голос не подключён: на сервере нет ключа OpenAI')
      if (res.status === 429) throw new Error(body.error === 'daily limit' ? 'минуты на сегодня закончились' : 'OpenAI просит подождать, попробуй позже')
      if (res.status === 502) throw new Error('OpenAI не ответил или не принял ключ')
      throw new Error(`ошибка сервера ${res.status}`)
    }
    return (await res.json()) as T
  }

  async function load() {
    try {
      status.value = await api<VoiceStatus>('')
      loadError.value = ''
    } catch (e) {
      loadError.value = errText(e)
    }
  }

  async function loadHistory() {
    try {
      history.value = (await api<{ sessions: VoiceItem[] }>('/sessions')).sessions
    } catch (e) {
      toast.error(errText(e))
    }
  }

  async function openItem(id: string) {
    try {
      const d = await api<{ id: string; review?: string; started: number; seconds: number; messages: { role: 'user' | 'assistant'; text: string }[] }>(`/sessions/${id}`)
      if (d.review) reviews.value = { ...reviews.value, [id]: d.review }
      opened.value = { id: d.id, started: d.started, seconds: d.seconds, lines: d.messages.map(m => ({ role: m.role, text: m.text })) }
    } catch (e) {
      toast.error(errText(e))
    }
  }

  async function removeItem(id: string) {
    await api(`/sessions/${id}`, { method: 'DELETE' })
    if (opened.value?.id === id) opened.value = null
    history.value = history.value.filter(h => h.id !== id)
  }

  /* ---------- разговор ---------- */
  let pc: RTCPeerConnection | null = null
  let stream: MediaStream | null = null
  let channel: RTCDataChannel | null = null
  let audio: HTMLAudioElement | null = null
  let sessionId = ''
  let timer: ReturnType<typeof setInterval> | null = null
  let recorder: MediaRecorder | null = null
  let meter: { stop: () => number } | null = null
  let chunks: Blob[] = []
  let startedAt = 0
  let lastActivity = 0

  function cleanup() {
    if (timer) clearInterval(timer)
    timer = null
    talking.value = false
    fixing.value = -1
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    recorder = null
    meter?.stop()
    meter = null
    stopSpeaking()
    channel?.close()
    pc?.close()
    stream?.getTracks().forEach(t => t.stop())
    if (audio) audio.srcObject = null
    channel = pc = stream = audio = null
  }

  /** Расшифровку сохраняет сервер; ошибка сохранения разговор не прерывает. */
  function keep(line: VoiceLine) {
    lines.value.push(line)
    if (!sessionId) return
    void fetchT(`/api/voice/sessions/${sessionId}/messages`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ role: line.role, text: line.text }) }).catch(() => {})
  }

  function onEvent(raw: string) {
    lastActivity = Date.now()
    let ev: { type?: string }
    try {
      ev = JSON.parse(raw)
    } catch {
      return
    }
    const line = lineFromEvent(ev)
    if (line) keep(line)
    if (ev.type === 'input_audio_buffer.speech_started') mood.value = 'listening'
    else if (ev.type === 'input_audio_buffer.speech_stopped' || ev.type === 'response.created') mood.value = 'thinking'
    else if (ev.type === 'output_audio_buffer.started' || ev.type === 'response.output_audio.delta') mood.value = 'speaking'
    else if (ev.type === 'response.done' || ev.type === 'output_audio_buffer.stopped') mood.value = 'listening'
  }

  /** Секундомер разговора: конец по времени и после минуты полной тишины. */
  function startTimer() {
    startedAt = lastActivity = Date.now()
    timer = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startedAt) / 1000)
      if (elapsed.value >= maxSec.value) {
        toast.ok('Время разговора вышло')
        void stop()
      } else if (Date.now() - lastActivity > IDLE_MS) {
        toast.ok('Долго тишина, разговор закончен')
        void stop()
      }
    }, 1000)
  }

  async function start() {
    if (live.value) return
    if (engine.value === 'free') return startFree()
    if (!navigator.mediaDevices?.getUserMedia) return void toast.error('Браузер не даёт доступ к микрофону (нужен https)')
    phase.value = 'connecting'
    lines.value = []
    muted.value = false
    elapsed.value = 0
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(() => {
        throw new Error('нет доступа к микрофону: разреши его в настройках браузера для этого сайта')
      })
      const s = await api<{ id: string; secret: string; callsUrl: string; maxSec: number } & VoiceStatus>('/sessions', { method: 'POST', body: JSON.stringify({ scene: scene.value, ptt: ptt.value }) })
      sessionId = s.id
      maxSec.value = s.maxSec
      status.value = s
      pc = new RTCPeerConnection()
      audio = new Audio()
      audio.autoplay = true
      pc.ontrack = e => {
        if (audio) audio.srcObject = e.streams[0] ?? null
      }
      pc.onconnectionstatechange = () => {
        if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && phase.value === 'live') {
          toast.error('Связь с голосом оборвалась')
          void stop()
        }
      }
      // «удерживай и говори»: микрофон закрыт, пока кнопка не нажата
      if (ptt.value) stream.getAudioTracks().forEach(t => (t.enabled = false))
      for (const t of stream.getTracks()) pc.addTrack(t, stream)
      channel = pc.createDataChannel('oai-events')
      channel.onmessage = e => onEvent(String(e.data))
      channel.onopen = () => {
        // собеседник начинает сам: короткое приветствие по-корейски
        channel?.send(JSON.stringify({ type: 'response.create' }))
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const answer = await fetchT(s.callsUrl, { method: 'POST', headers: { Authorization: `Bearer ${s.secret}`, 'Content-Type': 'application/sdp' }, body: offer.sdp }, 30_000)
      if (!answer.ok) throw new Error(`OpenAI не принял соединение (${answer.status})`)
      await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() })
      phase.value = 'live'
      mood.value = 'thinking'
      startTimer()
    } catch (e) {
      const id = sessionId
      cleanup()
      phase.value = 'idle'
      sessionId = ''
      toast.error(errText(e))
      if (id) void fetchT(`/api/voice/sessions/${id}/end`, { method: 'POST', headers: headers() }).catch(() => {})
      void load()
    }
  }

  async function stop() {
    if (phase.value === 'idle') return
    const id = sessionId
    cleanup()
    phase.value = 'idle'
    sessionId = ''
    if (id) lastId.value = id
    if (id) {
      try {
        status.value = await api<VoiceStatus>(`/sessions/${id}/end`, { method: 'POST' })
      } catch {
        void load()
      }
    }
    if (tab.value === 'history') void loadHistory()
  }

  /** «Спросить другую модель»: последний вопрос ученика с несколькими репликами до него уходит в бесплатную модель помощника-чата (OpenRouter), ответ добавляется карточкой. */
  const asking = ref(false)
  async function askOther() {
    if (asking.value) return
    let li = -1
    for (let i = lines.value.length - 1; i >= 0; i--) {
      const l = lines.value[i]!
      if (l.role === 'user' && !l.wrong) {
        li = i
        break
      }
    }
    if (li < 0) return
    const asked = lines.value[li]!.text
    const ctx = lines.value.slice(0, li + 1).filter(l => !l.other && !l.wrong).slice(-8)
    asking.value = true
    try {
      const r = await api<{ text: string; provider: string; check: { provider: string; text: string } | null; failed?: string[] }>('/ask', {
        method: 'POST',
        body: JSON.stringify({ messages: ctx.map(l => ({ role: l.role, text: l.text.slice(0, 1500) })), provider: provider.value, check: check.value, scene: scene.value }),
      })
      lines.value.push({ role: 'assistant', text: r.text, other: true, asked, by: r.provider, ...(r.check ? { check: r.check } : {}), ...(r.failed?.length ? { note: r.failed.join('; ') } : {}) })
    } catch (e) {
      toast.error(errText(e))
    } finally {
      asking.value = false
    }
  }

  /** Разбор разговора текстовой моделью (по сохранённой расшифровке). */
  async function runReview(id: string, force = false) {
    if (reviewing.value) return
    reviewing.value = id
    try {
      const res = await fetchT(`/api/voice/sessions/${id}/review`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ force, provider: provider.value || undefined }) }, 90_000)
      if (!res.ok) {
        const why: Record<number, string> = { 400: 'в разговоре нет твоих реплик, разбирать нечего', 429: 'модель просит подождать, попробуй чуть позже', 502: 'модель разбора сейчас не отвечает, попробуй позже', 503: 'разбор не подключён: на сервере нет ключа помощника (OPENROUTER_API_KEY)' }
        throw new Error(why[res.status] ?? `ошибка сервера ${res.status}`)
      }
      reviews.value = { ...reviews.value, [id]: ((await res.json()) as { review: string }).review }
    } catch (e) {
      toast.error(errText(e))
    } finally {
      reviewing.value = ''
    }
  }

  const send = (o: object) => channel?.send(JSON.stringify(o))
  let holdAt = 0

  /** Кнопка нажата: собеседник замолкает, микрофон открыт, запись начинается с чистого листа. */
  function holdStart() {
    if (phase.value !== 'live' || !ptt.value || talking.value) return
    talking.value = true
    holdAt = Date.now()
    if (engine.value === 'free') {
      stopSpeaking()
      try {
        chunks = []
        meter = startMeter(stream!)
        recorder = new MediaRecorder(stream!)
        recorder.ondataavailable = e => e.data.size && chunks.push(e.data)
        recorder.start()
      } catch {
        talking.value = false
        recorder = null
        return void toast.error('Не получилось начать запись')
      }
      mood.value = 'listening'
      lastActivity = Date.now()
      return
    }
    send({ type: 'response.cancel' })
    send({ type: 'output_audio_buffer.clear' })
    send({ type: 'input_audio_buffer.clear' })
    stream?.getAudioTracks().forEach(t => (t.enabled = true))
    mood.value = 'listening'
    lastActivity = Date.now()
  }

  /** Кнопка отпущена: микрофон закрыт, запись отправлена, собеседник отвечает. Слишком короткое нажатие отбрасывается. */
  function holdEnd() {
    if (!talking.value) return
    talking.value = false
    if (engine.value === 'free') {
      const rec = recorder
      recorder = null
      const loud = meter?.stop() ?? Infinity
      meter = null
      if (!rec) return
      const tooShort = Date.now() - holdAt < 400
      // тишина или очень тихий шум не уходят в Whisper: он на них выдумывает слова
      const quiet = loud < MIN_LOUD_FRAMES
      rec.onstop = () => {
        if (quiet && !tooShort) toast.error('Не слышно речи: говори ближе к микрофону')
        else if (!tooShort) void freeHeard(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
      }
      if (rec.state !== 'inactive') rec.stop()
      return
    }
    stream?.getAudioTracks().forEach(t => (t.enabled = false))
    if (Date.now() - holdAt < 400) return void send({ type: 'input_audio_buffer.clear' })
    send({ type: 'input_audio_buffer.commit' })
    send({ type: 'response.create' })
    mood.value = 'thinking'
  }

  /* ---------- бесплатный разговор: Whisper (Groq) слышит, выбранная модель отвечает, озвучивает браузер ---------- */
  /** Первая «реплика ученика» для модели: ученик ещё ничего не сказал, а собеседник начинает сам. */
  const OPENER = '(Ученик открыл разговор. Поздоровайся и начни по инструкции.)'

  async function startFree() {
    if (!navigator.mediaDevices?.getUserMedia) return void toast.error('Браузер не даёт доступ к микрофону (нужен https)')
    if (typeof MediaRecorder === 'undefined') return void toast.error('Этот браузер не умеет записывать звук')
    phase.value = 'connecting'
    lines.value = []
    muted.value = false
    elapsed.value = 0
    ptt.value = true
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(() => {
        throw new Error('нет доступа к микрофону: разреши его в настройках браузера для этого сайта')
      })
      const s = await api<{ id: string; maxSec: number } & VoiceStatus>('/sessions', { method: 'POST', body: JSON.stringify({ free: true, scene: scene.value }) })
      sessionId = s.id
      maxSec.value = s.maxSec
      status.value = s
      phase.value = 'live'
      mood.value = 'thinking'
      startTimer()
      void freeReply()
    } catch (e) {
      const id = sessionId
      cleanup()
      phase.value = 'idle'
      sessionId = ''
      toast.error(errText(e))
      if (id) void fetchT(`/api/voice/sessions/${id}/end`, { method: 'POST', headers: headers() }).catch(() => {})
      void load()
    }
  }

  /** Ответ модели на разговор до сих пор; он добавляется в чат, сохраняется и озвучивается. */
  async function freeReply() {
    mood.value = 'thinking'
    lastActivity = Date.now()
    const ctx = lines.value.filter(l => !l.other && !l.wrong).slice(-12)
    try {
      const r = await api<{ text: string; check: { provider: string; text: string } | null; failed?: string[] }>('/ask', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ role: 'user', text: OPENER }, ...ctx.map(l => ({ role: l.role, text: l.text.slice(0, 1500) }))], provider: provider.value, check: check.value, scene: scene.value }),
      })
      if (phase.value !== 'live') return
      keep({ role: 'assistant', text: r.text, ...(r.check ? { check: r.check } : {}), ...(r.failed?.length ? { note: r.failed.join('; ') } : {}) })
      void speak(r.text)
    } catch (e) {
      mood.value = 'listening'
      toast.error(errText(e))
    }
  }

  /** Озвучка ответа: голосом Gemini через сервер (WAV с кэшем) или, если выбрано, голосом браузера. Пока говорит, показывается «Говорю». */
  let player: HTMLAudioElement | null = null
  let speakToken = 0
  function stopSpeaking() {
    speakToken++
    if (player) {
      player.pause()
      player = null
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

  async function speak(text: string) {
    stopSpeaking()
    const token = speakToken
    if (voiceOut.value === 'gemini' && status.value?.tts) {
      mood.value = 'speaking'
      try {
        const r = await api<{ audio: string; mime: string }>('/speak', { method: 'POST', body: JSON.stringify({ text, voice: ttsVoice.value }) })
        if (token !== speakToken || phase.value !== 'live') return
        const bin = atob(r.audio)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }))
        const a = new Audio(url)
        player = a
        const done = () => {
          URL.revokeObjectURL(url)
          if (player === a) player = null
          if (token === speakToken && phase.value === 'live') mood.value = 'listening'
        }
        a.onended = done
        a.onerror = done
        try {
          await a.play()
        } catch {
          done()
        }
      } catch (e) {
        if (token === speakToken && phase.value === 'live') mood.value = 'listening'
        toast.error(`Озвучка не получилась: ${errText(e)}`)
      }
      return
    }
    speakBrowser(text)
  }

  /** Озвучка браузером: корейские куски голосом ko-KR (медленнее), русские ru-RU. */
  function speakBrowser(text: string) {
    if (typeof speechSynthesis === 'undefined') return void (mood.value = 'listening')
    const voices = speechSynthesis.getVoices()
    const parts = splitKorean(text.replace(/[*_#`]+/g, '')).filter(p => p.text.trim())
    let left = parts.length
    if (!left) return void (mood.value = 'listening')
    mood.value = 'speaking'
    for (const p of parts) {
      const u = new SpeechSynthesisUtterance(p.text.trim())
      u.lang = p.ko ? 'ko-KR' : 'ru-RU'
      u.voice = voices.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase())) ?? null
      u.rate = p.ko ? 0.85 : 1
      const done = () => {
        if (--left <= 0 && phase.value === 'live') mood.value = 'listening'
      }
      u.onend = done
      u.onerror = done
      speechSynthesis.speak(u)
    }
  }

  /** Замер громкости на время записи: сколько 50-миллисекундных кусков было громче шума комнаты. Нет WebAudio (старый браузер, тест): замер не мешает. */
  const MIN_LOUD_FRAMES = 5
  function startMeter(s: MediaStream): { stop: () => number } {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) throw new Error('no audio context')
      const ctx = new Ctx()
      const src = ctx.createMediaStreamSource(s)
      const an = ctx.createAnalyser()
      an.fftSize = 1024
      src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      let loud = 0
      const t = setInterval(() => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        if (Math.sqrt(sum / buf.length) > 0.02) loud++
      }, 50)
      return {
        stop: () => {
          clearInterval(t)
          src.disconnect()
          void ctx.close().catch(() => {})
          return loud
        },
      }
    } catch {
      return { stop: () => Infinity }
    }
  }

  /** Запись из браузера в base64 (так её принимает сервер). */
  async function blobToBase64(b: Blob): Promise<string> {
    const bytes = new Uint8Array(await b.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  }

  /** Запись ученика: Whisper превращает её в текст, текст уходит в чат как его реплика, потом отвечает модель. */
  async function freeHeard(blob: Blob) {
    mood.value = 'thinking'
    lastActivity = Date.now()
    try {
      const r = await api<{ text: string }>('/transcribe', { method: 'POST', body: JSON.stringify({ audio: await blobToBase64(blob), mime: blob.type || 'audio/webm', lang: speechLang.value }) })
      if (phase.value !== 'live') return
      if (!r.text) {
        mood.value = 'listening'
        return void toast.error('Не расслышал, скажи ещё раз')
      }
      keep({ role: 'user', text: r.text })
      await freeReply()
    } catch (e) {
      mood.value = 'listening'
      toast.error(errText(e))
    }
  }

  /** Ответ текстом вместо голоса (если распознавание подводит). */
  function sendText(text: string) {
    const t = text.replace(/\s+/g, ' ').trim()
    if (!t || phase.value !== 'live') return
    if (engine.value === 'free') {
      keep({ role: 'user', text: t })
      void freeReply()
      return
    }
    send({ type: 'response.cancel' })
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: t }] } })
    send({ type: 'response.create' })
    keep({ role: 'user', text: t })
    mood.value = 'thinking'
    lastActivity = Date.now()
  }

  /** «Услышал неверно»: старая реплика убирается из памяти собеседника и заменяется набранным текстом. */
  function fixLine(i: number, text: string) {
    const l = lines.value[i]
    if (!l || l.role !== 'user') return
    l.wrong = true
    if (l.itemId) send({ type: 'conversation.item.delete', item_id: l.itemId })
    fixing.value = -1
    sendText(text)
  }

  function toggleMute() {
    if (ptt.value) return
    muted.value = !muted.value
    stream?.getAudioTracks().forEach(t => (t.enabled = !muted.value))
  }

  return { open, tab, status, loadError, phase, mood, muted, elapsed, lines, history, opened, reviews, reviewing, lastId, asking, live, left, scene, ptt, engine, provider, check, voiceOut, ttsVoice, speechLang, setEngine, talking, fixing, load, loadHistory, openItem, removeItem, start, stop, toggleMute, holdStart, holdEnd, sendText, fixLine, runReview, askOther }
})

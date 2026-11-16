import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
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
}

export interface VoiceLine {
  role: 'user' | 'assistant'
  text: string
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
  const e = (ev ?? {}) as { type?: unknown; transcript?: unknown }
  const text = typeof e.transcript === 'string' ? e.transcript.replace(/\s+/g, ' ').trim() : ''
  if (!text) return null
  if (e.type === 'conversation.item.input_audio_transcription.completed') return { role: 'user', text }
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
  const muted = ref(false)
  const elapsed = ref(0)
  const lines = ref<VoiceLine[]>([])
  const history = ref<VoiceItem[]>([])
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
      const body = (await res.json().catch(() => ({}))) as { error?: string }
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
      const d = await api<{ id: string; started: number; seconds: number; messages: { role: 'user' | 'assistant'; text: string }[] }>(`/sessions/${id}`)
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
  let startedAt = 0
  let lastActivity = 0

  function cleanup() {
    if (timer) clearInterval(timer)
    timer = null
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
    void fetchT(`/api/voice/sessions/${sessionId}/messages`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(line) }).catch(() => {})
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

  async function start() {
    if (live.value) return
    if (!navigator.mediaDevices?.getUserMedia) return void toast.error('Браузер не даёт доступ к микрофону (нужен https)')
    phase.value = 'connecting'
    lines.value = []
    muted.value = false
    elapsed.value = 0
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
        throw new Error('нет доступа к микрофону: разреши его в настройках браузера для этого сайта')
      })
      const s = await api<{ id: string; secret: string; callsUrl: string; maxSec: number } & VoiceStatus>('/sessions', { method: 'POST' })
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
    if (id) {
      try {
        status.value = await api<VoiceStatus>(`/sessions/${id}/end`, { method: 'POST' })
      } catch {
        void load()
      }
    }
    if (tab.value === 'history') void loadHistory()
  }

  function toggleMute() {
    muted.value = !muted.value
    stream?.getAudioTracks().forEach(t => (t.enabled = !muted.value))
  }

  return { open, tab, status, loadError, phase, mood, muted, elapsed, lines, history, opened, live, left, load, loadHistory, openItem, removeItem, start, stop, toggleMute }
})

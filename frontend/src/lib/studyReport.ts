import type { AnswerItem } from '@/data/sessions'
import { errText, fetchT, LONG_TIMEOUT } from '@/lib/http'
import type { TimerPdfSpec } from '@/lib/timerPdf'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Занятие короче этого в Telegram не уходит: случайное нажатие на таймер не шлёт пустой лист. */
export const MIN_REPORT_SECONDS = 60

const two = (n: number) => String(n).padStart(2, '0')
const clock = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** Рисует PDF и отдаёт его серверу, а тот шлёт файлом в тему «Отчёт по занятиям». true: ушло; false: тема не настроена. */
async function upload(spec: TimerPdfSpec): Promise<boolean> {
  const progress = useProgressStore()
  const { renderTimerPdf } = await import('@/lib/timerPdf')
  const pdf = await renderTimerPdf(spec)
  const d = new Date(spec.start)
  const inside = spec.answers.filter(a => a.t >= spec.start && a.t <= spec.end)
  const f = new FormData()
  f.set('when', `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · ${clock(spec.start)}–${clock(spec.end)}`)
  f.set('stamp', `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}-${two(d.getMinutes())}`)
  f.set('seconds', String(Math.round(spec.seconds)))
  f.set('answers', String(inside.length))
  f.set('ok', String(inside.filter(a => a.ok).length))
  f.set('pdf', pdf, 'zanyatie.pdf')
  const res = await fetchT('/api/notify/study-report', { method: 'POST', headers: { Authorization: `Bearer ${progress.bearer}` }, body: f }, LONG_TIMEOUT)
  if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
  const r = (await res.json()) as { ok: boolean; message: string; skipped?: boolean }
  if (r.ok) return true
  if (r.skipped) return false
  throw new Error(r.message || 'Telegram не принял файл')
}

/**
 * Таймер остановлен: собирает ответы за время занятия и отправляет PDF-отчёт в Telegram.
 * Сначала уходит очередь прогресса, чтобы последние ответы уже были на сервере. Тема не настроена: молчит.
 */
export async function sendStudyReport(o: { start: number; end: number; seconds: number }): Promise<void> {
  const progress = useProgressStore()
  const toast = useToastStore()
  try {
    await progress.push()
    const days = Math.max(1, Math.ceil((Date.now() - o.start) / 86_400_000))
    const res = await fetchT(`/api/report/answers?days=${days}&limit=5000`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    const { items } = (await res.json()) as { items: AnswerItem[] }
    if (await upload({ ...o, answers: items.filter(a => a.t >= o.start && a.t <= o.end) })) toast.ok('Отчёт о занятии отправлен в Telegram')
  } catch (e) {
    toast.error('Отчёт о занятии не отправлен: ' + errText(e))
  }
}

/** Выдуманное занятие на 52 минуты с шестнадцатью упражнениями: для кнопки «Пример сообщения» в кабинете. Числа от зерна, файл всегда одинаковый. */
export function sampleStudySpec(end = Date.now()): TimerPdfSpec {
  let seed = 42
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]!
  const WORDS: [string, string][] = [['학교', 'школа'], ['물', 'вода'], ['친구', 'друг'], ['책', 'книга'], ['집', 'дом'], ['사과', 'яблоко'], ['우유', 'молоко'], ['커피', 'кофе'], ['빵', 'хлеб'], ['가방', 'сумка'], ['의자', 'стул'], ['시간', 'время'], ['사람', 'человек'], ['선생님', 'учитель'], ['학생', 'студент']]
  const GAPS: [string, string, string][] = [['저는 학교__ 가요', '에', '에서'], ['친구__ 만나요', '를', '가'], ['물__ 마셔요', '을', '이'], ['집__ 쉬어요', '에서', '에'], ['저__ 학생이에요', '는', '은'], ['책__ 있어요', '이', '을']]
  // раздел, режим, минута начала, сколько ответов, секунд на ответ, доля верных
  const PLAN: [string, string, number, number, number, number][] = [
    ['today', 'word', 0, 12, 9, 0.9], ['game', 'word', 3, 18, 7, 0.85], ['game', 'rev', 6, 16, 8, 0.8], ['trainer', 'match', 9, 10, 10, 1],
    ['trainer', 'typing', 12, 9, 16, 0.65], ['game', 'part', 15, 20, 8, 0.7], ['trainer', 'particles', 19, 14, 11, 0.75], ['game', 'pair', 22, 15, 7, 0.9],
    ['trainer', 'syllables', 25, 8, 14, 0.85], ['game', 'num', 28, 16, 9, 0.6], ['game', 'rev', 32, 9, 20, 0.8], ['trainer', 'typing', 36, 7, 30, 0.7],
    ['game', 'word', 41, 14, 8, 0.95], ['review', 'cards', 44, 18, 6, 0.85], ['game', 'only', 47, 12, 9, 0.75], ['review', 'mistakes', 50, 8, 10, 0.9],
  ]
  const start = end - (52 * 60 + 14) * 1000
  const answers: AnswerItem[] = []
  PLAN.forEach(([source, mode, min, count, sec, share], r) => {
    for (let i = 0; i < count; i++) {
      const ok = rnd() < share
      let q: string, a: string, y: string
      if (['part', 'particles', 'pair', 'only'].includes(mode)) {
        const p = pick(GAPS)
        ;[q, a] = p
        y = ok ? a : p[2]
      } else {
        const w = pick(WORDS)
        const other = pick(WORDS.filter(x => x !== w))
        const back = mode === 'rev'
        q = back ? w[1] : w[0]
        a = back ? w[0] : w[1]
        y = ok ? a : back ? other[0] : other[1]
      }
      answers.push({ t: start + min * 60_000 + i * sec * 1000 + Math.floor(rnd() * 3000), w: null, ok, source, mode, d: { q, a, y, r: `sample-${r}` } })
    }
  })
  return { start, end, seconds: 49 * 60 + 40, answers }
}

/** Пример отчёта в тему: тот же лист, что приходит после занятия, с выдуманными данными. Ошибку отдаёт вызвавшему. */
export async function sendStudySample(): Promise<void> {
  if (!(await upload(sampleStudySpec()))) throw new Error('тема «Отчёт по занятиям» не настроена: нужен TELEGRAM_TOPIC_STUDY в .env')
}

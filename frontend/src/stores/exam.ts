import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ExamAttempt, ExamDraft, ExamMistake, ExamResultRow, RuleScores } from '@/data/korean/exam'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

/** Итоговая оценка: результаты, разбор попыток и черновик между частями лежат на сервере (только владелец). */
export const useExamStore = defineStore('exam', () => {
  const progress = useProgressStore()
  const results = ref<Record<string, ExamResultRow>>({})
  const loaded = ref(false)
  const headers = () => ({ Authorization: `Bearer ${progress.bearer}`, 'Content-Type': 'application/json' })

  async function load() {
    try {
      const res = await fetchT('/api/exams', { headers: headers() })
      if (!res.ok) return
      results.value = ((await res.json()) as { results: Record<string, ExamResultRow> }).results ?? {}
      loaded.value = true
    } catch {
      /* без сети список остаётся прежним */
    }
  }

  /** Блиц дня: итоги по дням (серия дней подряд) и слабые правила; всё на сервере, на любом устройстве одно и то же. */
  const blitzDays = ref<{ day: string; right: number; total: number }[]>([])
  const blitzWeak = ref<RuleScores>({})
  const apply = (b: { days?: typeof blitzDays.value; weak?: RuleScores } | null) => {
    if (!b) return
    blitzDays.value = Array.isArray(b.days) ? b.days : []
    blitzWeak.value = b.weak && typeof b.weak === 'object' ? b.weak : {}
  }
  /** Старые данные блица из браузера (до переезда на сервер): один раз уходят на сервер, пока там пусто. */
  const OLD_LOG = 'exam_blitz_log'
  const OLD_WEAK = 'exam_blitz_weak'
  async function loadBlitz() {
    try {
      const res = await fetchT('/api/exams/blitz', { headers: headers() })
      if (!res.ok) return
      const srv = (await res.json()) as { days: typeof blitzDays.value; weak: RuleScores }
      apply(srv)
      if (!srv.days.length && !Object.keys(srv.weak ?? {}).length) {
        let days: unknown = []
        let weak: unknown = {}
        try {
          days = JSON.parse(localStorage.getItem(OLD_LOG) ?? '[]')
          weak = JSON.parse(localStorage.getItem(OLD_WEAK) ?? '{}')
        } catch {
          /* нечего переносить */
        }
        if ((Array.isArray(days) && days.length) || (weak && Object.keys(weak as object).length)) {
          const put = await fetchT('/api/exams/blitz', { method: 'PUT', headers: headers(), body: JSON.stringify({ days, weak }) })
          if (put.ok) {
            apply(await put.json())
            try {
              localStorage.removeItem(OLD_LOG)
              localStorage.removeItem(OLD_WEAK)
            } catch {
              /* ничего */
            }
          }
        }
      }
    } catch {
      /* без сети остаётся прежнее */
    }
  }
  /** Записать итог блица; false, если сервер не принял. */
  async function saveBlitz(day: string, right: number, total: number, rules: RuleScores): Promise<boolean> {
    try {
      const res = await fetchT('/api/exams/blitz', { method: 'POST', headers: headers(), body: JSON.stringify({ day, right, total, rules }) })
      if (!res.ok) return false
      apply(await res.json())
      return true
    } catch {
      return false
    }
  }

  /** Экзамены единиц книги (`1A-6`): лучший и последний результат в процентах. */
  const units = ref<Record<string, { best: number; last: number; tries: number; at: number }>>({})
  async function loadUnits() {
    try {
      const res = await fetchT('/api/exams/units', { headers: headers() })
      if (res.ok) units.value = ((await res.json()) as { units: typeof units.value }).units ?? {}
    } catch {
      /* без сети остаётся прежнее */
    }
  }
  /** Записать попытку единицы; false, если сервер не принял. */
  async function saveUnit(unit: string, right: number, total: number): Promise<boolean> {
    try {
      const res = await fetchT('/api/exams/units', { method: 'POST', headers: headers(), body: JSON.stringify({ unit, right, total }) })
      if (!res.ok) return false
      units.value = ((await res.json()) as { units: typeof units.value }).units
      return true
    } catch {
      return false
    }
  }

  /** Разбор последних попыток (новые сверху). */
  async function log(id: string): Promise<ExamAttempt[]> {
    try {
      const res = await fetchT(`/api/exams/${encodeURIComponent(id)}/log`, { headers: headers() })
      return res.ok ? ((await res.json()) as { attempts: ExamAttempt[] }).attempts : []
    } catch {
      return []
    }
  }

  /** Черновик экзамена (null, если нет или не прочитался). */
  async function loadDraft(): Promise<ExamDraft | null> {
    try {
      const res = await fetchT('/api/exams/draft', { headers: headers() })
      if (!res.ok) return null
      const d = ((await res.json()) as { draft: ExamDraft | null }).draft
      return d && d.v === 1 && Array.isArray(d.parts) && Array.isArray(d.results) ? d : null
    } catch {
      return null
    }
  }
  /** Сохранить черновик; возвращает текст ошибки, если не вышло. */
  async function saveDraft(draft: ExamDraft): Promise<string | undefined> {
    try {
      const res = await fetchT('/api/exams/draft', { method: 'PUT', headers: headers(), body: JSON.stringify(draft) })
      if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Сервер ответил кодом ${res.status}`
    } catch (e) {
      return errText(e)
    }
  }
  async function dropDraft() {
    try {
      await fetchT('/api/exams/draft', { method: 'DELETE', headers: headers() })
    } catch {
      /* черновик останется: при следующем заходе предложит продолжить */
    }
  }

  /** Отправить итог. Возвращает строку результата или текст ошибки (например, «пересдача через сутки»). */
  async function submit(id: string, title: string, right: number, total: number, rules: RuleScores, mistakes: ExamMistake[] = []): Promise<{ row?: ExamResultRow; error?: string }> {
    try {
      const res = await fetchT('/api/exams', { method: 'POST', headers: headers(), body: JSON.stringify({ id, title, right, total, rules, mistakes }) })
      const body = (await res.json().catch(() => ({}))) as ExamResultRow & { error?: string }
      if (!res.ok) return { error: body.error ?? `Сервер ответил кодом ${res.status}` }
      results.value = { ...results.value, [id]: body }
      return { row: body }
    } catch (e) {
      return { error: errText(e) }
    }
  }
  return { results, loaded, load, units, loadUnits, saveUnit, blitzDays, blitzWeak, loadBlitz, saveBlitz, log, loadDraft, saveDraft, dropDraft, submit }
})

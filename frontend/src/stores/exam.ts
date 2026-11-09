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
  return { results, loaded, load, log, loadDraft, saveDraft, dropDraft, submit }
})

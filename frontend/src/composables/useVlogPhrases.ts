import { computed, ref, type Ref } from 'vue'
import { breakdownContext, canAskAi } from '@/lib/askAi'
import type { Vlog } from '@/data/korean/vlogs'
import type { VlogGram } from '@/data/korean/vlog-grammar'
import { useNotesStore } from '@/stores/notes'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/**
 * Кнопки у фразы влога, общие для «Влога» и страницы «Разбор влога».
 * «записать»: фраза с переводом, грамматикой и местом в видео становится заметкой с тегом «влог» (Кабинет → Заметки); перед записью заметки
 * подтягиваются с сервера, иначе запись затёрла бы их. «спросить»: одна открытая панель, фраза с переводом, грамматикой и соседними фразами уходит модели.
 * `hints[i]` это грамматика i-й фразы, номера фраз считаются от начала `vlog.lines`.
 */
export const NOTE_TAG = 'влог'
export const ASK_QUICK = ['Расскажи подробнее', 'Объясни попроще', 'Что значит каждое слово?', 'Объясни грамматику', 'Дай ещё примеры']
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const noteTitle = (ko: string) => ko.slice(0, 100)

export function useVlogPhrases(vlog: Ref<Vlog | undefined>, hints: Ref<VlogGram[][]>) {
  const progress = useProgressStore()
  const toast = useToastStore()
  const notes = useNotesStore()
  const canSaveNotes = computed(() => !progress.isGuest && !!progress.bearer)
  const savedTitles = computed(() => new Set(notes.notes.filter(n => n.tags.includes(NOTE_TAG)).map(n => n.title)))

  async function saveLine(i: number) {
    const v = vlog.value
    const l = v?.lines[i]
    if (!v || !l || savedTitles.value.has(noteTitle(l.ko))) return
    await notes.init()
    if (notes.status === 'error') return toast.error('Не записалось: заметки не загрузились с сервера. Попробуй ещё раз позже')
    const gr = (hints.value[i] ?? []).map(g => `${g.ko} (${g.ru})`).join('; ')
    const text = [l.ko, l.ru, '', gr ? `Грамматика: ${gr}` : '', `Влог «${v.title}» (${v.channel}), ${clock(l.s)}`].filter((x, k) => x || k === 2).join('\n')
    if (notes.add(l.ko, text, [], [NOTE_TAG])) toast.ok('Записано в заметки с тегом «влог»: Кабинет → Заметки')
    else toast.error('Не записалось: в заметках нет места (лимит)')
  }

  const askAt = ref(-1)
  const ownerAsk = computed(() => canAskAi())
  function askContext(i: number): string {
    const v = vlog.value
    const l = v?.lines[i]
    if (!v || !l) return ''
    const near = (j: number) => (v.lines[j] ? `${v.lines[j]!.ko} (${v.lines[j]!.ru})` : '')
    const gr = (hints.value[i] ?? []).map(g => `${g.ko} (${g.ru})`).join('; ')
    return breakdownContext(l.ko, [
      `Влог: ${v.title}, автор ${v.channel}, время ${clock(l.s)}`,
      `Перевод в влоге: ${l.ru}`,
      gr ? `Грамматика во фразе: ${gr}` : '',
      near(i - 1) ? `Фраза раньше: ${near(i - 1)}` : '',
      near(i + 1) ? `Фраза дальше: ${near(i + 1)}` : '',
    ])
  }

  return { canSaveNotes, savedTitles, saveLine, askAt, ownerAsk, askContext }
}

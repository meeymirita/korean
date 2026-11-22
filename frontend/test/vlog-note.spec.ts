import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogNote from '@/components/korean/VlogNote.vue'
import { VLOGS } from '@/data/korean/vlogs'
import { useNotesStore } from '@/stores/notes'

/** вход подменён: настоящий без сервера невозможен */
const who = vi.hoisted(() => ({ owner: true }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { isGuest: () => !who.owner, bearer: () => 'токен сеанс', unlocked: () => who.owner }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

// «Моя заметка» к влогу: одно поле, текст сохраняется сам как обычная заметка с тегами «влог» и номером видео.
afterEach(() => vi.unstubAllGlobals())
const vlog = VLOGS.find(v => v.id === 'choisusu-hobby')!

describe('Моя заметка к влогу', () => {
  it('открывается по кнопке, сохраняет текст сама и находит его при следующем открытии', async () => {
    localStorage.clear()
    who.owner = true
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ v: 1, updated: 0, notes: [] }), { status: 200 })))
    const w = await mountSuspended(VlogNote, { props: { vlog } })
    expect(w.find('.vn-area').exists()).toBe(false)
    await w.find('.vn-btn').trigger('click')
    await flushPromises()
    const area = w.find<HTMLTextAreaElement>('.vn-area')
    expect(area.exists()).toBe(true)
    await area.setValue('Запомнить: 좋아해요 = люблю')
    expect(w.find('.vn-foot').text()).toContain('Сохраняю')
    await new Promise(r => setTimeout(r, 900))
    await flushPromises()
    expect(w.find('.vn-foot').text()).toContain('Сохранено')
    const notes = useNotesStore()
    const n = notes.notes.find(x => x.tags.includes('влог') && x.text.startsWith('Запомнить'))
    expect(n).toBeTruthy()
    expect(n!.title).toContain(vlog.title)
    w.unmount()

    const again = await mountSuspended(VlogNote, { props: { vlog } })
    expect(again.find('.vn-btn small').text()).toContain('есть запись')
    await again.find('.vn-btn').trigger('click')
    await flushPromises()
    expect(again.find<HTMLTextAreaElement>('.vn-area').element.value).toBe('Запомнить: 좋아해요 = люблю')
    // правка обновляет ту же заметку, а не создаёт новую
    await again.find('.vn-area').setValue('Другой текст')
    await new Promise(r => setTimeout(r, 900))
    expect(notes.notes.filter(x => x.tags.includes('влог') && x.title.includes(vlog.title) && x.title.startsWith('Заметка к влогу')).length).toBe(1)
    again.unmount()
  })

  it('у гостя блока нет', async () => {
    who.owner = false
    const w = await mountSuspended(VlogNote, { props: { vlog } })
    expect(w.find('.vn').exists()).toBe(false)
    who.owner = true
  })
})

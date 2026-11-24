import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'

afterEach(() => { document.body.innerHTML = '' })

describe('«Глубже»: разбор примера по нажатию', () => {
  it('нажатие на пример открывает разбор по словам, ✕ закрывает его', async () => {
    const { open } = useGrammarModal()
    open('man')
    const w = await mountSuspended(GrammarModal)
    const rows = w.element.querySelectorAll<HTMLElement>('details.deep .exl > div')
    expect(rows.length).toBeGreaterThan(3)
    expect(w.element.querySelector('.gbd')).toBeNull()

    rows[0]!.click()
    await w.vm.$nextTick()
    const panel = w.element.querySelector('.gbd')
    expect(panel).not.toBeNull()
    expect(panel!.querySelector('.bd-ko')!.textContent).toBe(rows[0]!.querySelector('b')!.textContent)
    expect(panel!.querySelectorAll('.bd-card').length).toBeGreaterThan(0)
    expect(panel!.querySelector('.bd-tr')!.textContent).toBe(`«${rows[0]!.querySelector(':scope > span')!.textContent}»`)

    // пример диалога: «가: » отрезается
    const dlg = [...rows].find(r => /^[가나]: /.test(r.querySelector('b')!.textContent ?? ''))
    expect(dlg).toBeTruthy()
    dlg!.click()
    await w.vm.$nextTick()
    expect(w.element.querySelector('.gbd .bd-ko')!.textContent).not.toMatch(/^[가나]:/)

    w.element.querySelector<HTMLButtonElement>('.gbd-x')!.click()
    await w.vm.$nextTick()
    expect(w.element.querySelector('.gbd')).toBeNull()

    w.unmount()
  })

  it('примеры вне блока «Глубже» разбор не открывают', async () => {
    const { open } = useGrammarModal()
    open('man')
    const w = await mountSuspended(GrammarModal)
    const outside = [...w.element.querySelectorAll<HTMLElement>('.exl > div')].find(r => !r.closest('details.deep'))
    expect(outside).toBeTruthy()
    outside!.click()
    await w.vm.$nextTick()
    expect(w.element.querySelector('.gbd')).toBeNull()
    w.unmount()
  })
})

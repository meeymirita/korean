import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StudyModal from '@/components/StudyModal.vue'
import LevelsModal from '@/components/cabinet/LevelsModal.vue'
import { levelInfo } from '@/data/levels'

afterEach(() => { document.body.innerHTML = '' })

describe('StudyModal: общая оболочка окон', () => {
  it('рисует окно в body с нужными классами, подписью и шириной', async () => {
    const w = await mountSuspended(StudyModal, { props: { name: 'xx', label: 'Проверка', width: '300px' }, slots: { default: '<p id="in">внутри</p>' } })
    const box = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(box.getAttribute('aria-label')).toBe('Проверка')
    expect(box.className).toContain('xx-box')
    expect(box.className).toContain('study')
    expect(box.style.getPropertyValue('--sm-w')).toBe('300px')
    expect(document.querySelector('.sm.xx #in')).not.toBeNull()
    w.unmount()
  })

  it('Esc, ✕ и клик мимо коробки закрывают', async () => {
    const w = await mountSuspended(StudyModal, { props: { name: 'xx', label: 'Проверка' } })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.querySelector<HTMLButtonElement>('.sm-x')!.click()
    document.querySelector<HTMLElement>('.sm')!.click()
    expect(w.emitted('close')).toHaveLength(3)
    w.unmount()
  })

  it('после закрытия Esc больше не слушается', async () => {
    const w = await mountSuspended(StudyModal, { props: { name: 'xx', label: 'Проверка' } })
    w.unmount()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toBeUndefined()
  })

  it('окно «Все уровни» собрано на оболочке', async () => {
    const w = await mountSuspended(LevelsModal, { props: { info: levelInfo(1200) } })
    expect(document.querySelector('.sm.lv .lv-box.study')).not.toBeNull()
    expect(document.body.textContent).toContain('Все уровни')
    w.unmount()
  })
})

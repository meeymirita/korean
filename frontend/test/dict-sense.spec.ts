import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DictSense from '@/components/dict/DictSense.vue'

describe('DictSense', () => {
  it('показывает перевод, значение, определение и пример', async () => {
    const w = await mountSuspended(DictSense, { props: { sense: { ru: [{ t: 'дом', d: 'здание для жилья' }], ko: '사람이 사는 건물', sent: ['집에 가요.'] } } })
    const t = w.text()
    expect(t).toContain('дом')
    expect(t).toContain('здание для жилья')
    expect(t).toContain('사람이 사는 건물')
    expect(t).toContain('집에 가요.')
  })

  it('без перевода описание идёт в «Значение», а «Перевод» не показывается', async () => {
    const w = await mountSuspended(DictSense, { props: { sense: { ru: [{ t: '', d: 'только описание' }], ko: '', sent: [] } } })
    expect(w.text()).not.toContain('Перевод')
    expect(w.text()).toContain('только описание')
    expect(w.text()).not.toContain('Пример')
  })
})

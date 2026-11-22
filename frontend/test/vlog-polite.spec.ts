import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogPoliteForms from '@/components/korean/VlogPoliteForms.vue'

// «Три формы вежливости»: лесенка, десять заданий, ответ сразу показывает верное, в конце итог и новый раунд.
describe('Три формы вежливости', () => {
  it('проходит раунд: ответ, объяснение, «Дальше», итог, новый раунд', async () => {
    const w = await mountSuspended(VlogPoliteForms)
    expect(w.findAll('.pf-steps li').length).toBe(3)
    for (let k = 0; k < 10; k++) {
      expect(w.find('.pf-count').text()).toContain(`${k + 1} из 10`)
      const opts = w.findAll('.pf-opt')
      expect(opts.length).toBe(3)
      await opts[0]!.trigger('click')
      expect(w.find('.pf-why').exists()).toBe(true)
      expect(w.findAll('.pf-opt.right').length).toBe(1)
      expect(w.findAll('.pf-opt').every(o => o.attributes('disabled') !== undefined)).toBe(true)
      await w.find('.pf-next').trigger('click')
    }
    expect(w.find('.pf-big').text()).toMatch(/^\d+ из 10$/)
    await w.find('.pf-next').trigger('click')
    expect(w.find('.pf-count').text()).toContain('1 из 10')
  })
})

import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import ToastHost from '@/components/ToastHost.vue'
import { useToastStore } from '@/stores/toast'

describe('компоненты в окружении Nuxt', () => {
  it('ToastHost показывает плашку из стора', async () => {
    const wrapper = await mountSuspended(ToastHost)
    useToastStore().ok('Сохранено')
    await nextTick()
    expect(document.body.textContent).toContain('Сохранено')
    wrapper.unmount()
  })
})

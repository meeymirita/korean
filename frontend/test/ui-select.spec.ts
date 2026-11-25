import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import UiSelect from '@/components/ui/UiSelect.vue'

const Host = defineComponent({
  props: { number: Boolean },
  setup(p) {
    const v = ref<string | number>(p.number ? 5 : 'b')
    const changes = ref(0)
    return () => h('div', [
      h(UiSelect, p.number
        ? { modelValue: v.value, modelModifiers: { number: true }, 'onUpdate:modelValue': (x: string | number) => (v.value = x), onChange: () => changes.value++, 'aria-label': 'Список' }
        : { modelValue: v.value, 'onUpdate:modelValue': (x: string | number) => (v.value = x), onChange: () => changes.value++, 'aria-label': 'Список' },
      () => [h('option', { value: p.number ? 3 : 'a' }, 'раз'), h('option', { value: p.number ? 5 : 'b' }, 'два'), h('option', { value: p.number ? 8 : 'c' }, 'три')]),
      h('output', { 'data-v': String(v.value), 'data-n': typeof v.value, 'data-c': String(changes.value) }),
    ])
  },
})

describe('UiSelect', () => {
  it('показывает выбранное значение, меняет его и отдаёт строку', async () => {
    const w = mount(Host)
    const sel = w.find('select')
    expect(sel.element.value).toBe('b')
    await sel.setValue('c')
    expect(w.find('output').attributes('data-v')).toBe('c')
    expect(w.find('output').attributes('data-n')).toBe('string')
  })

  it('v-model.number отдаёт число, а событие change родителя тоже срабатывает', async () => {
    const w = mount(Host, { props: { number: true } })
    const sel = w.find('select')
    expect(sel.element.value).toBe('5')
    await sel.setValue('8')
    expect(w.find('output').attributes('data-v')).toBe('8')
    expect(w.find('output').attributes('data-n')).toBe('number')
    expect(w.find('output').attributes('data-c')).toBe('1')
  })

  it('атрибуты уходят на сам select, размер даёт класс', () => {
    const w = mount(UiSelect, { props: { size: 'sm' }, attrs: { id: 'x', 'aria-label': 'Метка' }, slots: { default: '<option value="1">a</option>' } })
    const sel = w.find('select')
    expect(sel.attributes('id')).toBe('x')
    expect(sel.attributes('aria-label')).toBe('Метка')
    expect(sel.classes()).toContain('ui-select--sm')
    expect(mount(UiSelect).find('select').classes()).toContain('ui-select--md')
  })
})

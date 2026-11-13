// Дымовая проверка: каждый экран из `views/` монтируется без ошибки и что-то рисует.
// Сеть заглушена (сервер отвечает 503, как во время перезапуска): экран не должен падать и без данных сервера.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { Component } from 'vue'

const files = import.meta.glob<{ default: Component }>('../src/views/**/*.vue')
const nameOf = (path: string) => path.replace('../src/views/', '').replace('.vue', '')
/** Экраны, которым нужен входной параметр. */
const PROPS: Record<string, Record<string, unknown>> = { 'korean/RichView': { id: 'cheat' } }

describe('экраны монтируются без ошибок', () => {
  let errors: string[] = []
  beforeEach(() => {
    errors = []
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unavailable"}', { status: 503, headers: { 'content-type': 'application/json' } })))
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('список экранов не пуст', () => {
    expect(Object.keys(files).length).toBeGreaterThan(40)
  })

  for (const [path, load] of Object.entries(files)) {
    it(nameOf(path), async () => {
      const view = (await load()).default
      const w = await mountSuspended(view, { attachTo: document.body, props: PROPS[nameOf(path)] })
      await flushPromises()
      expect(w.html().length, 'экран пустой').toBeGreaterThan(20)
      w.unmount()
      expect(errors.filter(e => /Unhandled|is not a function|Cannot read|is not defined/.test(e)), 'ошибки при открытии').toEqual([])
    })
  }
})

import { describe, expect, it } from 'vitest'
import { ProgressService } from '../src/progress/progress.service'
import type { Db } from '../src/db/db.service'

describe('answer detail', () => {
  it('preserves the grammar rule ID with a bounded length', async () => {
    const service = new ProgressService({} as Db)
    const detail = (service as unknown as { detail(value: unknown): string }).detail({ q: 'Вопрос', a: 'Ответ', g: 'eun' })
    expect(JSON.parse(detail)).toEqual({ q: 'Вопрос', a: 'Ответ', g: 'eun' })
  })

  it('keeps the note about how the answer was given', async () => {
    const service = new ProgressService({} as Db)
    const detail = (service as unknown as { detail(value: unknown): string }).detail({ q: '작다', a: 'маленький', y: 'мало', n: 'линией' })
    expect(JSON.parse(detail)).toEqual({ q: '작다', a: 'маленький', y: 'мало', n: 'линией' })
  })

  it('keeps the round ID that splits answers into sessions', async () => {
    const service = new ProgressService({} as Db)
    const detail = (service as unknown as { detail(value: unknown): string }).detail({ q: '작다', r: 'mabc123' })
    expect(JSON.parse(detail)).toEqual({ q: '작다', r: 'mabc123' })
  })
})

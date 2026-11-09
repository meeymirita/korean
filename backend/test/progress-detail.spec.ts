import { describe, expect, it } from 'vitest'
import { ProgressService } from '../src/progress/progress.service'
import type { Db } from '../src/db/db.service'

describe('answer detail', () => {
  it('preserves the grammar rule ID with a bounded length', async () => {
    const service = new ProgressService({} as Db)
    const detail = (service as unknown as { detail(value: unknown): string }).detail({ q: 'Вопрос', a: 'Ответ', g: 'eun' })
    expect(JSON.parse(detail)).toEqual({ q: 'Вопрос', a: 'Ответ', g: 'eun' })
  })
})

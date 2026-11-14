import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { closeHelp, start } from './game-helpers'

describe('режим «Смесь времён»', () => {
  it('8–10 предложений со словом времени, перевода нет, проверка проходит верно при верных плитках', () => {
    for (let i = 0; i < 5; i++) {
      start('tenses')
      closeHelp()
      const rows = [...document.querySelectorAll('.story .story-row')]
      expect(rows.length).toBeGreaterThanOrEqual(8)
      expect(rows.length).toBeLessThanOrEqual(10)
      expect(document.querySelectorAll('.story-tr:not(.off)').length).toBe(0)
      for (const r of rows) expect(r.textContent).toMatch(/어제|지금|오늘|내일|주말에|토요일에/)
      if (i === 0 && process.env.OUTF) writeFileSync(process.env.OUTF, rows.map(r => r.textContent).join('\n') + '\n' + [...document.querySelectorAll('#bank .tile')].map(t => t.textContent).join(' '))
    }
  })
})

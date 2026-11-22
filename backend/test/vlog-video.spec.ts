import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Видео влогов: имя, подписанная ссылка, отказ без подписи и раздача локального файла (без Диска). Сервер и база не нужны.
const dir = mkdtempSync(path.join(tmpdir(), 'vlog-'))
process.env.DATA_DIR = dir
process.env.PROGRESS_TOKEN = 'test-token'
mkdirSync(path.join(dir, 'vlog', 'jaerim'), { recursive: true })
writeFileSync(path.join(dir, 'vlog', 'jaerim', 'SEywQdBW8W4.mp4'), 'x')

const { VideoController, VLOG_NAME } = await import('../src/video/video.controller.js')

const disk = { configured: () => false } as never
const res = () => {
  const r = { code: 200, sent: '', status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), sendFile: vi.fn(), redirect: vi.fn() }
  r.status.mockImplementation((c: number) => ((r.code = c), r))
  return r
}

describe('обложки влогов', () => {
  it('отдаёт файл из data/vlog/covers и 404 для чужого имени и для отсутствующего файла', async () => {
    mkdirSync(path.join(dir, 'vlog', 'covers'), { recursive: true })
    writeFileSync(path.join(dir, 'vlog', 'covers', 'SEywQdBW8W4.jpg'), 'x')
    const c = new VideoController(disk)
    const r = res()
    await c.vlogCover('SEywQdBW8W4', r as never)
    expect(r.sendFile).toHaveBeenCalledOnce()
    expect(String(r.sendFile.mock.calls[0]![0])).toContain(path.join('covers', 'SEywQdBW8W4.jpg'))
    for (const bad of ['../etc/passwd', 'short', 'AAAAAAAAAAA']) await expect(c.vlogCover(bad, res() as never)).rejects.toThrow()
  })
})

describe('видео влогов', () => {
  it('имя: номер видео ютуба, 11 знаков, без точек и слэшей', () => {
    expect(VLOG_NAME.test('SEywQdBW8W4')).toBe(true)
    expect(VLOG_NAME.test('a-1_B2c3D4e')).toBe(true)
    for (const bad of ['', '../x', 'a/b', 'short', 'SEywQdBW8W4.mp4', 'a'.repeat(12), '..........']) expect(VLOG_NAME.test(bad), bad).toBe(false)
  })

  it('ссылка подписана, файл отдаётся только по подписи', async () => {
    const c = new VideoController(disk)
    const { url } = await c.vlogUrl('jaerim', 'SEywQdBW8W4')
    const q = new URL(url, 'http://x').searchParams
    const ok = res()
    await c.vlogFile('jaerim', 'SEywQdBW8W4', q.get('e')!, q.get('s')!, ok as never)
    expect(ok.sendFile).toHaveBeenCalledOnce()

    const bad = res()
    await c.vlogFile('jaerim', 'SEywQdBW8W4', q.get('e')!, 'f'.repeat(32), bad as never)
    expect(bad.status).toHaveBeenCalledWith(403)
    expect(bad.sendFile).not.toHaveBeenCalled()

    // подпись от одного имени не годится для другого
    const other = res()
    await c.vlogFile('jaerim', 'AAAAAAAAAAA', q.get('e')!, q.get('s')!, other as never)
    expect(other.status).toHaveBeenCalledWith(403)
  })

  it('нет файла: ссылка не выдаётся (404)', async () => {
    await expect(new VideoController(disk).vlogUrl('jaerim', 'NOPE0000000')).rejects.toThrow()
    await expect(new VideoController(disk).vlogUrl('jaerim', '../x')).rejects.toThrow()
  })
})

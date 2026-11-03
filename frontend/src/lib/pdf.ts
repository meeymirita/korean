/**
 * Минимальная сборка PDF без библиотек: каждая страница это одна JPEG-картинка на весь лист A4.
 * Страницы рисует `lib/reportPdf.ts` на canvas; текст в таком PDF не выделяется, зато выглядит одинаково везде.
 */
export const A4 = { w: 595.28, h: 841.89 }

const enc = new TextEncoder()

/** Склеивает JPEG-страницы (байты и размеры в пикселях) в один PDF. */
export function buildPdf(pages: { jpeg: Uint8Array; width: number; height: number }[], title = ''): Blob {
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let size = 0
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b
    parts.push(u)
    size += u.length
  }
  const obj = (n: number, body: (Uint8Array | string)[]) => {
    offsets[n] = size
    push(`${n} 0 obj\n`)
    body.forEach(push)
    push('\nendobj\n')
  }
  // номера: 1 каталог, 2 страницы, 3 информация, дальше на каждую страницу по три объекта (страница, содержимое, картинка)
  const first = (i: number) => 4 + i * 3
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${first(i)} 0 R`).join(' ')}] >>`])
  // название в UTF-16BE с BOM, чтобы кириллица читалась в свойствах файла
  const hex = '﻿' + title
  const u16 = Array.from(hex, c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase()
  obj(3, [`<< /Title <${u16}> /Producer (우리말) >>`])
  pages.forEach((p, i) => {
    const n = first(i)
    obj(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`])
    const content = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`
    obj(n + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`])
    obj(n + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ])
  })
  const count = first(pages.length)
  const xref = size
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}

/** Canvas → JPEG-байты. */
export async function canvasJpeg(c: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', quality))
  if (!blob) throw new Error('не получилось собрать картинку страницы')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Скачивает файл: временная ссылка с именем. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

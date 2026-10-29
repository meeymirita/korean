import { type Block } from './grammar'

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim()

export function F(s: string) {
  return String(s)
    .replace(/\{(o|b|g|p|r|k)\|([^}]*)\}/g, '<span class="c-$1">$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
}

export function esc(s: string) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
}

/** Подсветка найденных фрагментов; не трогает уже вставленные теги. */
export function hl(text: string, qs: string[]) {
  let out = esc(text)
  qs.filter(Boolean).forEach(q => {
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi')
    out = out.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag, txt) => (tag ? tag : txt.replace(re, '<mark>$1</mark>')))
  })
  return out
}

export function blk(b: Block): string {
  const [t, a, c] = b
  if (t === 'p') return `<p>${F(a)}</p>`
  if (t === 'h') return `<h4>${a}</h4>`
  if (t === 'rule') return `<div class="rule">${F(a)}</div>`
  if (t === 'formula') return `<div class="formula">${F(a)}</div>`
  if (t === 'warn') return `<div class="warn">⚠️ ${F(a)}</div>`
  if (t === 'tip') return `<div class="tip">💡 ${F(a)}</div>`
  if (t === 'ok') return `<div class="ok">✅ ${F(a)}</div>`
  if (t === 'pron') return `<div class="pron">${F(a)}</div>`
  if (t === 'ex')
    return `<div class="exl">${a.map((r: string[]) => `<div><b>${F(r[0]!)}</b><span>${F(r[1]!)}</span></div>`).join('')}</div>`
  if (t === 'tbl')
    return `<table class="t"><tr>${a.map((h: string) => `<th>${F(h)}</th>`).join('')}</tr>${c
      .map((r: string[]) => `<tr>${r.map(x => `<td>${F(x)}</td>`).join('')}</tr>`)
      .join('')}</table>`
  return ''
}

export function blk2(c: { h: string; b: Block[] }) {
  return `<div class="card"><h3>${c.h}</h3>${c.b.map(blk).join('')}</div>`
}

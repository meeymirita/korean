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
  switch (b[0]) {
    case 'p': return `<p>${F(b[1])}</p>`
    case 'h': return `<h4>${b[1]}</h4>`
    case 'rule': return `<div class="rule">${F(b[1])}</div>`
    case 'formula': return `<div class="formula">${F(b[1])}</div>`
    case 'warn': return `<div class="warn">⚠️ ${F(b[1])}</div>`
    case 'tip': return `<div class="tip">💡 ${F(b[1])}</div>`
    case 'ok': return `<div class="ok">✅ ${F(b[1])}</div>`
    case 'pron': return `<div class="pron">${F(b[1])}</div>`
    case 'ex': return `<div class="exl">${b[1].map(r => `<div><b>${F(r[0])}</b><span>${F(r[1])}</span></div>`).join('')}</div>`
    case 'tbl':
      return `<table class="t"><tr>${b[1].map(h => `<th>${F(h)}</th>`).join('')}</tr>${b[2]
        .map(r => `<tr>${r.map(x => `<td>${F(x)}</td>`).join('')}</tr>`)
        .join('')}</table>`
  }
}

export function blk2(c: { h: string; b: Block[] }) {
  return `<div class="card"><h3>${c.h}</h3>${c.b.map(blk).join('')}</div>`
}

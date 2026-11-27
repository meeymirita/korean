// общий помощник прототипов: данные настоящие (grammar.ts), вёрстка у каждого варианта своя
const F = s => String(s).replace(/\{(o|b|g|p|r|k)\|([^}]*)\}/g, '<span class="c-$1">$2</span>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const strip = s => String(s).replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/\*\*/g, '').replace(/<br>/g, ' ')
const ALL = GRAM.cards, SECS = GRAM.secs
const MINE = ALL.filter(c => !c.l || (c.st === 'ok' && c.part === 1 && !['past', 'past_i'].includes(c.id)))  // «Мои карточки» как на сайте: свои + пройденные из части 1
const bkKey = c => { const m = (c.bk || '').match(/^(1B )?(\d+)-(\d+)\s*([①②③④⑤⑥⑦⑧])?/); if (!m) return -1; return (m[1] ? 100 : 0) + (+m[2]) * 10 + (+m[3]) + (m[4] ? '①②③④⑤⑥⑦⑧'.indexOf(m[4]) / 10 : 0) }
MINE.sort((a, b) => bkKey(a) - bkKey(b))
const SHOWN = MINE.filter(c => c.st === 'ok')     // пройдено
const AHEAD = MINE.filter(c => c.ahead)           // впереди
const secIdx = c => Math.max(0, SECS.indexOf(c.s))
const unitOf = c => { const m = (c.bk || '').match(/^(1B )?(\d+)-/); return m ? (m[1] ? '1B ' : '') + m[2] : '—' }
const formulaOf = c => (c.b.find(b => b[0] === 'formula') || [0, ''])[1]
const examplesOf = c => (c.b.find(b => b[0] === 'ex') || [0, []])[1]
const ruleOf = c => (c.b.find(b => b[0] === 'rule') || c.b.find(b => b[0] === 'p') || [0, c.d])[1]
const headKo = c => strip(c.ko).split(/\s*[\/+(]\s*/)[0].replace(/[~\-–]/g, '') || strip(c.ko)
// блоки карточки: «Глубже» сворачивается в <details>
function blocks(c, o = {}) {
  let out = '', deep = false
  for (const b of c.b) {
    const k = b[0]
    if (k === 'deep') { deep = true; out += `<details class="gc-deep"><summary>${esc(b[1])}</summary>`; continue }
    out += blk(b)
  }
  return out + (deep ? '</details>' : '')
}
function blk(b) {
  switch (b[0]) {
    case 'p': return `<p>${F(b[1])}</p>`
    case 'h': return `<h4>${esc(b[1])}</h4>`
    case 'rule': return `<div class="rule">${F(b[1])}</div>`
    case 'formula': return `<div class="formula">${F(b[1])}</div>`
    case 'warn': return `<div class="warn"><i>!</i>${F(b[1])}</div>`
    case 'tip': return `<div class="tip"><i>✦</i>${F(b[1])}</div>`
    case 'ok': return `<div class="ok"><i>✓</i>${F(b[1])}</div>`
    case 'pron': return `<div class="pron">${F(b[1])}</div>`
    case 'ex': return `<div class="exl">${b[1].map(r => `<div><b>${F(r[0])}</b><span>${F(r[1])}</span></div>`).join('')}</div>`
    case 'tbl': return `<table class="t"><tr>${b[1].map(h => `<th>${F(h)}</th>`).join('')}</tr>${b[2].map(r => `<tr>${r.map(x => `<td>${F(x)}</td>`).join('')}</tr>`).join('')}</table>`
  }
  return ''
}
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const h = (tag, a = {}, kids = []) => { const e = document.createElement(tag); for (const k in a) k === 'html' ? e.innerHTML = a[k] : k.startsWith('on') ? e.addEventListener(k.slice(2), a[k]) : e.setAttribute(k, a[k]); [].concat(kids).forEach(x => e.append(x)); return e }
const hash = s => { let n = 0; for (const ch of s) n = (n * 31 + ch.charCodeAt(0)) >>> 0; return n }
const rnd = (seed) => { let t = seed >>> 0; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296) }
// 11 цветов разделов
const SEC_COL = ['#e0559f', '#8f7cf0', '#2fa4d8', '#f08a3c', '#37b26c', '#d6455d', '#b08a2c', '#3f5bd6', '#14a39a', '#a04bd0', '#6b7a8f']
const colOf = c => SEC_COL[secIdx(c) % SEC_COL.length]
// у каждого варианта цвета подсветки {o|b|k|g|p|r} задаются переменными
document.head.insertAdjacentHTML('beforeend', `<style>
.c-o{color:var(--o,#d6455d);text-decoration:underline;text-underline-offset:3px;font-weight:700}.c-b{color:var(--b,#5f4bd6);font-weight:700}.c-k{color:var(--k,#e0559f);font-weight:700}
.c-g{color:var(--g,#2a9d63);font-weight:700}.c-p{color:var(--p,#a04bd0);font-weight:700}.c-r{color:var(--r,#d6455d);font-weight:700}
.gc-deep>summary{cursor:pointer;font-weight:700;margin:12px 0}
.gc .t{border-collapse:collapse;width:100%;font-size:14px}.gc .t td,.gc .t th{border:1px solid var(--line,#ddd);padding:6px 9px;text-align:left}
.gc .exl>div{display:flex;flex-direction:column;gap:2px;padding:7px 0;border-bottom:1px dashed var(--line,#ddd)}.gc .exl b{font-size:1.15em}.gc .exl span{opacity:.7;font-size:.9em}
.gc h4{margin:16px 0 6px;font-size:.78em;letter-spacing:.14em;text-transform:uppercase;opacity:.65}
.gc .warn,.gc .tip,.gc .ok,.gc .pron{display:flex;gap:9px;margin:10px 0;padding:9px 12px;border-radius:10px;font-size:.92em}
.gc .warn{background:#fff0ed}.gc .tip{background:#f1ecff}.gc .ok{background:#e9f8ef}.gc .pron{background:#fff8dc}.gc i{font-style:normal;font-weight:800}
.gc .formula{font-weight:800;font-size:1.1em;margin:10px 0}
</style>`)

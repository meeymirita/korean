<script setup lang="ts">
import { computed, ref } from 'vue'
import { VLOGS } from '@/data/korean/vlogs'
import { gramCard, grammarHints, hintToken } from '@/data/korean/vlog-grammar'
import { NEW_GRAMMAR, passes } from '@/data/korean/vlog-study'

/**
 * Вкладка «Грамматика из влогов»: общий список всей грамматики, которая встречается во фразах влогов (по правилам `grammarHints`,
 * один проход рассказа, без повторов) и справки «Новое в этом влоге». Состояние темы берётся из карточек, здесь ничего не записывается и не засчитывается.
 */
type State = 'ok' | 'ahead' | 'other' | 'note'
interface Row {
  key: string
  id: string
  ko: string
  ru: string
  state: State
  phrases: number
  vlogs: Map<string, string>
  examples: { id: string; title: string; ko: string; ru: string; mark: string }[]
  formula: string
  rule: string
}
/** Одинаковые темы из правил и из справок сводятся в одну строку: без дефисов, пробелов и скобок. */
const keyOf = (ko: string) => ko.toLowerCase().replace(/[-\s()]/g, '').replace(/\/.*$/, '')

const rows = computed<Row[]>(() => {
  const m = new Map<string, Row>()
  for (const v of VLOGS) {
    for (const l of passes(v.lines).first) {
      for (const g of grammarHints(l.ko)) {
        const key = keyOf(g.ko)
        const card = gramCard(g.id)
        const row: Row = m.get(key) ?? { key, id: g.id, ko: g.ko, ru: g.ru, state: (card?.state ?? 'other') as State, phrases: 0, vlogs: new Map(), examples: [], formula: card?.formula ?? '', rule: '' }
        row.phrases++
        row.vlogs.set(v.id, v.title)
        if (row.examples.length < 3 && !row.examples.some(e => e.id === v.id)) row.examples.push({ id: v.id, title: v.title, ko: l.ko, ru: l.ru, mark: hintToken(g.id, l.ko) })
        m.set(key, row)
      }
    }
  }
  // справки «Новое в этом влоге»: те же темы дополняются объяснением, остальные идут отдельными строками
  for (const n of Object.values(NEW_GRAMMAR)) {
    const key = keyOf(n.ko)
    const row = m.get(key)
    if (row) {
      row.rule = n.rule
      row.formula = n.formula
    } else m.set(key, { key, id: key, ko: n.ko, ru: n.ru, state: 'note', phrases: 0, vlogs: new Map(), examples: [], formula: n.formula, rule: n.rule })
  }
  return [...m.values()].sort((a, b) => b.phrases - a.phrases || a.ko.localeCompare(b.ko, 'ko'))
})

const STATE: Record<State, string> = { ok: 'пройдено', ahead: 'ещё впереди', other: 'в курсе, не отмечено', note: 'справка из разбора' }
const filter = ref<'all' | State>('all')
const chips = computed(() => (['all', 'ok', 'ahead', 'other', 'note'] as const).map(id => ({ id, label: id === 'all' ? 'Все' : STATE[id], n: id === 'all' ? rows.value.length : rows.value.filter(r => r.state === id).length })).filter(c => c.n))
const shown = computed(() => rows.value.filter(r => filter.value === 'all' || r.state === filter.value))
const rich = (text: string) => text.split('**').map((t, i) => ({ t, b: i % 2 === 1 }))
/** Пример с подсвеченной формой: слово `mark` выделяется внутри фразы. */
function hl(ko: string, mark: string) {
  const at = mark ? ko.indexOf(mark) : -1
  return at < 0 ? [{ t: ko, m: false }] : [{ t: ko.slice(0, at), m: false }, { t: mark, m: true }, { t: ko.slice(at + mark.length), m: false }]
}
</script>

<template>
  <section class="vg" aria-label="Грамматика из влогов">
    <p class="vg-note">Вся грамматика, которая встречается во фразах влогов: сколько фраз и в каких влогах. Это только справка, она нигде не записывается и не засчитывается. Статус показывает, отмечена ли тема пройденной в твоих карточках.</p>
    <div class="vg-chips" role="group" aria-label="Статус темы">
      <button v-for="c in chips" :key="c.id" type="button" class="vg-chip" :class="{ on: filter === c.id }" :aria-pressed="filter === c.id" @click="filter = c.id">{{ c.label }} <small>{{ c.n }}</small></button>
    </div>
    <ul class="vg-list">
      <li v-for="(r, ri) in shown" :key="r.key" class="vg-row" :class="[r.state, `c${ri % 4}`]">
        <div class="vg-head">
          <b lang="ko">{{ r.ko }}</b>
          <span class="vg-ru">{{ r.ru }}</span>
          <span class="vg-state" :class="r.state">{{ STATE[r.state] }}</span>
        </div>
        <p v-if="r.phrases" class="vg-count">{{ r.phrases }} фраз в {{ r.vlogs.size }} {{ r.vlogs.size === 1 ? 'влоге' : 'влогах' }}</p>
        <div v-if="r.formula" class="vg-formula" lang="ko" aria-label="Формула">
          <template v-for="(part, k) in r.formula.split(' + ')" :key="k"><span v-if="k" class="vg-plus">+</span><span class="vg-chipf" :class="{ end: k > 0 }">{{ part }}</span></template>
        </div>
        <p v-if="r.rule" class="vg-rule"><template v-for="(x, k) in rich(r.rule)" :key="k"><b v-if="x.b">{{ x.t }}</b><template v-else>{{ x.t }}</template></template></p>
        <ul v-if="r.examples.length" class="vg-ex">
          <li v-for="e in r.examples" :key="e.id"><span lang="ko"><template v-for="(p, k) in hl(e.ko, e.mark)" :key="k"><mark v-if="p.m" class="vg-hl">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></span><br />{{ e.ru }} <NuxtLink :to="`/korean/vlog?v=${e.id}`" class="vg-link">{{ e.title }}</NuxtLink></li>
        </ul>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.vg-note { margin: 12px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.vg-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.vg-chip { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 4px 11px; font: inherit; font-size: 13px; cursor: pointer; }
.vg-chip.on { background: var(--surface); border-color: var(--ink); color: var(--ink); font-weight: 600; }
.vg-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
@media (max-width: 760px) { .vg-list { grid-template-columns: 1fr; } }
/* тот же вид, что у карточек «Новое в этом влоге»: цветная полоса сверху, формула кружками, выделения в объяснении и в примерах */
.vg-row.c0 { --c: #f06fa8; } .vg-row.c1 { --c: #6a9cf0; } .vg-row.c2 { --c: #e0a82e; } .vg-row.c3 { --c: #3fae7a; }
.vg-row { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-top: 4px solid var(--c, var(--line)); border-radius: 14px; background-color: var(--surface); background-image: linear-gradient(color-mix(in srgb, var(--c, transparent) 8%, transparent), transparent 60%); }
.vg-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.vg-head b { font-size: 19px; color: var(--c); }
.vg-ru { color: var(--muted); font-size: 14px; }
.vg-state { margin-left: auto; border-radius: 999px; padding: 1px 10px; font-size: 12px; background: var(--gold-soft); }
.vg-state.ok { background: var(--ok-bg); }
.vg-state.ahead { background: rgba(150, 190, 255, .22); }
.vg-count { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.vg-formula { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 15px; }
.vg-chipf { padding: 3px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.vg-chipf.end { border-color: var(--c); background: color-mix(in srgb, var(--c) 22%, transparent); font-weight: 700; }
.vg-plus { color: var(--muted); font-weight: 700; }
.vg-rule { margin: 10px 0 0; font-size: 14.5px; line-height: 1.55; }
.vg-rule b { background: color-mix(in srgb, var(--c, #8f7cf0) 20%, transparent); border-radius: 6px; padding: 0 3px; font-weight: 700; }
.vg-ex { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; font-size: 14.5px; line-height: 1.6; }
.vg-ex li { padding: 4px 0 4px 10px; border-left: 3px solid var(--c, var(--line)); }
.vg-hl { background: color-mix(in srgb, var(--c) 32%, transparent); color: inherit; border-radius: 6px; padding: 0 3px; font-weight: 700; }
.vg-link { display: inline-block; margin-left: 4px; color: var(--accent); font-size: 12.5px; text-decoration: none; }
</style>

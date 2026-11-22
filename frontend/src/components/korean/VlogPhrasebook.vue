<script setup lang="ts">
import { computed, ref } from 'vue'
import { gramCard } from '@/data/korean/vlog-grammar'
import { PATTERNS, SCENES, patternExamples, sceneChunk } from '@/data/korean/vlog-lang'

/**
 * Вкладка «Разговорник»: (1) готовые фразы из влогов по ситуациям; (2) шаблоны: каркас фразы и примеры из влогов, чтобы подставлять свои слова.
 * Только справка: ничего не записывается и не засчитывается. Шаблоны с непройденной грамматикой помечены.
 */
const GRAM_STATE: Record<string, string> = { ok: 'пройдено', ahead: 'впереди', other: 'в курсе' }
const mode = ref<'scenes' | 'patterns'>('scenes')
const scene = ref(SCENES[0]!.id)
const onlyClear = ref(true)
const phrases = computed(() => (import.meta.client ? sceneChunk(SCENES.find(s => s.id === scene.value)!, 14, onlyClear.value ? 0.75 : 0) : []))
const patterns = computed(() =>
  import.meta.client ? PATTERNS.map((p, i) => ({ ...p, c: i % 4, state: p.gram ? (gramCard(p.gram)?.state ?? '') : 'ok', ex: patternExamples(p, 5) })) : [],
)
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
function hl(ko: string, mark: string) {
  const at = mark ? ko.indexOf(mark) : -1
  return at < 0 ? [{ t: ko, m: false }] : [{ t: ko.slice(0, at), m: false }, { t: mark, m: true }, { t: ko.slice(at + mark.length), m: false }]
}
</script>

<template>
  <section class="pb" aria-label="Разговорник из влогов">
    <p class="pb-note">Живые фразы из влогов: по ситуациям и по шаблонам. Это справка, она нигде не записывается и не засчитывается.</p>
    <div class="pb-chips" role="group" aria-label="Раздел">
      <button type="button" class="pb-chip" :class="{ on: mode === 'scenes' }" :aria-pressed="mode === 'scenes'" @click="mode = 'scenes'">По ситуациям</button>
      <button type="button" class="pb-chip" :class="{ on: mode === 'patterns' }" :aria-pressed="mode === 'patterns'" @click="mode = 'patterns'">Шаблоны фраз</button>
    </div>

    <template v-if="mode === 'scenes'">
      <div class="pb-chips" role="group" aria-label="Ситуация">
        <button v-for="s in SCENES" :key="s.id" type="button" class="pb-chip" :class="{ on: scene === s.id }" :aria-pressed="scene === s.id" @click="scene = s.id">{{ s.label }}</button>
      </div>
      <label class="pb-chk"><input v-model="onlyClear" type="checkbox" /> только понятные (75% слов из моего словаря)</label>
      <ul class="pb-list">
        <li v-for="p in phrases" :key="`${p.id}-${p.i}`">
          <span lang="ko">{{ p.ko }}</span><br />{{ p.ru }}
          <NuxtLink :to="`/korean/vlog?v=${p.id}&t=${Math.floor(p.s)}`" class="pb-link">{{ p.title }}, {{ clock(p.s) }}</NuxtLink>
        </li>
      </ul>
      <p v-if="!phrases.length" class="pb-note">Подходящих фраз нет: сними галочку «только понятные».</p>
    </template>

    <ul v-else class="pb-pats">
      <li v-for="p in patterns" :key="p.id" class="pb-pat" :class="`c${p.c}`">
        <div class="pb-ph"><b lang="ko">{{ p.label }}</b><span>{{ p.ru }}</span><em v-if="p.gram" class="pb-st" :class="p.state">{{ GRAM_STATE[p.state] ?? '' }}</em></div>
        <p class="pb-hint">Подставь свои слова на место прочерков.</p>
        <ul class="pb-ex">
          <li v-for="e in p.ex" :key="`${e.id}-${e.i}`">
            <span lang="ko"><template v-for="(x, k) in hl(e.ko, e.mark)" :key="k"><mark v-if="x.m" class="pb-hl">{{ x.t }}</mark><template v-else>{{ x.t }}</template></template></span><br />{{ e.ru }}
            <NuxtLink :to="`/korean/vlog?v=${e.id}&t=${Math.floor(e.s)}`" class="pb-link">{{ e.title }}, {{ clock(e.s) }}</NuxtLink>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pb-note { margin: 12px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.pb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.pb-chip { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 4px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.pb-chip.on { background: var(--surface); border-color: var(--ink); color: var(--ink); font-weight: 600; }
.pb-chk { display: inline-flex; gap: 6px; align-items: center; margin-top: 12px; font-size: 14px; cursor: pointer; }
.pb-list { list-style: none; margin: 12px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }
@media (max-width: 760px) { .pb-list { grid-template-columns: 1fr; } }
.pb-list li { padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 15px; line-height: 1.55; }
.pb-link { display: block; color: var(--accent); font-size: 12.5px; text-decoration: none; }
.pb-pats { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 760px) { .pb-pats { grid-template-columns: 1fr; } }
.pb-pat.c0 { --c: #f06fa8; } .pb-pat.c1 { --c: #6a9cf0; } .pb-pat.c2 { --c: #e0a82e; } .pb-pat.c3 { --c: #3fae7a; }
.pb-pat { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-top: 4px solid var(--c); border-radius: 14px; background-color: var(--surface); background-image: linear-gradient(color-mix(in srgb, var(--c) 8%, transparent), transparent 60%); }
.pb-ph { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.pb-ph b { font-size: 18px; color: var(--c); }
.pb-ph span { color: var(--muted); font-size: 14px; }
.pb-st { margin-left: auto; border-radius: 999px; padding: 1px 10px; font-size: 12px; font-style: normal; background: var(--gold-soft); }
.pb-st.ok { background: var(--ok-bg); }
.pb-st.ahead { background: rgba(150, 190, 255, .22); }
.pb-hint { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.pb-ex { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; font-size: 14.5px; line-height: 1.55; }
.pb-ex li { padding: 4px 0 4px 10px; border-left: 3px solid var(--c); }
.pb-hl { background: color-mix(in srgb, var(--c) 32%, transparent); color: inherit; border-radius: 6px; padding: 0 3px; font-weight: 700; }
</style>

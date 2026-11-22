<script setup lang="ts">
import { computed, ref } from 'vue'
import { VLOGS } from '@/data/korean/vlogs'
import { coverageOf, coreWords } from '@/data/korean/vlog-lang'
import WordInVlogs from '@/components/korean/WordInVlogs.vue'

/**
 * Вкладка «Слова влогов»: (1) ядро: слова, которые звучат сразу в нескольких влогах, в порядке пользы; (2) охват: сколько слов каждого влога из твоего словаря.
 * Только справка: ничего не записывается и не засчитывается.
 */
const minVlogs = ref(5)
const onlyNew = ref(true)
const core = computed(() => (import.meta.client ? coreWords(minVlogs.value) : []))
const shown = computed(() => core.value.filter(c => !onlyNew.value || !c.word.own).slice(0, 120))
const ownShare = computed(() => (core.value.length ? Math.round((core.value.filter(c => c.word.own).length / core.value.length) * 100) : 0))
const open = ref('')

const coverage = computed(() =>
  import.meta.client ? VLOGS.map(v => ({ id: v.id, title: v.title, ...coverageOf(v) })).filter(x => x.total).sort((a, b) => b.pct - a.pct) : [],
)
const avg = computed(() => {
  const t = coverage.value.reduce((a, c) => a + c.total, 0)
  return t ? Math.round((coverage.value.reduce((a, c) => a + c.known, 0) / t) * 100) : 0
})
</script>

<template>
  <section class="cw" aria-label="Слова влогов">
    <p class="cw-note">Здесь слова, которые встречаются сразу в нескольких влогах: их выгоднее учить в первую очередь. Это справка, она нигде не записывается и не засчитывается.</p>
    <p class="cw-sum">Из таких слов ({{ core.length }}) в твоём словаре {{ ownShare }}%. В среднем по всем влогам знакомо <b>{{ avg }}%</b> слов текста.</p>

    <div class="cw-ctl" role="group" aria-label="Фильтр">
      <label>Звучит не меньше чем в
        <select v-model.number="minVlogs"><option v-for="n in [3, 5, 8, 12, 20]" :key="n" :value="n">{{ n }} влогах</option></select>
      </label>
      <label class="cw-chk"><input v-model="onlyNew" type="checkbox" /> только слова вне моего словаря</label>
    </div>

    <ul class="cw-list">
      <li v-for="c in shown" :key="c.key" class="cw-row" :class="{ own: c.word.own }">
        <button type="button" class="cw-head" :aria-expanded="open === c.key" @click="open = open === c.key ? '' : c.key">
          <b lang="ko">{{ c.word.own?.k ?? c.word.core }}</b>
          <span class="cw-ru">{{ c.word.own?.t ?? 'нет в твоём словаре' }}</span>
          <small>{{ c.vlogs }} влогов · {{ c.n }} раз</small>
        </button>
        <WordInVlogs v-if="open === c.key" :word-key="c.key" />
      </li>
    </ul>
    <p v-if="!shown.length" class="cw-note">С такими условиями слов нет: измени фильтр.</p>

    <h3 class="cw-h">Охват по влогам</h3>
    <p class="cw-note">Доля слов текста влога, которые есть в твоём словаре (с повторами, как они звучат). Влоги с большим охватом проще понимать.</p>
    <ul class="cw-cov">
      <li v-for="c in coverage" :key="c.id">
        <NuxtLink :to="`/korean/vlog?v=${c.id}`">{{ c.title }}</NuxtLink>
        <span class="cw-bar" :style="{ '--w': `${c.pct}%` }"><i></i></span>
        <b>{{ c.pct }}%</b>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.cw-note { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.cw-sum { margin: 10px 0 0; font-size: 15px; }
.cw-ctl { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; margin-top: 12px; font-size: 14px; }
.cw-ctl select { margin-left: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); padding: 4px 8px; font: inherit; }
.cw-chk { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.cw-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: start; }
@media (max-width: 760px) { .cw-list { grid-template-columns: 1fr; } }
.cw-row { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 4px 12px 8px; }
.cw-row.own { border-color: var(--ok); }
.cw-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; width: 100%; padding: 6px 0; border: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.cw-head b { font-size: 18px; }
.cw-ru { color: var(--muted); font-size: 14px; }
.cw-head small { margin-left: auto; color: var(--muted); font-size: 12px; }
.cw-h { margin: 26px 0 0; font-size: 18px; }
.cw-cov { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.cw-cov li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(80px, 1fr) 44px; gap: 10px; align-items: center; font-size: 14px; }
.cw-cov a { color: var(--ink); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cw-bar { display: block; height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
.cw-bar i { display: block; height: 100%; width: var(--w); background: var(--accent); }
.cw-cov b { text-align: right; }
</style>

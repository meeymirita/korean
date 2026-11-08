<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { DictHit } from '@/lib/dictApi'

defineProps<{ hit: DictHit; saved?: boolean; canSave?: boolean }>()
defineEmits<{ open: [hit: DictHit]; save: [hit: DictHit] }>()

/** Перевод: слова. Если у значения только описание без перевода, описание идёт в «Значение», а «Перевод» не показываем. */
const ruList = (s: { ru: { t: string; d: string }[] }) => s.ru.map(r => r.t).filter(Boolean).join('; ')
const defOf = (s: { ru: { t: string; d: string }[] }) => (ruList(s) ? s.ru[0]?.d ?? '' : s.ru.map(r => r.d).filter(Boolean).join(' '))
</script>

<template>
  <article class="card">
    <RouterLink :to="`/dict/${encodeURIComponent(hit.word)}`" class="cardlink" :aria-label="`Открыть слово ${hit.word}`" @click="$emit('open', hit)"></RouterLink>
    <header class="ch">
      <h3 lang="ko">{{ hit.word }}</h3>
      <span v-if="hit.hom" class="hom">№{{ hit.hom }}</span>
      <span v-if="hit.pron" class="pron">[{{ hit.pron }}]</span>
      <span class="chip">{{ hit.pos }}</span>
      <span class="chip lvl">{{ hit.level === 'нет' ? 'без уровня' : hit.level }}</span>
    </header>
    <div v-for="(s, i) in hit.senses" :key="i" class="sense">
      <p v-if="hit.senses.length > 1 || hit.moreSenses" class="sn"><span>{{ i + 1 }}</span>Значение {{ i + 1 }}</p>
      <dl class="kv">
        <template v-if="ruList(s)"><dt>Перевод</dt><dd class="ru">{{ ruList(s) }}</dd></template>
        <template v-if="defOf(s)"><dt>Значение</dt><dd>{{ defOf(s) }}</dd></template>
        <template v-if="s.ko"><dt>Определение</dt><dd lang="ko">{{ s.ko }}</dd></template>
        <template v-if="s.sent[0]"><dt>Пример</dt><dd class="exv"><span lang="ko">{{ s.sent[0] }}</span></dd></template>
      </dl>
    </div>
    <footer class="more">
      <span v-if="hit.moreSenses" class="lab">ещё значений: {{ hit.moreSenses }}</span>
      <template v-if="hit.forms.length"><span class="lab">Формы</span><span v-for="f in hit.forms.slice(0, 4)" :key="f" class="tag" lang="ko">{{ f }}</span></template>
      <button v-if="canSave" type="button" class="savebtn" :disabled="saved" @click.stop.prevent="$emit('save', hit)">{{ saved ? 'Записано' : 'Записать слово' }}</button>
      <span class="open">Открыть слово →</span>
    </footer>
  </article>
</template>

<style scoped>
.card { --a: #7a5ce0; --bg: #e8e0ff; --bg2: #f6f2ff; --t: #43308c; position: relative; padding: 24px 28px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); transition: transform .2s, box-shadow .2s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 22px 50px rgba(100, 87, 170, .18); }
.cardlink { position: absolute; inset: 0; border-radius: 24px; z-index: 1; }
.ch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 2px dotted var(--bg); }
.ch h3 { margin: 0; font-size: 32px; font-weight: 700; }
.hom, .pron { color: var(--muted); font-size: 14px; }
.chip { padding: 3px 12px; border-radius: 999px; background: var(--bg); color: var(--a); font-size: 12px; font-weight: 700; white-space: nowrap; }
.chip.lvl { background: transparent; border: 1px solid var(--bg); color: var(--t); }
.sense + .sense { margin-top: 20px; padding-top: 20px; border-top: 1px dotted var(--bg); }
.sn { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 12px; font-weight: 700; color: var(--a); }
.sn span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: var(--bg); }
.kv { margin: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 16px; }
.kv dt { padding-top: 3px; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.kv dd { margin: 0; color: #14173a; font-size: 15px; line-height: 1.55; }
.kv dd.ru { font-size: 18px; font-weight: 700; color: var(--t); line-height: 1.4; }
.exv { display: flex; flex-direction: column; gap: 4px; }
.more { position: relative; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 20px; pointer-events: none; }
.more > * { pointer-events: auto; }
.lab { margin-left: 4px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.lab:first-child { margin-left: 0; }
.tag { padding: 4px 12px; border-radius: 999px; background: var(--bg); color: var(--a); font-size: 14px; font-weight: 600; }
.savebtn { margin-left: auto; padding: 5px 14px; border: 1px solid #cbbcff; border-radius: 999px; background: #fff; color: var(--t); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.savebtn:disabled { opacity: .6; cursor: default; }
.open { margin-left: auto; font-size: 13px; font-weight: 600; color: var(--a); pointer-events: none !important; }
.savebtn ~ .open { margin-left: 8px; }
@media (max-width: 600px) { .kv { grid-template-columns: 1fr; gap: 2px; } .kv dd { margin-bottom: 8px; } .card { padding: 16px; } .ch h3 { font-size: 28px; } }
</style>

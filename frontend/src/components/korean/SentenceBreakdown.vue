<script setup lang="ts">
import { computed } from 'vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { analyze, type SegType } from '@/data/korean/parse'
import { TRANSLATIONS } from '@/data/korean/translations'

const props = defineProps<{ sentence: string }>()
const { open } = useGrammarModal()

const segments = computed(() => analyze(props.sentence))
const translation = computed(() => TRANSLATIONS[props.sentence])
const hasUnknown = computed(() => segments.value.some(s => s.type === 'unknown'))

const kind: Record<SegType, string> = {
  word: 'слово',
  verb: 'глагол',
  particle: 'частица',
  ending: 'окончание',
  num: 'число',
  unknown: 'нет в словаре',
}
</script>

<template>
  <div class="bd">
    <div class="bd-ko">{{ sentence }}</div>
    <div v-if="translation" class="bd-tr">«{{ translation }}»</div>

    <div class="bd-title">Как собрано</div>
    <div class="bd-cards">
      <div v-for="(s, i) in segments" :key="i" class="bd-card" :class="s.type">
        <div class="bd-kind">{{ kind[s.type] }}</div>
        <div class="bd-k">{{ s.text }}</div>
        <div v-if="s.reading" class="bd-r">{{ s.reading }}</div>
        <div class="bd-g">{{ s.type === 'unknown' ? '?' : s.gloss }}</div>
        <div v-if="s.explain" class="bd-ex">{{ s.explain }}</div>
        <button v-if="s.g" class="bd-rule" @click="open(s.g)">Правило →</button>
      </div>
    </div>
    <p v-if="hasUnknown" class="bd-note">«?» — этого слова нет в словаре. Добавь его в Notion, и оно появится в разборе.</p>
  </div>
</template>

<style>
.study .bd-ko { font-family: var(--ko); font-size: 26px; font-weight: 700; line-height: 1.3; }
.study .bd-tr { margin-top: 4px; font-size: 16px; color: var(--muted); }
.study .bd-title { margin-top: 16px; font-family: var(--mono); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); }
.study .bd-cards { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.study .bd-card { display: flex; flex-direction: column; gap: 2px; min-width: 104px; max-width: 220px; padding: 10px 14px;
  background: var(--bg); border: 1px solid var(--line-soft); border-radius: 12px; }
.study .bd-kind { font-family: var(--mono); font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.study .bd-k { font-family: var(--ko); font-size: 22px; font-weight: 700; line-height: 1.15; }
.study .bd-r { font-size: 12px; color: var(--muted); }
.study .bd-g { margin-top: 2px; font-size: 14px; line-height: 1.35; }
.study .bd-ex { margin-top: 4px; font-size: 12.5px; line-height: 1.4; color: var(--muted); }
.study .bd-rule { align-self: flex-start; margin-top: 6px; padding: 3px 10px; font-size: 12px; font-weight: 600; color: var(--gold);
  background: transparent; border: 1px solid var(--gold); border-radius: 99px; }
.study .bd-rule:hover { background: var(--gold); color: #fff; }
.study .bd-card.particle { background: var(--gold-soft); border-color: var(--gold); }
.study .bd-card.particle .bd-kind { color: var(--gold); }
.study .bd-card.ending { background: var(--ok-bg); border-color: var(--ok); }
.study .bd-card.ending .bd-kind { color: var(--ok); }
.study .bd-card.verb { border-color: #6a5a8a; }
.study .bd-card.verb .bd-kind { color: #6a5a8a; }
.study .bd-card.unknown { border-style: dashed; opacity: .75; }
.study .bd-note { margin: 10px 0 0; font-size: 12.5px; color: var(--muted); }

.study .se-btn { padding: 0; font: inherit; font-family: var(--ko); color: inherit; text-align: left; background: none; border: 0;
  border-bottom: 1px dotted var(--gold); cursor: pointer; }
.study .se-btn::after { content: " ▸"; font-size: .8em; color: var(--gold); }
.study .se-btn.open::after { content: " ▾"; }
.study .se-btn:hover { color: var(--gold); }
.study .row-detail { margin: 4px 0 12px; padding: 18px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
</style>

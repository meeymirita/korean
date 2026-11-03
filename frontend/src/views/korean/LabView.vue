<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G } from '@/data/korean/grammar'
import { build, DEPS, NOUNS, PARTICLES, treeLevels, VERB_FORMS, VERBS, type VerbForm } from '@/data/korean/lab'

const TABS = ['build', 'tree'] as const
const tab = useQueryParam<(typeof TABS)[number]>('tab', 'build', TABS)
const TAB_LABEL: Record<(typeof TABS)[number], string> = { build: 'Конструктор', tree: 'Дерево тем' }

/* Дерево тем */
const { open } = useGrammarModal()
const levels = treeLevels()
const card = (id: string) => G.find(g => g.id === id)
const LEVEL_NAME = ['Основа: с этого начинаем', 'Второй уровень', 'Третий уровень', 'Четвёртый уровень', 'Пятый уровень']

/* Конструктор */
const nounA = ref('저')
const partA = ref('topic')
const nounB = ref('커피')
const partB = ref('obj')
const verb = ref('마시다')
const form = ref<VerbForm>('present')
const particle = (id: string) => PARTICLES.find(p => p.id === id)!
const built = computed(() => build({ noun: nounA.value, p: particle(partA.value) }, { noun: nounB.value, p: particle(partB.value) }, VERBS.find(v => v.k === verb.value)!, form.value))
const gloss = computed(() => {
  const r = (k: string) => NOUNS.find(n => n.k === k)?.ru
  return `${nounA.value} (${r(nounA.value)}) · ${nounB.value} (${r(nounB.value)}) · ${verb.value} (${VERBS.find(v => v.k === verb.value)?.t})`
})
</script>

<template>
  <div class="wrap">
    <SectionHead id="lab" />
    <div class="chips">
      <button v-for="t in TABS" :key="t" type="button" class="chip" :class="{ on: tab === t }" @click="tab = t">{{ TAB_LABEL[t] }}</button>
    </div>

    <section v-if="tab === 'build'" class="lab-pane">
      <p class="intro">Выбери слова, частицы и форму глагола: предложение соберётся само, а под ним видно, почему выбрана именно такая форма.</p>
      <div class="slots">
        <div class="slot">
          <label>Слово 1</label>
          <select v-model="nounA"><option v-for="n in NOUNS" :key="n.k" :value="n.k">{{ n.k }} · {{ n.ru }}</option></select>
          <select v-model="partA"><option v-for="p in PARTICLES" :key="p.id" :value="p.id">{{ p.c === p.v ? p.c : p.c + ' / ' + p.v }} · {{ p.ru }}</option></select>
        </div>
        <div class="slot">
          <label>Слово 2</label>
          <select v-model="nounB"><option v-for="n in NOUNS" :key="n.k" :value="n.k">{{ n.k }} · {{ n.ru }}</option></select>
          <select v-model="partB"><option v-for="p in PARTICLES" :key="p.id" :value="p.id">{{ p.c === p.v ? p.c : p.c + ' / ' + p.v }} · {{ p.ru }}</option></select>
        </div>
        <div class="slot">
          <label>Глагол</label>
          <select v-model="verb"><option v-for="v in VERBS" :key="v.k" :value="v.k">{{ v.k }} · {{ v.t }}</option></select>
          <div class="chips tight">
            <button v-for="f in VERB_FORMS" :key="f.id" type="button" class="chip" :class="{ on: form === f.id }" @click="form = f.id">{{ f.label }}</button>
          </div>
        </div>
      </div>
      <div class="result">
        <div class="sentence">{{ built.sentence }}</div>
        <div class="gloss">{{ gloss }}</div>
        <ol class="steps"><li v-for="s in built.steps" :key="s">{{ s }}</li></ol>
        <p class="note">Предложение собрано по форме, смысл не проверяется: так видно, как работают частицы и окончания.</p>
      </div>
    </section>

    <section v-else-if="tab === 'tree'" class="lab-pane">
      <p class="intro">Какие темы на каких держатся: чтобы понять карточку, полезно знать те, что под её названием. Розовым отмечены пройденные темы. Нажми на карточку, чтобы открыть объяснение.</p>
      <div v-for="(ids, l) in levels" :key="l" class="level">
        <h3>{{ LEVEL_NAME[l] ?? 'Дальше' }}</h3>
        <div class="tree-row">
          <button v-for="id in ids" :key="id" type="button" class="tnode" :class="{ ok: card(id)?.st === 'ok' }" @click="open(id)">
            <b>{{ card(id)?.ko }}</b>
            <span class="tru">{{ card(id)?.ru }}</span>
            <span v-if="DEPS[id]?.length" class="tdep">опирается на: {{ DEPS[id]!.map(d => card(d)?.ko).join(', ') }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro { margin: 14px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.lab-pane { margin-top: 6px; }
.tight { margin-top: 8px; }
.slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 16px; }
.slot { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.slot label { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.slot select { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: var(--ink); font: inherit; font-size: 14px; }
.result { margin-top: 18px; padding: 20px 22px; border: 1px solid var(--line); border-radius: 18px; background: var(--gold-soft); }
.sentence { font-family: var(--ko); font-size: 32px; font-weight: 700; line-height: 1.25; word-break: keep-all; }
.gloss { margin-top: 4px; font-size: 14px; color: var(--muted); }
.steps { margin: 14px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 14.5px; line-height: 1.45; }
.level h3 { margin: 22px 0 8px; font-size: 14px; letter-spacing: .03em; color: var(--muted); }
.tree-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.tnode { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface);
  color: inherit; font: inherit; text-align: left; cursor: pointer; transition: transform .15s, border-color .15s; }
.tnode:hover { transform: translateY(-2px); border-color: var(--gold); }
.tnode.ok { border-color: var(--pink); background: var(--gold-soft); }
.tnode b { font-family: var(--ko); font-size: 16px; }
.tru { font-size: 12.5px; color: var(--muted); }
.tdep { margin-top: 4px; font-size: 11.5px; color: var(--muted); }
.note { margin: 12px 0 0; font-size: 12.5px; color: var(--muted); }
</style>

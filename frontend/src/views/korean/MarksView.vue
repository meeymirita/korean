<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import DictStar from '@/components/dict/DictStar.vue'
import MarkStar from '@/components/korean/MarkStar.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G } from '@/data/korean/grammar'
import { MARKS_DRILL_MIN, markedWords, marksTasks } from '@/data/korean/marks-drill'
import { kWords } from '@/lib/marks'
import { F } from '@/data/korean/render'
import { D } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const { open } = useGrammarModal()
const marks = computed(() => progress.data.settings.marks)
/** Порядок как в закладках: что отмечено позже, то ниже. Удалённых из словаря и грамматики слов нет в списке. */
const words = computed(() => marks.value.filter(m => m.startsWith('w:')).map(m => D.find(d => d.k === m.slice(2))).filter(Boolean) as typeof D)
/** Слова большого словаря (`k:<слово>`, звёздочка на `/dict/<слово>`): в серию по важным словам не идут, она берёт только `w:`. */
const kwords = computed(() => kWords(marks.value))
const rules = computed(() => marks.value.filter(m => m.startsWith('g:')).map(m => G.find(g => g.id === m.slice(2))).filter(Boolean) as typeof G)

/** «Потренировать важные слова»: серия только по словам со звёздочкой (`data/korean/marks-drill.ts`). */
const stats = computed(() => markedWords(progress.data))
const canDrill = computed(() => stats.value.usable.length >= MARKS_DRILL_MIN)
const drill = ref(false)
const drillTasks = ref<ReturnType<typeof marksTasks>>([])
const nextDrill = () => {
  drillTasks.value = marksTasks(progress.data)
  if (!drillTasks.value.length) drill.value = false
}
function startDrill() {
  drill.value = true
  nextDrill()
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="marks" :big="words.length + rules.length + kwords.length" />
    <section v-if="drill" class="mk-drill" aria-label="Потренировать важные слова">
      <div class="mk-drill-head">
        <h2 class="today-h">Важные слова</h2>
        <button type="button" class="chip" @click="drill = false">← К списку</button>
      </div>
      <TaskSession :tasks="drillTasks" source="trainer" mode="marks" again-label="Ещё серию" @again="nextDrill" />
    </section>

    <template v-else>
    <div class="mk-go">
      <button type="button" class="rs-start" :disabled="!canDrill" :title="canDrill ? undefined : 'Отметь хотя бы 4 слова звёздочкой'" @click="startDrill">Потренировать важные слова</button>
      <p v-if="!canDrill" class="mk-hint">Отметь хотя бы {{ MARKS_DRILL_MIN }} слова звёздочкой</p>
      <p v-else-if="stats.skipped" class="mk-hint">{{ stats.skipped }} слов вне заданий, их в серии нет</p>
    </div>
    <p v-if="!words.length && !rules.length && !kwords.length" class="cb-empty">
      Пока пусто. Нажми ☆ у слова в <RouterLink to="/korean/words">словаре</RouterLink> или в открытой карточке правила в
      <RouterLink to="/korean/grammar">грамматике</RouterLink>, и оно появится здесь.
    </p>

    <template v-if="words.length">
      <h2 class="today-h">Слова <small>{{ words.length }}</small></h2>
      <div class="tb">
        <div class="row h"><span>№</span><span>Корейский</span><span>Чтение</span><span>Перевод</span><span>Предложение</span></div>
        <div v-for="d in words" :key="d.n" class="row">
          <span class="n"><MarkStar kind="w" :id="d.k" /></span>
          <span class="k">{{ d.k }}</span>
          <span class="rd">{{ d.r }}</span>
          <span class="tr">{{ d.t }}</span>
          <span class="se">{{ d.s }}</span>
        </div>
      </div>
    </template>

    <template v-if="kwords.length">
      <h2 class="today-h">Из большого словаря <small>{{ kwords.length }}</small></h2>
      <ul class="mk-kw">
        <li v-for="w in kwords" :key="w">
          <RouterLink :to="`/dict/${encodeURIComponent(w)}`" lang="ko">{{ w }}</RouterLink>
          <DictStar :word="w" small />
        </li>
      </ul>
    </template>

    <template v-if="rules.length">
      <h2 class="today-h">Правила <small>{{ rules.length }}</small></h2>
      <div class="gg">
        <div v-for="g in rules" :key="g.id" class="gc mk-gc" role="button" tabindex="0" @click="open(g.id)" @keydown.enter="open(g.id)">
          <h3 v-html="F(g.ko)"></h3>
          <div class="rn">{{ g.ru }}</div>
          <div class="d">{{ g.d }}</div>
          <MarkStar kind="g" :id="g.id" />
        </div>
      </div>
    </template>
    </template>
  </div>
</template>

<style scoped>
.mk-go { margin: 6px 0 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.mk-go .rs-start:disabled { opacity: .5; cursor: not-allowed; }
.mk-hint { margin: 0; font-size: 14px; opacity: .75; }
.mk-kw { list-style: none; margin: 6px 0 14px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.mk-kw li { display: inline-flex; align-items: center; gap: 2px; padding: 4px 6px 4px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface, #fff); }
.mk-kw a { font-weight: 600; color: var(--ink); text-decoration: none; }
.mk-drill-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; }
.mk-drill-head .chip { cursor: pointer; font: inherit; font-weight: 600; color: var(--ink); }
</style>

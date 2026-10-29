<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G } from '@/data/korean/grammar'
import { F } from '@/data/korean/render'
import { randomTasks, randomWords } from '@/data/korean/tasks'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const WORDS = 10
const TASKS = 8

const words = ref(randomWords(WORDS))
const tasks = ref(randomTasks(TASKS))
/** id задания → выбранный вариант */
const picked = ref<Record<number, string>>({})
const revealed = ref<Record<number, boolean>>({})

const done = computed(() => Object.keys(picked.value).length)
const right = computed(() => tasks.value.filter(t => picked.value[t.id] === t.answer).length)

const gram = ref(pickGram())
function pickGram() {
  const list = G.filter(g => g.st === 'ok')
  return list[Math.floor(Math.random() * list.length)]!
}
const { open } = useGrammarModal()

function answer(id: number, option: string) {
  if (id in picked.value) return
  picked.value = { ...picked.value, [id]: option }
  const t = tasks.value.find(x => x.id === id)
  if (t) progress.record({ word: t.word, ok: option === t.answer, source: 'today' })
}
function newTasks() {
  tasks.value = randomTasks(TASKS)
  picked.value = {}
}
function newAll() {
  words.value = randomWords(WORDS)
  gram.value = pickGram()
  revealed.value = {}
  newTasks()
}
const toggle = (n: number) => (revealed.value = { ...revealed.value, [n]: !revealed.value[n] })
</script>

<template>
  <div class="wrap">
    <SectionHead id="today" />
    <div class="fcb">
      <button @click="newAll">🎲 Новый набор на сегодня</button>
    </div>

    <h2 class="today-h">Слова дня <small>нажми на слово — увидишь перевод</small></h2>
    <div class="tw">
      <button v-for="w in words" :key="w.n" class="tw-card" :class="{ open: revealed[w.n] }" @click="toggle(w.n)">
        <span class="k">{{ w.k }}</span>
        <span class="rd">{{ w.r }}</span>
        <span v-if="revealed[w.n]" class="tr">{{ w.t }}</span>
        <span v-if="revealed[w.n]" class="se">{{ w.s }}</span>
        <span v-else class="hint">?</span>
      </button>
    </div>
    <div class="fcb"><button class="plain" @click="words = randomWords(WORDS); revealed = {}">Другие слова</button></div>

    <h2 class="today-h">Правило дня</h2>
    <button class="gc today-gram" @click="open(gram.id)">
      <h3 v-html="F(gram.ko)"></h3>
      <div class="rn">{{ gram.ru }}</div>
      <div class="d">{{ gram.d }} · открыть объяснение</div>
    </button>

    <h2 class="today-h">
      Задания
      <small>{{ done }} из {{ tasks.length }} · верно {{ right }}</small>
    </h2>
    <ol class="tasks">
      <li v-for="(t, i) in tasks" :key="t.id" class="task" :class="{ done: t.id in picked }">
        <div class="task-top"><span class="num">{{ i + 1 }}</span>{{ t.title }}</div>
        <div class="task-q" :class="{ ko: t.kind !== 'back' }">{{ t.prompt }}</div>
        <div v-if="t.hint" class="task-hint">{{ t.hint }}</div>
        <div class="opts">
          <button
            v-for="o in t.options"
            :key="o"
            class="opt"
            :class="{
              ok: t.id in picked && o === t.answer,
              bad: picked[t.id] === o && o !== t.answer,
            }"
            :disabled="t.id in picked"
            @click="answer(t.id, o)"
          >
            {{ o }}
          </button>
        </div>
      </li>
    </ol>
    <div v-if="done === tasks.length" class="today-end">
      <b>Готово! {{ right }} из {{ tasks.length }}.</b>
      <button @click="newTasks">Ещё задания</button>
    </div>
    <div v-else class="fcb"><button class="plain" @click="newTasks">Другие задания</button></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { STYLES, politeRound, type PoliteTask } from '@/data/korean/vlog-polite'

/**
 * «Три формы вежливости»: лесенка из трёх ступеней и 10 заданий. Выбираешь форму под ситуацию или называешь стиль фразы;
 * после ответа сразу видно верное и почему. Только тренировка: ничего не записывается и не засчитывается.
 */
const tasks = ref<PoliteTask[]>(politeRound(10))
const i = ref(0)
const picked = ref('')
const score = ref(0)
const done = computed(() => i.value >= tasks.value.length)
const task = computed(() => tasks.value[i.value])
const answered = computed(() => !!picked.value)
const STEP: Record<string, string> = { casual: 'c0', polite: 'c1', formal: 'c2' }

function pick(key: string) {
  if (answered.value || !task.value) return
  picked.value = key
  if (key === task.value.correct) score.value++
}
function next() {
  picked.value = ''
  i.value++
}
function again() {
  tasks.value = politeRound(10)
  i.value = 0
  picked.value = ''
  score.value = 0
}
const level = computed(() => (picked.value ? task.value?.correct : ''))
</script>

<template>
  <section class="pf" aria-label="Три формы вежливости">
    <h3 class="pf-h">Потренируйся: три формы вежливости</h3>
    <p class="pf-note">Одно чувство, три способа сказать. Это справка и тренировка: ничего не записывается и не засчитывается.</p>

    <ol class="pf-steps" aria-label="Лесенка вежливости">
      <li v-for="(s, k) in STYLES" :key="s.id" :class="[STEP[s.id], { lit: level === s.id }]" :style="{ '--k': k }">
        <b lang="ko">{{ s.ko }}</b><span>{{ s.ru }}</span><small>{{ s.who }}</small>
      </li>
    </ol>

    <div v-if="!done && task" class="pf-card" :key="i">
      <p class="pf-count">{{ i + 1 }} из {{ tasks.length }} · верно {{ score }}</p>
      <p class="pf-q">{{ task.prompt }}</p>
      <p v-if="task.ko" class="pf-ko" lang="ko">{{ task.ko }}</p>
      <div class="pf-opts">
        <button v-for="o in task.options" :key="o.key" type="button" class="pf-opt" :class="[STEP[o.key], { right: answered && o.key === task.correct, wrong: answered && picked === o.key && o.key !== task.correct }]" :disabled="answered" @click="pick(o.key)">
          <b lang="ko">{{ o.label }}</b><small v-if="o.sub">{{ o.sub }}</small>
        </button>
      </div>
      <p v-if="answered" class="pf-why" :class="picked === task.correct ? 'ok' : 'bad'">{{ picked === task.correct ? 'Верно. ' : 'Не так. ' }}{{ task.why }}</p>
      <button v-if="answered" type="button" class="pf-next" @click="next">{{ i + 1 < tasks.length ? 'Дальше' : 'Итог' }}</button>
    </div>

    <div v-else class="pf-card pf-end">
      <p class="pf-big">{{ score }} из {{ tasks.length }}</p>
      <p>{{ score >= 8 ? 'Отлично: формы различаешь уверенно.' : score >= 5 ? 'Хорошо, но повтори лесенку: кому какая форма.' : 'Пока путаются: посмотри лесенку сверху и пройди ещё раз.' }}</p>
      <button type="button" class="pf-next" @click="again">Ещё раунд</button>
    </div>
  </section>
</template>

<style scoped>
.pf { margin-top: 18px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.pf-h { margin: 0; font-size: 18px; }
.pf-note { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
.pf-steps { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); align-items: end; gap: 8px; margin: 14px 0 0; padding: 0; }
.pf-steps li { display: grid; gap: 2px; padding: 10px 12px; border-radius: 14px 14px 6px 6px; color: #2b2250; transition: transform .35s cubic-bezier(.3, 1.5, .5, 1), box-shadow .35s; }
.pf-steps li:nth-child(1) { min-height: 78px; }
.pf-steps li:nth-child(2) { min-height: 104px; }
.pf-steps li:nth-child(3) { min-height: 130px; }
.pf-steps b { font-size: 20px; }
.pf-steps span { font-size: 14px; font-weight: 700; }
.pf-steps small { font-size: 12px; opacity: .8; line-height: 1.3; }
.c0 { --c: #ffc3d8; } .c1 { --c: #bfdcff; } .c2 { --c: #d9c6ff; }
.pf-steps li { background: var(--c); }
.pf-steps li.lit { transform: translateY(-8px) scale(1.04); box-shadow: 0 12px 24px rgba(60, 50, 110, .25); }
.pf-card { margin-top: 14px; padding: 14px; border: 1px solid var(--line-soft); border-radius: 16px; animation: pf-in .3s ease-out; }
@keyframes pf-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.pf-count { margin: 0; color: var(--muted); font-size: 13px; }
.pf-q { margin: 8px 0 0; font-size: 17px; line-height: 1.45; font-weight: 600; }
.pf-ko { margin: 10px 0 0; font-size: 28px; font-weight: 800; }
.pf-opts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
@media (max-width: 640px) { .pf-opts { grid-template-columns: 1fr; } .pf-steps small { display: none; } }
.pf-opt { display: grid; gap: 2px; justify-items: center; padding: 14px 8px; border: 2px solid transparent; border-radius: 14px; background: color-mix(in srgb, var(--c) 45%, transparent); color: var(--ink); font: inherit; cursor: pointer; transition: transform .2s, border-color .2s, background .2s; }
.pf-opt:hover:not(:disabled) { transform: translateY(-3px); border-color: var(--c); }
.pf-opt b { font-size: 19px; }
.pf-opt small { color: var(--muted); }
.pf-opt:disabled { cursor: default; }
.pf-opt.right { border-color: var(--ok); background: var(--ok-bg); animation: pf-pop .4s ease-out; }
.pf-opt.wrong { border-color: #d6455d; animation: pf-shake .35s; }
@keyframes pf-pop { 50% { transform: scale(1.06); } }
@keyframes pf-shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
.pf-why { margin: 12px 0 0; font-size: 14.5px; line-height: 1.5; }
.pf-why.ok { color: var(--ok); } .pf-why.bad { color: #d6455d; }
.pf-next { margin-top: 12px; border: 1px solid var(--gold); border-radius: 999px; background: var(--gold-soft); color: var(--ink); padding: 8px 20px; font: inherit; font-weight: 600; cursor: pointer; }
.pf-end { text-align: center; }
.pf-big { margin: 0; font-size: 34px; font-weight: 800; }
@media (prefers-reduced-motion: reduce) { .pf-card, .pf-opt.right, .pf-opt.wrong { animation: none; } .pf-steps li, .pf-opt { transition: none; } }
</style>

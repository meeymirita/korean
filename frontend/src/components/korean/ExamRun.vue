<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { blockPoints, partPoints, type ExamBlock, type ExamPiece, type PointResult } from '@/data/korean/exam'

/**
 * Одна часть итогового экзамена: крупные блоки на одной странице (текст с пропусками плитками, текст с вводом, перевод, порядок слов, поиск ошибок).
 * Ничего не проверяется и не показывается по ходу: кнопка внизу считает результат по каждому пункту (с правилом и разбором ошибки)
 * и отдаёт событием saved(points); результаты и разбор показывает страница экзамена после последней части.
 */
const props = defineProps<{ blocks: ExamBlock[]; part: number; parts: number }>()
const emit = defineEmits<{ saved: [points: PointResult[]] }>()

const total = computed(() => partPoints(props.blocks))
const checked = ref(false)
const norm = (s: string) => s.normalize('NFC').trim()

/** Ответы по ключам: `блок:предложение:часть` для пропусков, `блок:номер` для остального. */
const gap = reactive<Record<string, string>>({})
const pick = reactive<Record<string, string>>({})
const built = reactive<Record<string, number[]>>({})
const verdict = reactive<Record<string, boolean>>({})
const active = ref('')
// у списков перевода сразу выбрана подсказка «Выбери перевод…» (иначе поле выглядит пустым)
props.blocks.forEach((b, bi) => {
  if (b.kind === 'match') b.items.forEach((_, i) => (pick[`${bi}:${i}`] = ''))
})

const isGap = (p: ExamPiece): p is { answer: string; accept?: string[]; rule: string } => typeof p !== 'string'
const gapKeys = (bi: number) => {
  const b = props.blocks[bi]!
  if (b.kind !== 'gaps') return []
  return b.sentences.flatMap((s, si) => s.pieces.flatMap((p, pi) => (isGap(p) ? [`${bi}:${si}:${pi}`] : [])))
}
function putTile(bi: number, tile: string) {
  if (checked.value) return
  const keys = gapKeys(bi)
  const key = active.value && keys.includes(active.value) ? active.value : keys.find(k => !gap[k])
  if (!key) return
  gap[key] = tile
  active.value = keys.find(k => !gap[k]) ?? ''
}
function clearGap(key: string) {
  if (checked.value) return
  if (gap[key]) delete gap[key]
  active.value = key
}
const gapOk = (p: ExamPiece, key: string) => isGap(p) && [p.answer, ...(p.accept ?? [])].some(a => norm(a) === norm(gap[key] ?? ''))

/** Слова, собранные в предложение, как строка. */
const builtText = (bi: number, i: number, words: string[]) => (built[`${bi}:${i}`] ?? []).map(k => words[k]).join(' ')
function addWord(bi: number, i: number, k: number) {
  if (checked.value) return
  const key = `${bi}:${i}`
  built[key] = [...(built[key] ?? []), k]
}
function dropWord(bi: number, i: number, at: number) {
  if (checked.value) return
  const key = `${bi}:${i}`
  built[key] = (built[key] ?? []).filter((_, j) => j !== at)
}

/** Результат по каждому пункту, в том же порядке, что правила пунктов блоков (`blockRules`): верно ли и, если нет, ошибка с разбором. */
function check() {
  if (checked.value) return
  const points: PointResult[] = []
  props.blocks.forEach((b, bi) => {
    const add = (rule: string, ok: boolean, q: string, y: string, a: string) =>
      points.push({ rule, ok, ...(ok ? {} : { m: { b: b.title, q, y: y || '—', a } }) })
    if (b.kind === 'gaps') {
      b.sentences.forEach((s, si) =>
        s.pieces.forEach((p, pi) => {
          if (!isGap(p)) return
          const key = `${bi}:${si}:${pi}`
          // вопрос: предложение с этим пропуском (остальные пропуски показаны верными)
          add(p.rule, gapOk(p, key), s.pieces.map((x, j) => (isGap(x) ? (j === pi ? '＿＿' : x.answer) : x)).join(''), gap[key] ?? '', p.answer)
        }),
      )
    } else if (b.kind === 'match') {
      b.items.forEach((it, i) => add(it.rule, pick[`${bi}:${i}`] === it.ru, it.ko, pick[`${bi}:${i}`] ?? '', it.ru))
    } else if (b.kind === 'order') {
      b.items.forEach((it, i) => add(it.rule, builtText(bi, i, it.words) === it.ko, it.ru, builtText(bi, i, it.words), it.ko))
    } else {
      b.items.forEach((it, i) => add(it.rule, verdict[`${bi}:${i}`] === it.bad, it.ko, verdict[`${bi}:${i}`] ? 'Ошибка' : 'Верно', it.bad ? 'Ошибка' : 'Верно'))
    }
  })
  checked.value = true
  emit('saved', points)
}
const answered = computed(() => {
  let n = 0
  props.blocks.forEach((b, bi) => {
    if (b.kind === 'gaps') n += gapKeys(bi).filter(k => norm(gap[k] ?? '')).length
    else if (b.kind === 'match') n += b.items.filter((_, i) => pick[`${bi}:${i}`]).length
    else if (b.kind === 'order') n += b.items.filter((it, i) => (built[`${bi}:${i}`] ?? []).length === it.words.length).length
    else n += b.items.filter((_, i) => verdict[`${bi}:${i}`] !== undefined).length
  })
  return n
})
</script>

<template>
  <div class="er">
    <p class="er-top">Часть <b>{{ part }}</b> из {{ parts }}: <b>{{ total }}</b> пунктов. Результаты и разбор будут после последней части. Отвечено: {{ answered }} из {{ total }}.</p>

    <section v-for="(b, bi) in blocks" :key="b.id" class="er-block">
      <h2>{{ bi + 1 }}. {{ b.title }} <small>{{ blockPoints(b) }} п.</small></h2>
      <p class="er-note">{{ b.note }}</p>

      <template v-if="b.kind === 'gaps'">
        <div v-if="!b.typed" class="er-bank" role="group" aria-label="Плитки">
          <button v-for="t in b.bank" :key="t" type="button" class="er-tile ko" :disabled="checked" @click="putTile(bi, t)">{{ t }}</button>
        </div>
        <ol class="er-sents">
          <li v-for="(s, si) in b.sentences" :key="si">
            <div class="er-ko ko">
              <template v-for="(p, pi) in s.pieces" :key="pi">
                <template v-if="!isGap(p)">{{ p }}</template>
                <template v-else>
                  <input v-if="b.typed" v-model="gap[`${bi}:${si}:${pi}`]" class="er-gap ko" :disabled="checked" size="3" lang="ko" autocomplete="off" spellcheck="false" :aria-label="`Пропуск ${si + 1}`" />
                  <button v-else type="button" class="er-gap ko" :class="{ on: active === `${bi}:${si}:${pi}` }" @click="gap[`${bi}:${si}:${pi}`] ? clearGap(`${bi}:${si}:${pi}`) : (active = `${bi}:${si}:${pi}`)">{{ gap[`${bi}:${si}:${pi}`] || '＿' }}</button>
                </template>
              </template>
            </div>
            <div class="er-ru">{{ s.ru }}</div>
          </li>
        </ol>
      </template>

      <template v-else-if="b.kind === 'match'">
        <ol class="er-sents">
          <li v-for="(it, i) in b.items" :key="i">
            <div class="er-ko ko">{{ it.ko }}</div>
            <select v-model="pick[`${bi}:${i}`]" class="er-sel" :disabled="checked">
              <option value="" disabled>Выбери перевод…</option>
              <option v-for="c in b.choices" :key="c" :value="c">{{ c }}</option>
            </select>
          </li>
        </ol>
      </template>

      <template v-else-if="b.kind === 'order'">
        <ol class="er-sents">
          <li v-for="(it, i) in b.items" :key="i">
            <div class="er-ru">{{ it.ru }}</div>
            <div class="er-built ko">
              <button v-for="(k, at) in built[`${bi}:${i}`] ?? []" :key="at" type="button" class="er-tile ko on" :disabled="checked" @click="dropWord(bi, i, at)">{{ it.words[k] }}</button>
              <span v-if="!(built[`${bi}:${i}`] ?? []).length" class="er-empty">нажимай на слова ниже</span>
            </div>
            <div class="er-bank">
              <button v-for="(w, k) in it.words" :key="k" type="button" class="er-tile ko" :disabled="checked || (built[`${bi}:${i}`] ?? []).includes(k)" @click="addWord(bi, i, k)">{{ w }}</button>
            </div>
          </li>
        </ol>
      </template>

      <template v-else>
        <ol class="er-sents">
          <li v-for="(it, i) in b.items" :key="i">
            <div class="er-ko ko">{{ it.ko }}</div>
            <div class="er-ru">{{ it.ru }}</div>
            <div class="er-yn" role="group">
              <button type="button" class="er-tile" :class="{ on: verdict[`${bi}:${i}`] === false }" :disabled="checked" @click="verdict[`${bi}:${i}`] = false">Верно</button>
              <button type="button" class="er-tile" :class="{ on: verdict[`${bi}:${i}`] === true }" :disabled="checked" @click="verdict[`${bi}:${i}`] = true">Ошибка</button>
            </div>
          </li>
        </ol>
      </template>
    </section>

    <div class="er-foot">
      <button class="rs-start" type="button" :disabled="answered < total || checked" @click="check">{{ part < parts ? 'Сохранить часть' : 'Закончить экзамен' }}</button>
      <small v-if="answered < total">Ответь на все пункты: осталось {{ total - answered }}.</small>
      <small v-else-if="part < parts">Ответы сохранятся, потом можно остановиться и вернуться к части {{ part + 1 }}.</small>
    </div>
  </div>
</template>

<style scoped>
.er { --h: 44px; }
.er-top { margin: 12px 0 4px; color: var(--muted); line-height: 1.5; }
.er-block { margin: 20px 0; padding: 22px 26px 26px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); }
.er-block h2 { margin: 0; font-size: 20px; line-height: 1.3; }
.er-block h2 small { margin-left: 6px; color: var(--muted); font-weight: 500; font-size: 13px; }
.er-note { margin: 6px 0 14px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.er-bank { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.er-tile { box-sizing: border-box; min-width: 46px; height: var(--h); padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: transparent; font-size: 18px; line-height: 1; cursor: pointer; color: inherit; }
.er-tile:not(:disabled):hover { border-color: var(--pink, #d64da9); }
.er-tile.on { border-color: var(--pink, #d64da9); background: rgba(214, 77, 169, .1); }
.er-tile:disabled { cursor: default; opacity: .5; }
.er-sents { margin: 0; padding: 0 0 0 34px; display: grid; gap: 20px 48px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.er-sents > li { min-width: 0; padding-left: 4px; }
.er-sents > li::marker { color: var(--muted); font-size: 14px; }
@media (max-width: 900px) { .er-sents { grid-template-columns: 1fr; } }
.er-ko { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 4px; font-size: 22px; line-height: 1.4; min-height: var(--h); }
.er-ru { margin-top: 4px; color: var(--muted); font-size: 14px; line-height: 1.4; }
.er-gap { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: 64px; height: var(--h); margin: 0 2px; padding: 0 8px; border: 2px dashed var(--line); border-radius: 12px; background: transparent; font: inherit; font-size: 22px; line-height: 1; text-align: center; color: inherit; }
.er-gap:focus-visible, .er-gap.on { outline: none; border-color: var(--pink, #d64da9); }
.er-gap.ok { border: 2px solid #3aa660; background: #dff6e6; }
.er-gap.bad { border: 2px solid #d64d6a; background: #ffe1e6; }
.er-right { margin-left: 6px; color: #a1233c; font-size: 14px; font-weight: 600; }
.er-sel { box-sizing: border-box; display: block; width: 100%; height: var(--h); margin-top: 8px; padding: 0 44px 0 14px; border: 1px solid var(--line); border-radius: 12px; color: inherit; font: inherit; font-size: 15px; text-overflow: ellipsis;
  appearance: none; -webkit-appearance: none; background-color: var(--surface);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9' viewBox='0 0 14 9'%3E%3Cpath d='M1 1.5l6 6 6-6' fill='none' stroke='%238a84b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 16px center; cursor: pointer; }
.er-sel:focus-visible { outline: none; border-color: var(--pink, #d64da9); }
.er-sel.ok { border-color: #3aa660; background-color: #dff6e6; }
.er-sel.bad { border-color: #d64d6a; background-color: #ffe1e6; }
.er-built { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 60px; margin: 8px 0; padding: 7px 10px; border: 2px dashed var(--line); border-radius: 14px; }
.er-built.ok { border: 2px solid #3aa660; background: #dff6e6; }
.er-built.bad { border: 2px solid #d64d6a; background: #ffe1e6; }
.er-built .er-bank { margin: 0; }
.er-empty { padding-left: 4px; color: var(--muted); font-size: 14px; }
.er-yn { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.er-yn .er-tile { min-width: 96px; font-size: 16px; }
.er-mark { margin-left: 6px; font-weight: 600; font-size: 14px; }
.er-mark.ok { color: #1d6b3a; }
.er-mark.bad { color: #a1233c; }
.er-foot { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin: 22px 0 8px; }
.er-foot .rs-start { box-sizing: border-box; height: 48px; margin: 0; padding: 0 28px; }
.er-foot small { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.3; }
.er-foot .pg-v { margin: 0; }
</style>

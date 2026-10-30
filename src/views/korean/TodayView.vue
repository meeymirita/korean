<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { errText } from '@/lib/http'
import { checklistFor, snapshot } from '@/data/checklist'
import ExplainBox from '@/components/korean/ExplainBox.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import WordsCheck, { type WordsCheckResult } from '@/components/korean/WordsCheck.vue'
import { askConfirm } from '@/composables/useConfirm'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { usePersisted } from '@/composables/usePersisted'
import { useQueryParam } from '@/composables/useQueryParam'
import { G } from '@/data/korean/grammar'
import { F } from '@/data/korean/render'
import { ruleTasks } from '@/data/korean/rule-tasks'
import { randomTasks, randomWords, type Task } from '@/data/korean/tasks'
import { dayKey, useProgressStore } from '@/stores/progress'
import { isChecklist, useTodaySetsStore, type SavedSet, type SetData, type SnapTask } from '@/stores/todaySets'
import { useToastStore } from '@/stores/toast'

const progress = useProgressStore()
const sets = useTodaySetsStore()
const toast = useToastStore()
const WORDS = 10
const TASKS = 15

type Tab = 'today' | 'list' | 'history'
/** Вкладка в адресе (?tab=list|history), «Сегодня» без параметра. */
const tab = useQueryParam<Tab>('tab', 'today', ['today', 'list', 'history'])

const words = ref(randomWords(WORDS, progress.data.settings.cats))
const tasks = ref(randomTasks(TASKS, progress.data.settings.cats))
/** id задания → выбранный вариант (общий для заданий на правило и обычных) */
const picked = ref<Record<number, string>>({})
const revealed = ref<Record<number, boolean>>({})

const gram = ref(pickGram())
const ruleItems = ref<Task[]>(ruleTasks(gram.value))
function pickGram() {
  const list = G.filter(g => g.st === 'ok')
  return list[Math.floor(Math.random() * list.length)]!
}
const { open } = useGrammarModal()

const all = computed(() => [...ruleItems.value, ...tasks.value])
const done = computed(() => all.value.filter(t => t.id in picked.value).length)
const right = computed(() => all.value.filter(t => picked.value[t.id] === t.answer).length)
const tasksDone = computed(() => tasks.value.filter(t => t.id in picked.value).length)
const tasksRight = computed(() => tasks.value.filter(t => picked.value[t.id] === t.answer).length)

/* ---------- проверка слов ---------- */
const checking = ref(false)
const checkResult = ref<WordsCheckResult | null>(null)
function onChecked(r: WordsCheckResult) {
  checkResult.value = r
  checking.value = false
}

/* ---------- ответы и новый набор ---------- */
const saved = ref(false)
function answer(id: number, option: string) {
  if (id in picked.value) return
  picked.value = { ...picked.value, [id]: option }
  saved.value = false
  const t = all.value.find(x => x.id === id)
  if (t) progress.record({ word: t.word, ok: option === t.answer, source: 'today' })
}
function newTasks() {
  tasks.value = randomTasks(TASKS, progress.data.settings.cats)
  picked.value = Object.fromEntries(Object.entries(picked.value).filter(([id]) => ruleItems.value.some(t => t.id === Number(id))))
  saved.value = false
}
function newAll() {
  words.value = randomWords(WORDS, progress.data.settings.cats)
  gram.value = pickGram()
  ruleItems.value = ruleTasks(gram.value)
  revealed.value = {}
  picked.value = {}
  checking.value = false
  checkResult.value = null
  saved.value = false
  tasks.value = randomTasks(TASKS, progress.data.settings.cats)
}
const toggle = (n: number) => (revealed.value = { ...revealed.value, [n]: !revealed.value[n] })

/* ---------- проверить и сохранить ---------- */
const owner = computed(() => progress.unlocked && !progress.isGuest)
const showMissing = ref(false)
const saving = ref(false)
const snap = (t: Task): SnapTask => ({ title: t.title, prompt: t.prompt, hint: t.hint, options: t.options, answer: t.answer, picked: picked.value[t.id] ?? null, kind: t.kind })

async function checkAndSave() {
  if (saving.value || saved.value) return
  const missing = all.value.length - done.value
  showMissing.value = missing > 0
  if (missing > 0) {
    const yes = await askConfirm({ title: `Не выполнено заданий: ${missing}`, text: 'Можно вернуться и доделать, а можно сохранить набор как есть: пустые задания будут считаться неотвеченными.', ok: 'Сохранить как есть', cancel: 'Доделать' })
    if (!yes) return
  }
  saving.value = true
  try {
    await sets.save(dayKey(), right.value, all.value.length, {
      words: words.value.map(w => ({ k: w.k, r: w.r, t: w.t })),
      rule: { id: gram.value.id, ko: gram.value.ko, ru: gram.value.ru },
      ruleTasks: ruleItems.value.map(snap),
      tasks: tasks.value.map(snap),
      check: checkResult.value,
    })
    saved.value = true
    toast.ok('Набор проверен и сохранён в истории')
  } catch (e) {
    toast.error(errText(e))
  } finally {
    saving.value = false
  }
}

/* ---------- чек-лист на день ---------- */
const today = dayKey()
const items = checklistFor(today)
/** Вручную отмеченные пункты: помним до закрытия вкладки браузера; чужой день не берём. */
const ticks = usePersisted<{ day: string; ids: string[] }>('check_ticks', { day: today, ids: [] }, v => (v as { day?: string })?.day === today)
const ticked = (id: string) => ticks.value.ids.includes(id)
function tick(id: string) {
  ticks.value = { day: today, ids: ticked(id) ? ticks.value.ids.filter(x => x !== id) : [...ticks.value.ids, id] }
  listSaved.value = false
}
const snaps = computed(() => snapshot(items, progress.data.log, today, ticks.value.ids))
const listDone = computed(() => snaps.value.filter(s => s.done).length)
const listSaved = ref(false)
const listSaving = ref(false)
async function saveList() {
  listSaving.value = true
  try {
    if (!sets.loaded) await sets.load()
    // за один день храним один чек-лист: старый заменяем новым
    for (const old of sets.items.filter(s => s.day === today && isChecklist(s.data))) await sets.remove(old.id)
    await sets.save(today, listDone.value, items.length, { list: snaps.value })
    listSaved.value = true
    toast.ok('Чек-лист сохранён в истории')
  } catch (e) {
    toast.error(errText(e))
  } finally {
    listSaving.value = false
  }
}

/* ---------- история ---------- */
const openId = ref<string | null>(null)
async function loadHistory() {
  if (!owner.value) return
  try {
    await sets.load()
  } catch (e) {
    toast.error(errText(e))
  }
}
function showHistory() {
  tab.value = 'history'
}
onMounted(() => tab.value === 'history' && void loadHistory())
watch(tab, t => t === 'history' && void loadHistory())

const dateLabel = (d: string) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00'))
const timeLabel = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
async function removeSet(s: SavedSet) {
  const yes = await askConfirm({ title: 'Удалить сохранённый набор?', text: `${dateLabel(s.day)}, ${s.right} из ${s.total}. Это нельзя отменить.`, ok: 'Удалить', danger: true })
  if (!yes) return
  try {
    await sets.remove(s.id)
    toast.ok('Набор удалён')
  } catch (e) {
    toast.error(errText(e))
  }
}
/** Снимок набора заданий (запись не чек-лист). */
const tasksOf = (s: SavedSet) => s.data as SetData
const markOf = (t: SnapTask) => (t.picked === null ? 'skip' : t.picked === t.answer ? 'ok' : 'bad')
</script>

<template>
  <div class="wrap">
    <SectionHead id="today" />
    <div class="fcb td-bar">
      <button @click="tab = 'today'; newAll()">🎲 Новый набор на сегодня</button>
      <span class="td-tabs" role="tablist">
        <button role="tab" :aria-selected="tab === 'today'" :class="{ on: tab === 'today' }" @click="tab = 'today'">Сегодня</button>
        <button role="tab" :aria-selected="tab === 'list'" :class="{ on: tab === 'list' }" @click="tab = 'list'">Чек-лист</button>
        <button role="tab" :aria-selected="tab === 'history'" :class="{ on: tab === 'history' }" @click="showHistory">История</button>
      </span>
    </div>

    <template v-if="tab === 'today'">
      <h2 class="today-h">Правило дня</h2>
      <button class="gc today-gram" @click="open(gram.id)">
        <h3 v-html="F(gram.ko)"></h3>
        <div class="rn">{{ gram.ru }}</div>
        <div class="d">{{ gram.d }} · открыть объяснение</div>
      </button>

      <template v-if="ruleItems.length">
        <h2 class="today-h">Задание на правило <small>{{ ruleItems.filter(t => t.id in picked).length }} из {{ ruleItems.length }}</small></h2>
        <ol class="tasks">
          <li v-for="(t, i) in ruleItems" :key="t.id" class="task" :class="{ done: t.id in picked, missing: showMissing && !(t.id in picked) }">
            <div class="task-top"><span class="num">{{ i + 1 }}</span>{{ t.title }}</div>
            <div class="task-q ko">{{ t.prompt }}</div>
            <div v-if="t.hint" class="task-hint">{{ t.hint }}</div>
            <div class="opts">
              <button v-for="o in t.options" :key="o" class="opt" :class="{ ok: t.id in picked && o === t.answer, bad: picked[t.id] === o && o !== t.answer }" :disabled="t.id in picked" @click="answer(t.id, o)">{{ o }}</button>
            </div>
            <ExplainBox v-if="t.id in picked && picked[t.id] !== t.answer" :task="t" :picked="picked[t.id]!" />
          </li>
        </ol>
      </template>

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
      <div class="fcb">
        <button v-if="!checking" @click="checking = true">{{ checkResult ? '✓ Слова закрыты · ещё раз' : '✓ Закрыть слова' }}</button>
        <button class="plain" @click="words = randomWords(WORDS, progress.data.settings.cats); revealed = {}; checkResult = null; checking = false">Другие слова</button>
      </div>
      <WordsCheck v-if="checking" :key="words.map(w => w.n).join()" :words="words" @done="onChecked" @cancel="checking = false" />
      <p v-else-if="checkResult" class="td-res">
        Пары без ошибок: {{ checkResult.pairs.right }} из {{ checkResult.pairs.total }} · перевод: {{ checkResult.quiz.right }} из {{ checkResult.quiz.total }}<template v-if="checkResult.build.total"> · предложения: {{ checkResult.build.right }} из {{ checkResult.build.total }}</template>
      </p>

      <h2 class="today-h">
        Задания
        <small>{{ tasksDone }} из {{ tasks.length }} · верно {{ tasksRight }}</small>
      </h2>
      <ol class="tasks">
        <li v-for="(t, i) in tasks" :key="t.id" class="task" :class="{ done: t.id in picked, missing: showMissing && !(t.id in picked) }">
          <div class="task-top"><span class="num">{{ i + 1 }}</span>{{ t.title }}</div>
          <div class="task-q" :class="{ ko: t.kind !== 'back' }">{{ t.prompt }}</div>
          <div v-if="t.hint" class="task-hint">{{ t.hint }}</div>
          <div class="opts">
            <button v-for="o in t.options" :key="o" class="opt" :class="{ ok: t.id in picked && o === t.answer, bad: picked[t.id] === o && o !== t.answer }" :disabled="t.id in picked" @click="answer(t.id, o)">{{ o }}</button>
          </div>
          <ExplainBox v-if="t.id in picked && picked[t.id] !== t.answer" :task="t" :picked="picked[t.id]!" />
        </li>
      </ol>

      <div class="today-end">
        <b v-if="done === all.length">Всё выполнено! {{ right }} из {{ all.length }}.</b>
        <b v-else>Выполнено {{ done }} из {{ all.length }}, верно {{ right }}.</b>
        <button v-if="owner" :disabled="saving || saved" @click="checkAndSave">{{ saving ? 'Сохраняю…' : saved ? '✓ Сохранено в историю' : 'Проверить и сохранить' }}</button>
        <button class="plain" @click="newTasks">Другие задания</button>
      </div>
      <p v-if="!owner" class="td-res">Сохранять наборы в историю может только владелец.</p>
      <p v-else-if="saved" class="td-res">Набор лежит во вкладке <a href="#" @click.prevent="showHistory">«История»</a>.</p>
    </template>

    <template v-else-if="tab === 'list'">
      <h2 class="today-h">Чек-лист на сегодня <small>{{ listDone }} из {{ items.length }}</small></h2>
      <p class="td-res">Набор меняется каждый день. Ответы считаются сами, пункт без счётчика отметь галочкой.</p>
      <ul class="cl">
        <li v-for="(it, i) in items" :key="it.id" :class="{ ok: snaps[i]!.done }">
          <input v-if="!it.source" type="checkbox" :checked="ticked(it.id)" :aria-label="it.text" @change="tick(it.id)" />
          <span v-else class="cl-mark">{{ snaps[i]!.done ? '✓' : '○' }}</span>
          <RouterLink :to="it.to">{{ it.text }}</RouterLink>
          <small v-if="it.source">{{ snaps[i]!.have }} из {{ it.goal }}</small>
        </li>
      </ul>
      <div class="today-end">
        <b v-if="listDone === items.length">Всё сделано!</b>
        <b v-else>Сделано {{ listDone }} из {{ items.length }}.</b>
        <button v-if="owner" :disabled="listSaving || listSaved" @click="saveList">{{ listSaving ? 'Сохраняю…' : listSaved ? '✓ Сохранено в историю' : 'Сохранить в историю' }}</button>
      </div>
      <p v-if="!owner" class="td-res">Сохранять в историю может только владелец.</p>
    </template>

    <template v-else>
      <p v-if="!owner" class="cb-empty">История наборов доступна владельцу после входа по токену.</p>
      <p v-else-if="sets.loaded && !sets.items.length" class="cb-empty">Пока ничего не сохранено. Выполни задания или чек-лист и нажми «Сохранить».</p>
      <ul class="td-hist">
        <li v-for="s in sets.items" :key="s.id" class="td-set">
          <button class="td-sh" :aria-expanded="openId === s.id" @click="openId = openId === s.id ? null : s.id">
            <b>{{ dateLabel(s.day) }}</b>
            <span class="td-time">{{ timeLabel(s.created) }}</span>
            <span class="td-score" :class="{ full: s.right === s.total }">{{ s.right }} из {{ s.total }}</span>
            <span v-if="s.data && isChecklist(s.data)" class="td-rule">чек-лист</span>
            <span v-else-if="s.data?.rule" class="td-rule ko">{{ s.data.rule.ko }}</span>
          </button>
          <div v-if="openId === s.id && s.data && isChecklist(s.data)" class="td-body">
            <ul class="cl">
              <li v-for="(c, i) in s.data.list" :key="i" :class="{ ok: c.done }">
                <span class="cl-mark">{{ c.done ? '✓' : '○' }}</span>
                <RouterLink :to="c.to">{{ c.text }}</RouterLink>
                <small>{{ c.manual ? (c.done ? 'отмечено' : 'не отмечено') : `${c.have} из ${c.goal}` }}</small>
              </li>
            </ul>
            <button class="plain danger td-del" @click="removeSet(s)">Удалить запись</button>
          </div>
          <div v-else-if="openId === s.id && s.data" class="td-body">
            <p v-if="tasksOf(s).words.length" class="td-words"><span v-for="w in tasksOf(s).words" :key="w.k" :title="w.t" class="ko">{{ w.k }}</span></p>
            <p v-if="tasksOf(s).check" class="td-res">Слова закрыты: пары {{ tasksOf(s).check!.pairs.right }}/{{ tasksOf(s).check!.pairs.total }} · перевод {{ tasksOf(s).check!.quiz.right }}/{{ tasksOf(s).check!.quiz.total }}<template v-if="tasksOf(s).check!.build.total"> · предложения {{ tasksOf(s).check!.build.right }}/{{ tasksOf(s).check!.build.total }}</template></p>
            <p v-else class="td-res">Слова в этот раз не закрывали.</p>
            <ol class="td-tasks">
              <li v-for="(t, i) in [...tasksOf(s).ruleTasks, ...tasksOf(s).tasks]" :key="i" :class="markOf(t)">
                <span class="ko">{{ t.prompt }}</span>
                <small v-if="t.hint">{{ t.hint }}</small>
                <span class="td-ans">
                  <template v-if="markOf(t) === 'ok'">✓ {{ t.answer }}</template>
                  <template v-else-if="markOf(t) === 'bad'">✗ {{ t.picked }} → {{ t.answer }}</template>
                  <template v-else>— не отвечено, верно: {{ t.answer }}</template>
                </span>
              </li>
            </ol>
            <button class="plain danger td-del" @click="removeSet(s)">Удалить набор</button>
          </div>
          <div v-else-if="openId === s.id" class="td-body"><p class="td-res">Подробности этого набора не читаются.</p></div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style>
.study .td-bar { align-items: center; justify-content: space-between; }
.study .td-tabs { display: inline-flex; padding: 3px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.study .fcb .td-tabs button { padding: 8px 18px; color: var(--ink); background: transparent; border: 0; border-radius: 11px; }
.study .fcb .td-tabs button.on { color: #fff; background: var(--gold); }
.study .task.missing { border-color: #b44634; }
.study .today-end button:disabled { opacity: .6; cursor: default; }
.study .td-res { margin: 10px 0 0; font-size: 14px; color: var(--muted); }
.study .td-hist { display: flex; flex-direction: column; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
.study .td-set { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.study .td-sh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; width: 100%; padding: 14px 18px; font: inherit; text-align: left; color: var(--ink); background: transparent; border: 0; cursor: pointer; }
.study .td-time { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.study .td-score { margin-left: auto; padding: 2px 12px; font-size: 13px; font-weight: 700; color: var(--gold); background: var(--gold-soft); border-radius: 99px; }
.study .td-score.full { color: #fff; background: var(--gold); }
.study .td-rule { font-size: 14px; color: var(--muted); }
.study .td-body { padding: 0 18px 16px; }
.study .td-words { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.study .td-words span { padding: 4px 10px; font-size: 16px; font-weight: 600; background: var(--gold-soft); border-radius: 99px; }
.study .td-tasks { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; padding-left: 22px; font-size: 14px; }
.study .td-tasks li.ok { color: var(--ok, #3d8b5f); }
.study .td-tasks li.bad { color: #b44634; }
.study .td-tasks li.skip { color: var(--muted); }
.study .td-tasks .ko { display: block; font-size: 16px; font-weight: 600; color: var(--ink); }
.study .td-tasks small { display: block; color: var(--muted); }
.study .td-ans { display: block; }
.study .td-del { padding: 8px 16px; font: inherit; font-size: 13px; color: #b44634; background: transparent; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.study .cl { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; }
.study .cl li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.study .cl li.ok { border-color: var(--ok, #3d8b5f); }
.study .cl a { font-weight: 600; color: var(--ink); }
.study .cl small { margin-left: auto; color: var(--muted); }
.study .cl-mark { width: 16px; text-align: center; color: var(--muted); }
.study .cl li.ok .cl-mark { color: var(--ok, #3d8b5f); }
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useNewWordsStore } from '@/stores/newWords'
import { KIND_NAME, TYPE_NAME, useMaterialsStore, type MaterialBatch, type MaterialItem } from '@/stores/materials'
import { useToastStore } from '@/stores/toast'
import { useProgressStore } from '@/stores/progress'
import { errText, fetchT } from '@/lib/http'
import { askConfirm } from '@/composables/useConfirm'
import { usePersisted } from '@/composables/usePersisted'

/**
 * «Входящие» на странице «Слова»: записанные слова, присланные материалы (тетради, учебник, задания Леры) и подсказка, как их отправлять.
 * Отправлять может владелец или Claude из десктопного приложения по временному токену (10 минут, только чтение и добавление).
 */
const words = useNewWordsStore()
const mats = useMaterialsStore()
const toast = useToastStore()

const tab = usePersisted('inbox_tab', 'words', v => v === 'words' || v === 'materials' || v === 'learning' || v === 'send')
const open = ref<string | null>(null)
const BASE = computed(() => (import.meta.client ? location.origin : 'https://korean.meeymirita.ru'))

onMounted(() => {
  words.load().catch(() => {})
  mats.load().catch(e => toast.error((e as Error).message))
  mats.loadFormat().catch(() => {})
})

// ---- токен для Claude ----
const tok = ref<{ token: string; expires: number; write: boolean } | null>(null)
const left = ref(0)
let tick: ReturnType<typeof setInterval> | undefined
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
function clearTok() {
  clearInterval(tick)
  tok.value = null
}
async function makeToken(write: boolean) {
  try {
    tok.value = await words.createToken(write)
    left.value = tok.value.expires - Date.now()
    clearInterval(tick)
    tick = setInterval(() => {
      left.value = (tok.value?.expires ?? 0) - Date.now()
      if (left.value <= 0) clearTok()
    }, 1000)
  } catch (e) {
    toast.error((e as Error).message)
  }
}
async function revoke() {
  try {
    await words.revokeToken()
    clearTok()
    toast.ok('Токен отозван')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
onBeforeUnmount(() => clearInterval(tick))

async function copy(text: string, what = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text)
    toast.ok(what)
  } catch {
    toast.error('Не удалось скопировать: выдели текст и скопируй вручную')
  }
}

// ---- что изучено: GET /api/learning (закрыт токеном, поэтому ссылкой не открыть: читаем с токеном владельца) ----
interface Learning {
  generated: string
  grammar: { passedCount: number; passed: string[]; notYet: string[] }
  words: { learned: number; inProgress: number; learnedThisWeek: string[]; weak: { word: string; ok: number; bad: number }[] }
  activity: { streakDays: number; lastAnswer: string | null; last7Days: { ok: number; bad: number; activeDays: number; minutes: number }; last30Days: { ok: number; bad: number; activeDays: number; minutes: number }; weakModes: { source: string; mode: string; answers: number; accuracy: number }[] }
  inbox: { newWords: number; materialsToReview: number }
}
const progress = useProgressStore()
const learning = ref<Learning | null>(null)
const learningRaw = ref('')
const learningErr = ref('')
async function loadLearning() {
  learningErr.value = ''
  try {
    const res = await fetchT('/api/learning', { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка ${res.status}`)
    const data = (await res.json()) as Learning
    learning.value = data
    learningRaw.value = JSON.stringify(data, null, 2)
  } catch (e) {
    learningErr.value = errText(e)
  }
}
function openLearning() {
  tab.value = 'learning'
  void loadLearning()
}
onMounted(() => tab.value === 'learning' && loadLearning())

// ---- материалы ----
const date = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const counts = (b: MaterialBatch) => {
  const c: Partial<Record<MaterialItem['type'], number>> = {}
  for (const it of b.items) c[it.type] = (c[it.type] ?? 0) + 1
  return (Object.entries(c) as [MaterialItem['type'], number][]).map(([t, n]) => `${TYPE_NAME[t]} ${n}`).join(' · ')
}
async function toggleDone(b: MaterialBatch) {
  try {
    await mats.setStatus(b.id, b.status === 'done' ? 'new' : 'done')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
async function removeBatch(b: MaterialBatch) {
  if (!(await askConfirm({ title: `Удалить пачку «${b.source}»?`, ok: 'Удалить', danger: true }))) return
  try {
    await mats.remove(b.id)
    toast.ok('Удалено')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
async function removeWord(id: string, ko: string) {
  if (!(await askConfirm({ title: `Удалить «${ko || 'заметку'}»?`, ok: 'Удалить', danger: true }))) return
  try {
    await words.remove(id)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

// ---- как отправить: готовые запросы под каждый маршрут ----
const TOKEN_HINT = 'ТОКЕН'
const pretty = (v: unknown) => JSON.stringify(v, null, 2)
const shell = (s: string) => s.replace(/'/g, `'\\''`)
const curlGet = (path: string) => `curl -s ${BASE.value}${path} \\\n  -H "Authorization: Bearer ${TOKEN_HINT}"`
const curlPost = (path: string, body: unknown) => `curl -s -X POST ${BASE.value}${path} \\\n  -H "Authorization: Bearer ${TOKEN_HINT}" \\\n  -H "Content-Type: application/json" \\\n  -d '${shell(pretty(body))}'`
const examples = computed(() => [
  { title: 'Узнать формат (без токена)', note: 'Открытый адрес: Claude читает его первым, чтобы знать типы и лимиты.', code: `curl -s ${BASE.value}/api/materials/format` },
  { title: 'Правила проверки (без токена)', note: 'Открытый адрес: что пройдено, что писать нельзя (с примерами плохо / хорошо), условия платформы. Claude читает его до отправки и проверяет свои предложения.', code: `curl -s ${BASE.value}/api/public/rules` },
  { title: 'Добавить слово', note: 'POST /api/new-words · токен с записью. Слово попадает в «Новые слова».', code: curlPost('/api/new-words', { ko: '기다리다', reading: 'кидарида', ru: 'ждать', example: '친구를 기다려요.' }) },
  { title: 'Отправить материалы', note: 'POST /api/materials · токен с записью. Пачка: источник, вид и список элементов (слово, предложение, диалог, текст, грамматика, задание, заметка).', code: curlPost('/api/materials', mats.format?.example ?? { source: '…', kind: 'workbook', items: [] }) },
  { title: 'Прочитать записанные слова', note: 'GET /api/new-words · любой токен.', code: curlGet('/api/new-words') },
  { title: 'Прочитать присланные пачки', note: 'GET /api/materials · любой токен.', code: curlGet('/api/materials') },
  { title: 'Что изучено и пройдено (кратко)', note: 'GET /api/learning · любой токен. Пройденная грамматика, что ещё впереди, слова, серия дней и слабые места: Claude читает это первым, чтобы не выходить за пройденное.', code: curlGet('/api/learning') },
])
const claudeAsk = computed(
  () => `Вот токен для платформы 우리말: ${tok.value?.token ?? TOKEN_HINT} (действует 10 минут).\nСначала прочитай, что уже пройдено: GET ${BASE.value}/api/learning (с этим токеном), правила проверки: ${BASE.value}/api/public/rules и описание формата: ${BASE.value}/api/materials/format\nПроверь свои предложения по правилам, потом отправляй.\nПотом отправь материал из этого файла одним запросом POST ${BASE.value}/api/materials (слова и предложения тоже сюда, слова попадут и в «Новые слова»). В словарь ничего не вноси.`,
)
</script>

<template>
  <section class="inbox" aria-label="Входящие">
    <div class="ib-head">
      <h2>Входящие</h2>
      <p class="ib-sub">Сюда попадают слова и материалы из тетрадей, учебника и заданий Леры: ты вносишь сам или Claude из десктопного приложения по токену. В словарь и грамматику ничего не попадает само.</p>
    </div>

    <div class="ib-tok">
      <div class="ib-tok-btns">
        <button type="button" class="ib-btn" @click="makeToken(true)">Токен для Claude: запись</button>
        <button type="button" class="ib-btn ghost" @click="makeToken(false)">Токен: только чтение</button>
        <span class="ib-note">живёт 10 минут; запись = читать и добавлять, править и удалять нельзя</span>
      </div>
      <div v-if="tok" class="ib-tokbox">
        <b>{{ tok.write ? 'Токен с записью' : 'Токен на чтение' }} <small>действует ещё {{ mmss(left) }}</small></b>
        <code>{{ tok.token }}</code>
        <div class="ib-tok-btns">
          <button type="button" class="ib-btn" @click="copy(tok.token, 'Токен скопирован')">Скопировать токен</button>
          <button v-if="tok.write" type="button" class="ib-btn ghost" @click="copy(claudeAsk, 'Просьба для Claude скопирована')">Скопировать просьбу для Claude</button>
          <button type="button" class="ib-btn ghost" @click="revoke">Отозвать</button>
        </div>
        <p>Токен показывается один раз; новый отменяет прежний.</p>
      </div>
    </div>

    <div class="ib-tabs" role="tablist">
      <button type="button" class="chip" :class="{ on: tab === 'words' }" role="tab" :aria-selected="tab === 'words'" @click="tab = 'words'">Слова · {{ words.items.length }}</button>
      <button type="button" class="chip" :class="{ on: tab === 'materials' }" role="tab" :aria-selected="tab === 'materials'" @click="tab = 'materials'">Материалы · {{ mats.batches.length }}</button>
      <button type="button" class="chip" :class="{ on: tab === 'learning' }" role="tab" :aria-selected="tab === 'learning'" @click="openLearning">Что изучено</button>
      <button type="button" class="chip" :class="{ on: tab === 'send' }" role="tab" :aria-selected="tab === 'send'" @click="tab = 'send'">Как отправить</button>
    </div>

    <!-- слова -->
    <div v-if="tab === 'words'" class="ib-list">
      <p v-if="!words.items.length" class="ib-empty">Записанных слов пока нет. Они появятся, когда Claude отправит их по токену (вкладка «Как отправить»).</p>
      <article v-for="w in words.items" :key="w.id" class="ib-card">
        <header>
          <span class="ko">{{ w.ko || 'заметка' }}</span>
          <span v-if="w.reading" class="ib-muted">{{ w.reading }}</span>
          <span v-if="w.ru">{{ w.ru }}</span>
          <time class="ib-muted">{{ date(w.created) }}</time>
          <button type="button" class="ib-x" aria-label="Удалить" @click="removeWord(w.id, w.ko)">✕</button>
        </header>
        <p v-if="w.example" class="ko ib-ex">{{ w.example }}</p>
        <p v-if="w.note" class="ib-pre">{{ w.note }}</p>
      </article>
    </div>

    <!-- материалы -->
    <div v-else-if="tab === 'materials'" class="ib-list">
      <p v-if="!mats.batches.length" class="ib-empty">Материалов пока нет. Они появятся, когда Claude отправит пачку (вкладка «Как отправить»).</p>
      <article v-for="b in mats.batches" :key="b.id" class="ib-card" :class="{ done: b.status === 'done' }">
        <header>
          <button type="button" class="ib-title" :aria-expanded="open === b.id" @click="open = open === b.id ? null : b.id">
            <span class="ib-arrow" :class="{ open: open === b.id }" aria-hidden="true">▸</span>{{ b.source }}
          </button>
          <span class="ib-badge">{{ KIND_NAME[b.kind] ?? b.kind }}</span>
          <span v-if="b.status === 'done'" class="ib-badge ok">разобрано</span>
          <time class="ib-muted">{{ date(b.created) }}</time>
        </header>
        <p class="ib-muted">{{ counts(b) }}</p>
        <div v-if="open === b.id" class="ib-items">
          <template v-for="(it, i) in b.items" :key="i">
            <div class="ib-item">
              <span class="ib-type">{{ TYPE_NAME[it.type] }}</span>
              <template v-if="it.type === 'word'">
                <b class="ko">{{ it.ko }}</b> {{ it.reading }} — {{ it.ru }}<span v-if="it.example" class="ko ib-ex"> · {{ it.example }}</span>
              </template>
              <template v-else-if="it.type === 'sentence'">
                <span class="ko">{{ it.ko }}</span> — {{ it.ru }}<span v-if="it.topic" class="ib-muted"> ({{ it.topic }})</span>
              </template>
              <template v-else-if="it.type === 'dialog'">
                <b v-if="it.title">{{ it.title }}</b>
                <div v-for="(l, j) in it.lines" :key="j"><span class="ko">{{ l.ko }}</span> — {{ l.ru }}</div>
              </template>
              <template v-else-if="it.type === 'text'">
                <b v-if="it.title" class="ko">{{ it.title }}</b>
                <div v-for="(l, j) in it.sentences" :key="j"><span class="ko">{{ l.ko }}</span> — {{ l.ru }}</div>
                <div v-for="(q, j) in it.questions" :key="`q${j}`" class="ib-q">
                  {{ j + 1 }}. {{ q.q }}
                  <span v-for="(o, k) in q.options" :key="k" :class="{ right: k === q.answer }"> {{ k + 1 }}) {{ o }}</span>
                </div>
              </template>
              <template v-else-if="it.type === 'grammar'">
                <b>{{ it.title }}</b> {{ it.note }}
                <div v-for="(l, j) in it.examples" :key="j"><span class="ko">{{ l.ko }}</span> — {{ l.ru }}</div>
              </template>
              <template v-else-if="it.type === 'exercise'">
                {{ it.prompt }}<span v-if="it.body" class="ib-pre"> {{ it.body }}</span><span v-if="it.answer" class="ib-muted"> · ответ: {{ it.answer }}</span>
              </template>
              <template v-else>{{ it.text }}</template>
            </div>
          </template>
        </div>
        <footer>
          <button type="button" class="ib-btn ghost" @click="toggleDone(b)">{{ b.status === 'done' ? 'Вернуть в новые' : 'Отметить разобранным' }}</button>
          <button type="button" class="ib-btn ghost danger" @click="removeBatch(b)">Удалить</button>
        </footer>
      </article>
    </div>

    <!-- что изучено -->
    <div v-else-if="tab === 'learning'" class="ib-list">
      <p class="ib-hint">Краткая сводка, которую получает Claude по адресу <code>GET {{ BASE }}/api/learning</code> (нужен токен). Здесь она открыта под твоим входом.</p>
      <p v-if="learningErr" class="ib-empty">Не получилось загрузить: {{ learningErr }}</p>
      <template v-if="learning">
        <article class="ib-card">
          <header><b>Грамматика</b><span class="ib-badge ok">пройдено {{ learning.grammar.passedCount }}</span><span class="ib-badge">впереди {{ learning.grammar.notYet.length }}</span></header>
          <p class="ib-muted">{{ learning.grammar.passed.map(g => g.split(' — ')[0]).join(' · ') }}</p>
          <p class="ib-muted"><b>Впереди:</b> {{ learning.grammar.notYet.join('; ') }}</p>
        </article>
        <article class="ib-card">
          <header><b>Слова</b><span class="ib-badge ok">выучено {{ learning.words.learned }}</span><span class="ib-badge">в работе {{ learning.words.inProgress }}</span></header>
          <p v-if="learning.words.learnedThisWeek.length" class="ib-muted ko">За неделю: {{ learning.words.learnedThisWeek.join(' · ') }}</p>
          <p v-if="learning.words.weak.length" class="ib-muted ko">Слабые: {{ learning.words.weak.map(w => `${w.word} (${w.ok}/${w.bad})`).join(' · ') }}</p>
        </article>
        <article class="ib-card">
          <header><b>Учёба</b><span class="ib-badge">серия {{ learning.activity.streakDays }} дн.</span><time class="ib-muted">последний ответ: {{ learning.activity.lastAnswer ?? '—' }}</time></header>
          <p class="ib-muted">7 дней: верно {{ learning.activity.last7Days.ok }}, ошибок {{ learning.activity.last7Days.bad }}, дней занятий {{ learning.activity.last7Days.activeDays }}, {{ learning.activity.last7Days.minutes }} мин · 30 дней: верно {{ learning.activity.last30Days.ok }}, ошибок {{ learning.activity.last30Days.bad }}, дней {{ learning.activity.last30Days.activeDays }}, {{ learning.activity.last30Days.minutes }} мин</p>
          <p v-if="learning.activity.weakModes.length" class="ib-muted">Слабые режимы: {{ learning.activity.weakModes.map(m => `${m.mode} ${m.accuracy}%`).join(' · ') }}</p>
        </article>
        <article class="ib-card">
          <header><b>Весь ответ (JSON)</b><button type="button" class="ib-btn ghost small" @click="copy(learningRaw, 'JSON скопирован')">Копировать</button><button type="button" class="ib-btn ghost small" @click="loadLearning">Обновить</button></header>
          <pre class="ib-code">{{ learningRaw }}</pre>
        </article>
      </template>
    </div>

    <!-- как отправить -->
    <div v-else class="ib-list">
      <p class="ib-hint">
        1. Нажми «Токен для Claude: запись». 2. Скопируй просьбу и отдай Claude вместе с файлом. 3. Claude прочитает формат и отправит всё одним запросом. Ниже готовые запросы под каждый маршрут: вместо <code>{{ TOKEN_HINT }}</code> подставь токен.
      </p>
      <article v-for="e in examples" :key="e.title" class="ib-card">
        <header>
          <b>{{ e.title }}</b>
          <button type="button" class="ib-btn ghost small" @click="copy(e.code, 'Запрос скопирован')">Копировать</button>
        </header>
        <p class="ib-muted">{{ e.note }}</p>
        <pre class="ib-code">{{ e.code }}</pre>
      </article>
      <article v-if="mats.format" class="ib-card">
        <header><b>Все маршруты</b></header>
        <ul class="ib-routes">
          <li v-for="r in mats.format.routes" :key="r.method + r.path"><code>{{ r.method }} {{ r.path }}</code> · {{ r.auth }} · {{ r.desc }}</li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.inbox { margin-top: 18px; display: flex; flex-direction: column; gap: 16px; }
.ib-head h2 { margin: 0 0 6px; font-size: 22px; font-weight: 700; }
.ib-sub, .ib-hint { margin: 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.ib-tok, .ib-card { padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.ib-tok-btns { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.ib-note { color: var(--muted); font-size: 13px; }
.ib-btn { padding: 8px 16px; font: inherit; font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(100deg, #e86bc0, #d64da9); border: 0; border-radius: 99px; cursor: pointer; }
.ib-btn.ghost { color: var(--ink); background: transparent; border: 1px solid var(--line); }
.ib-btn.ghost.danger { color: #c0392b; }
.ib-btn.small { padding: 4px 12px; font-size: 13px; }
.ib-btn:hover { filter: brightness(1.05); }
.ib-tokbox { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); }
.ib-tokbox small { margin-left: 6px; color: var(--muted); font-weight: 500; }
.ib-tokbox code { padding: 8px 10px; border-radius: 10px; background: rgba(150, 130, 230, .12); word-break: break-all; font-size: 13.5px; }
.ib-tokbox p { margin: 0; font-size: 13px; color: var(--muted); }
.ib-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.ib-tabs .chip { cursor: pointer; font: inherit; font-weight: 600; color: var(--ink); }
.ib-list { display: flex; flex-direction: column; gap: 10px; }
.ib-empty { margin: 8px 0; color: var(--muted); }
.ib-card header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.ib-card header .ko { font-size: 20px; font-weight: 700; }
.ib-card header time { margin-left: auto; font-size: 13px; }
.ib-card.done { opacity: .65; }
.ib-card p { margin: 6px 0 0; }
.ib-muted { color: var(--muted); font-size: 14px; }
.ib-ex { color: var(--muted); }
.ib-pre { white-space: pre-wrap; font-size: 14px; }
.ib-x { margin-left: 8px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 15px; }
.ib-title { display: inline-flex; align-items: baseline; gap: 6px; padding: 0; border: 0; background: transparent; font: inherit; font-size: 17px; font-weight: 700; color: var(--ink); cursor: pointer; text-align: left; }
.ib-arrow { display: inline-block; transition: transform .2s; }
.ib-arrow.open { transform: rotate(90deg); }
.ib-badge { padding: 2px 10px; border-radius: 99px; background: rgba(150, 130, 230, .14); color: var(--muted); font-size: 12px; font-weight: 600; }
.ib-badge.ok { background: rgba(60, 170, 110, .16); color: var(--ok); }
.ib-items { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.ib-item { padding: 8px 10px; border-radius: 12px; background: rgba(150, 130, 230, .07); font-size: 15px; line-height: 1.5; }
.ib-item .ko { font-family: var(--ko); }
.ib-type { margin-right: 8px; padding: 1px 8px; border-radius: 99px; background: #fff; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.ib-q { margin-top: 4px; font-size: 14px; }
.ib-q .right { color: var(--ok); font-weight: 700; }
.ib-card footer { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ib-code { margin: 8px 0 0; padding: 12px; overflow-x: auto; border-radius: 12px; background: #20265c; color: #eaedff; font-size: 13px; line-height: 1.5; white-space: pre; }
.ib-routes { margin: 8px 0 0; padding-left: 18px; font-size: 14px; line-height: 1.7; }
.ib-hint code { padding: 1px 6px; border-radius: 6px; background: rgba(150, 130, 230, .14); }
</style>

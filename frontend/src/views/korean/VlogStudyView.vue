<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clipText, pickDictHit, type ClipWord } from '@/data/korean/clip'
import { VLOGS } from '@/data/korean/vlogs'
import { gramCard, grammarHints } from '@/data/korean/vlog-grammar'
import { NEW_GRAMMAR, STUDY_VLOGS, VLOG_NEW_GRAMMAR, passes } from '@/data/korean/vlog-study'
import { searchDict } from '@/lib/dictApi'
import { useQueryParam } from '@/composables/useQueryParam'
import { useProgressStore } from '@/stores/progress'
import { useVlogWatched } from '@/composables/useVlogWatched'
import { fetchT } from '@/lib/http'
import { useToastStore } from '@/stores/toast'
import { ASK_QUICK, noteTitle, useVlogPhrases } from '@/composables/useVlogPhrases'
import AskAi from '@/components/korean/AskAi.vue'
import VlogTest from '@/components/korean/VlogTest.vue'
import { hasTest } from '@/data/korean/vlog-test'

/**
 * «Разбор влога»: только текст (видео здесь нет, оно в «Влоге»): фразы одного прохода с переводом, справка по новой грамматике,
 * слова с переводом (свои и из большого словаря), памятка «как работать». Вкладки «Тест» и «История» появятся следующими шагами.
 */
const progress = useProgressStore()
const cur = useQueryParam('v', '', STUDY_VLOGS)
/** Вкладки страницы: «Разбор» и «Тест» (в адресе `?tab=`); «История» появится следующим шагом. */
const tab = useQueryParam('tab', 'study', ['study', 'test', 'history'])
const { watched, canSave, loadWatched } = useVlogWatched()
const toast = useToastStore()

/** История попыток теста (на сервере, только владельцу): дата, общий балл, баллы по блокам, «сдано»; список неверных вопросов не хранится. */
interface Attempt { yt: string; at: number; score: number; total: number; passed: boolean; blocks: { id: string; score: number; total: number }[] }
const attempts = ref<Attempt[]>([])
const headers = () => ({ Authorization: `Bearer ${progress.bearer}`, 'Content-Type': 'application/json' })
async function loadAttempts() {
  if (!canSave.value) return
  try {
    const res = await fetchT('/api/vlog-tests', { headers: headers() })
    if (res.ok) attempts.value = ((await res.json()) as { attempts: Attempt[] }).attempts
  } catch {
    /* история не загрузилась: вкладка покажет пустой список */
  }
}
async function onFinish(r: { score: number; total: number; blocks: { id: string; score: number; total: number }[] }) {
  if (!vlog.value || !canSave.value) return
  try {
    const res = await fetchT('/api/vlog-tests', { method: 'POST', headers: headers(), body: JSON.stringify({ yt: vlog.value.yt, score: r.score, total: r.total, blocks: r.blocks }) })
    if (!res.ok) throw new Error(String(res.status))
    attempts.value = ((await res.json()) as { attempts: Attempt[] }).attempts
  } catch {
    toast.error('Результат не сохранился: сервер не ответил')
  }
}
const mine = computed(() => attempts.value.filter(a => a.yt === vlog.value?.yt).sort((a, b) => b.at - a.at))
const best = computed(() => mine.value.reduce<Attempt | null>((b, a) => (!b || a.score / a.total > b.score / b.total ? a : b), null))
const BLOCK_NAME: Record<string, string> = { quiz: 'Понимание', words: 'Слова', story: 'Рассказ', order: 'Порядок' }
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const pct = (a: { score: number; total: number }) => Math.round((a.score / a.total) * 100)
const vlog = computed(() => VLOGS.find(v => v.id === cur.value))
const pass = computed(() => (vlog.value ? passes(vlog.value.lines) : { first: [], count: 0 }))
const lines = computed(() => pass.value.first)
const parsed = computed(() => lines.value.map(l => clipText(l.ko, k => progress.data.words[k]?.streak ?? 0)))
const hints = computed(() => lines.value.map(l => grammarHints(l.ko)))
/** «записать» и «спросить» у фразы: номера фраз первого прохода совпадают с номерами в `vlog.lines`, потому что проход начинается с начала. */
const { canSaveNotes, savedTitles, saveLine, askAt, ownerAsk, askContext } = useVlogPhrases(vlog, hints)

/** Пройденная грамматика во фразах (чипы): нажатие открывает карточку; тема, которой нет среди пройденных, отсылает к блоку справки. */
const gramOpen = ref('')
const gram = computed(() => (gramOpen.value ? gramCard(gramOpen.value) : null))
const GRAM_STATE: Record<string, string> = { ok: 'пройдено', ahead: 'ещё впереди', other: 'в курсе, но не отмечено пройденным' }

/** Справка по новой грамматике влога: тема, объяснение и примеры из самого влога. Только здесь, нигде не записывается. */
const fresh = computed(() =>
  (vlog.value ? (VLOG_NEW_GRAMMAR[vlog.value.id] ?? []) : []).map(t => ({
    ...NEW_GRAMMAR[t.id]!,
    examples: t.lines.flatMap((i, k) => (lines.value[i] ? [{ l: lines.value[i]!, mark: t.marks[k] ?? '' }] : [])),
  })),
)

/** Объяснение с выделением: места между `**` жирным. */
const rich = (text: string) => text.split('**').map((t, i) => ({ t, b: i % 2 === 1 }))
/** Пример с подсвеченной формой: кусок `mark` выделяется внутри фразы. */
function hl(ko: string, mark: string) {
  const at = mark ? ko.indexOf(mark) : -1
  return at < 0 ? [{ t: ko, m: false }] : [{ t: ko.slice(0, at), m: false }, { t: mark, m: true }, { t: ko.slice(at + mark.length), m: false }]
}

/** Слова: разные слова текста в порядке появления; свои берутся из словаря, остальные ищутся в большом словаре. */
const words = computed(() => {
  const seen = new Map<string, ClipWord>()
  for (const r of parsed.value) for (const w of r.words) if (!seen.has(w.key)) seen.set(w.key, w)
  return [...seen.values()]
})
type Found = { ru: string; pos: string; level: string } | 'none' | 'busy'
const dict = ref<Record<string, Found>>({})
async function lookup(w: ClipWord) {
  if (w.own || dict.value[w.key]) return
  dict.value = { ...dict.value, [w.key]: 'busy' }
  try {
    let hit = null
    for (const q of w.queries) {
      hit = pickDictHit(q, await searchDict(q, '', '', 0))
      if (hit) break
    }
    dict.value = { ...dict.value, [w.key]: hit ? { ru: hit.ru, pos: hit.pos, level: hit.level } : 'none' }
  } catch {
    const { [w.key]: _gone, ...rest } = dict.value
    dict.value = rest
  }
}
/** Большой словарь спрашиваем по несколько слов сразу: слов вне своего словаря бывает почти половина. */
async function lookupAll() {
  const todo = words.value.filter(w => !w.own)
  for (let i = 0; i < todo.length; i += 4) await Promise.all(todo.slice(i, i + 4).map(lookup))
}
onMounted(() => {
  void lookupAll()
  void loadWatched()
  void loadAttempts()
  void revealCards()
})
/** Тест открывается после отметки «просмотрено» (иначе по заданиям можно подсмотреть ответы). */
const seen = computed(() => !!vlog.value && watched.value.includes(vlog.value.yt))
const testWords = computed(() => words.value.flatMap(w => (w.own ? [{ k: w.own.k, t: w.own.t }] : [])))

/**
 * Карточки справки раскрываются при прокрутке: `clipPath` от верхней линии к полной карточке (GSAP + ScrollTrigger, грузятся лениво и только в браузере).
 * Если плагин не загрузился или включено «меньше движения», карточки просто видны. После анимации `clipPath` снимается, чтобы не резать тень.
 */
const freshBox = ref<HTMLElement>()
let ctx: { revert: () => void } | null = null
const HIDDEN = 'polygon(0 0, 100% 0, 100% 0, 0 0)'
const SHOWN = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)'
async function revealCards() {
  ctx?.revert()
  ctx = null
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  await nextTick()
  const box = freshBox.value
  if (!box?.querySelector('.vs-g')) return
  try {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
    if (freshBox.value !== box) return
    gsap.registerPlugin(ScrollTrigger)
    ctx = gsap.context(() => {
      box.querySelectorAll<HTMLElement>('.vs-g').forEach(card => {
        gsap.set(card, { clipPath: HIDDEN })
        gsap.to(card, { clipPath: SHOWN, duration: 1.2, ease: 'power3.inOut', clearProps: 'clipPath', scrollTrigger: { trigger: card, start: 'top 92%', once: true } })
      })
    }, box)
  } catch {
    /* без анимации карточки остаются видимыми */
  }
}
watch(tab, () => void revealCards())
onBeforeUnmount(() => ctx?.revert())

const picked = ref<ClipWord | null>(null)
function pick(w: ClipWord) {
  gramOpen.value = ''
  picked.value = picked.value?.key === w.key ? null : w
  if (picked.value) void lookup(w)
}
const wordRu = (w: ClipWord) => {
  if (w.own) return w.own.t
  const f = dict.value[w.key]
  return f === 'busy' || !f ? 'ищу в словаре…' : f === 'none' ? 'нет в большом словаре (имя или редкая форма)' : f.ru
}
const wordMeta = (w: ClipWord) => {
  const f = dict.value[w.key]
  return w.own ? 'в твоём словаре' : f && f !== 'busy' && f !== 'none' ? [f.pos, f.level].filter(Boolean).join(' · ') : ''
}
const ownCount = computed(() => words.value.filter(w => w.own).length)
</script>

<template>
  <div class="wrap">
    <p v-if="!vlog" class="vs-note">Разбор этого влога пока не готов. <NuxtLink to="/korean/vlog">← Все влоги</NuxtLink></p>
    <template v-else>
      <header class="vs-top">
        <NuxtLink class="vs-back" :to="`/korean/vlog?v=${vlog.id}`">← К видео</NuxtLink>
        <h2 class="vs-title">{{ vlog.title }}</h2>
        <p class="vs-by">Автор: {{ vlog.channel }}. {{ lines.length }} фраз<template v-if="pass.count > 1">, рассказ в видео звучит {{ pass.count }} раза, здесь он один раз</template>.</p>
        <div class="vs-tabs" role="tablist" aria-label="Разделы страницы">
          <button type="button" role="tab" class="vs-tab" :class="{ on: tab === 'study' }" :aria-selected="tab === 'study'" @click="tab = 'study'">Разбор</button>
          <button type="button" role="tab" class="vs-tab" :class="{ on: tab === 'test' }" :aria-selected="tab === 'test'" @click="tab = 'test'">Тест</button>
          <button type="button" role="tab" class="vs-tab" :class="{ on: tab === 'history' }" :aria-selected="tab === 'history'" @click="tab = 'history'">История</button>
        </div>
      </header>

      <template v-if="tab === 'study'">
      <details class="vs-how">
        <summary>Как работать с этим влогом</summary>
        <ol>
          <li>Прочитай фразы ниже с переводом, по одной. Незнакомое слово нажми.</li>
          <li>Посмотри видео и повторяй вслух за автором в последнем проходе: там паузы под повтор.</li>
          <li>Выбери 5–8 полезных фраз и запиши их в заметки.</li>
          <li>Ищи каркасы фраз и подставляй свои слова вслух. Берись только за то, что уже проходил(а): остальное здесь справка.</li>
          <li>Через день или два посмотри ещё раз без текста. Если стало понятнее, это и есть прогресс.</li>
          <li>Не заучивай все слова: хватит 8–10 самых частых. На субботнем созвоне расскажи влог Лере своими словами.</li>
        </ol>
      </details>

      <section v-if="fresh.length" class="vs-fresh" aria-label="Новое в этом влоге">
        <h3>Новое в этом влоге</h3>
        <p class="vs-fresh-note">Справка: это темы, которых ты ещё не проходил(а). Они нигде не записываются и не засчитываются, это только чтобы понимать текст.</p>
        <div ref="freshBox" class="vs-fresh-grid">
        <article v-for="(g, gi) in fresh" :key="g.ko" class="vs-g" :class="`c${gi % 4}`">
          <div class="vs-g-head"><b lang="ko">{{ g.ko }}</b><span>{{ g.ru }}</span></div>
          <div class="vs-g-formula" lang="ko" aria-label="Формула">
            <template v-for="(part, k) in g.formula.split(' + ')" :key="k"><span v-if="k" class="vs-plus">+</span><span class="vs-chip" :class="{ end: k > 0 }">{{ part }}</span></template>
          </div>
          <p class="vs-g-rule"><template v-for="(r, k) in rich(g.rule)" :key="k"><b v-if="r.b">{{ r.t }}</b><template v-else>{{ r.t }}</template></template></p>
          <ul v-if="g.examples.length" class="vs-g-ex">
            <li v-for="(e, i) in g.examples" :key="i"><span lang="ko"><template v-for="(p, k) in hl(e.l.ko, e.mark)" :key="k"><mark v-if="p.m" class="vs-hl">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></span><br />{{ e.l.ru }}</li>
          </ul>
          <p class="vs-g-src">{{ g.book ? `Книга Леры: ${g.book}${g.read ? '' : ' (по оглавлению, страницу ещё не сверяли)'}.` : 'В оглавлении книг 1A и 1B этой темы нет.' }}</p>
        </article>
        </div>
      </section>

      <div class="vs-cols">
      <section aria-label="Текст">
        <h3 class="vs-h">Текст с переводом</h3>
        <div class="vs-lines" lang="ko">
          <div v-for="(l, i) in lines" :key="i" class="vs-line">
            <span class="vs-n">{{ i + 1 }}</span>
            <div class="vs-body">
              <div class="vs-ko">
                <template v-for="(p, j) in parsed[i]!.parts" :key="j">
                  <button v-if="p.word" type="button" class="cw" :class="[p.word.state, { on: picked?.key === p.word.key }]" :aria-pressed="picked?.key === p.word.key" @click="pick(p.word)">{{ p.text }}</button>
                  <template v-else>{{ p.text }}</template>
                </template>
              </div>
              <p class="vs-ru" lang="ru">{{ l.ru }}</p>
              <div class="vs-acts">
                <div v-if="hints[i]?.length" class="vs-gr" aria-label="Грамматика во фразе">
                  <button v-for="g in hints[i]" :key="g.id" type="button" class="vs-gr-chip" :class="{ on: gramOpen === g.id }" :aria-pressed="gramOpen === g.id" @click="picked = null; gramOpen = gramOpen === g.id ? '' : g.id">{{ g.ko }}</button>
                </div>
                <button v-if="ownerAsk" type="button" class="vs-btn" :class="{ on: askAt === i }" :aria-expanded="askAt === i" @click="askAt = askAt === i ? -1 : i">спросить</button>
                <button v-if="canSaveNotes" type="button" class="vs-btn" :disabled="savedTitles.has(noteTitle(l.ko))" @click="saveLine(i)">{{ savedTitles.has(noteTitle(l.ko)) ? 'записано' : 'записать' }}</button>
              </div>
              <div v-if="askAt === i" class="vs-ask"><AskAi :key="`${vlog.id}-${i}`" open :context="() => askContext(i)" mode="vlog" :quick="ASK_QUICK" placeholder="Спроси про эту фразу…" /></div>
            </div>
          </div>
        </div>
      </section>
        <aside class="vs-side" aria-label="Слова и подсказки">
      <div v-if="gram" class="vs-card" role="status">
        <div class="vs-g-head"><b lang="ko">{{ gram.ko }}</b><span>{{ GRAM_STATE[gram.state] }}</span></div>
        <p class="vs-g-rule">{{ gram.ru }}<template v-if="gram.d">: {{ gram.d }}</template></p>
        <p v-if="gram.state !== 'ok'" class="vs-g-rule vs-dim">Эта тема не отмечена пройденной, подробнее смотри в блоке «Новое в этом влоге» вверху, если она там есть.</p>
        <p v-if="gram.formula" class="vs-g-formula" lang="ko">{{ gram.formula }}</p>
        <p v-if="gram.example" class="vs-g-rule"><span lang="ko">{{ gram.example.ko }}</span><br />{{ gram.example.ru }}</p>
      </div>
      <div v-if="picked" class="vs-card" role="status">
        <div class="vs-g-head"><b lang="ko">{{ picked.own?.k ?? picked.core }}</b><span>{{ wordMeta(picked) }}</span></div>
        <p class="vs-g-rule">{{ wordRu(picked) }}</p>
      </div>

      <section aria-label="Слова">
        <h3 class="vs-h">Слова влога</h3>
        <p class="vs-note">Всего {{ words.length }} разных слов, из них {{ ownCount }} в твоём словаре. Для остальных перевод из большого словаря.</p>
        <ul class="vs-words">
          <li v-for="w in words" :key="w.key">
            <span class="cw" :class="w.state" lang="ko">{{ w.own?.k ?? w.core }}</span>
            <span class="vs-wr">{{ wordRu(w) }}</span>
            <small v-if="wordMeta(w)">{{ wordMeta(w) }}</small>
          </li>
        </ul>
      </section>
        </aside>
      </div>
      </template>

      <template v-else-if="tab === 'history'">
        <p v-if="!canSave" class="vs-note">История попыток сохраняется только у владельца, гостю она не доступна.</p>
        <p v-else-if="!mine.length" class="vs-note">Попыток пока нет. Пройди тест на вкладке «Тест»: результат появится здесь.</p>
        <template v-else>
          <p class="vs-note">Лучший результат: <b>{{ best!.score }} из {{ best!.total }} ({{ pct(best!) }}%)</b>, {{ best!.passed ? 'сдано' : 'не сдано' }}. Всего попыток: {{ mine.length }}.</p>
          <ul class="vs-hist">
            <li v-for="a in mine" :key="a.at" :class="a.passed ? 'ok' : 'bad'">
              <b>{{ when(a.at) }}</b>
              <span>{{ a.score }} из {{ a.total }} ({{ pct(a) }}%), {{ a.passed ? 'сдано' : 'не сдано' }}</span>
              <small>{{ a.blocks.map(b => `${BLOCK_NAME[b.id] ?? b.id} ${b.score}/${b.total}`).join(' · ') }}</small>
            </li>
          </ul>
        </template>
      </template>

      <template v-else>
        <p v-if="!seen" class="vs-note">Тест откроется после отметки «просмотрено» у этого влога: отметь её в <NuxtLink to="/korean/vlog">списке влогов</NuxtLink>, когда посмотришь видео.</p>
        <p v-else-if="!hasTest(vlog.id)" class="vs-note">Задания для этого влога готовятся.</p>
        <VlogTest v-else :vlog-id="vlog.id" :lines="lines" :words="testWords" @finish="onFinish" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.vs-note, .vs-by { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.vs-top { margin-bottom: 6px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.vs-back { color: var(--accent); font-size: 14px; text-decoration: none; }
.vs-title { margin: 8px 0 0; font-size: 22px; }
.vs-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.vs-tab { border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); padding: 7px 14px; font: inherit; font-size: 14px; }
.vs-tab.on { border-color: var(--ink); color: var(--ink); font-weight: 700; }
.vs-tab:disabled { opacity: .55; }
.vs-h { margin: 22px 0 0; font-size: 18px; }
.vs-cols { display: block; }
.vs-side { display: contents; }
/* Широкий экран: текст слева, справа закреплённая колонка (карточка слова или грамматики и список слов), чтобы справа не было пусто */
@media (min-width: 1100px) {
  .vs-cols { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr); gap: 22px; align-items: start; }
  .vs-side { display: block; position: sticky; top: 12px; max-height: calc(100vh - 28px); overflow-y: auto; padding: 8px 8px 8px 0; }
  :global(.study-shell.focus) .vs-side { top: 66px; max-height: calc(100vh - 82px); }
  .vs-cols .vs-h { margin-top: 0; }
  .vs-side .vs-card { position: static; margin: 0 0 16px; }
  .vs-side .vs-words { grid-template-columns: 1fr; }
}
.vs-hist { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
.vs-hist li { display: grid; gap: 2px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.vs-hist li.ok { border-color: var(--ok); }
.vs-hist li.bad { border-color: #d6455d; }
.vs-hist small { color: var(--muted); font-size: 13px; }
.vs-how { margin-top: 14px; padding: 10px 14px; border: 1px solid var(--line-soft); border-radius: 14px; background: var(--surface); }
.vs-how summary { cursor: pointer; font-weight: 600; }
.vs-how ol { margin: 10px 0 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14.5px; line-height: 1.5; }
.vs-fresh { margin-top: 18px; padding: 14px 16px; border: 1px dashed var(--accent); border-radius: 18px; background: rgba(150, 190, 255, .1); }
.vs-fresh h3 { margin: 0; font-size: 18px; }
.vs-fresh-note { margin: 6px 0 0; color: var(--muted); font-size: 13.5px; line-height: 1.5; }
.vs-g.c0 { --c: #f06fa8; } .vs-g.c1 { --c: #6a9cf0; } .vs-g.c2 { --c: #e0a82e; } .vs-g.c3 { --c: #3fae7a; }
.vs-g { border-top: 4px solid var(--c, var(--line)); background-image: linear-gradient(color-mix(in srgb, var(--c, transparent) 8%, transparent), transparent 60%); }
.vs-g-head b { color: var(--c); }
.vs-chip { padding: 3px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.vs-chip.end { border-color: var(--c); background: color-mix(in srgb, var(--c) 22%, transparent); font-weight: 700; }
.vs-plus { color: var(--muted); font-weight: 700; }
.vs-g-rule b { background: color-mix(in srgb, var(--c, #8f7cf0) 20%, transparent); border-radius: 6px; padding: 0 3px; font-weight: 700; }
.vs-hl { background: color-mix(in srgb, var(--c) 32%, transparent); color: inherit; border-radius: 6px; padding: 0 3px; font-weight: 700; }
.vs-fresh-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; align-items: stretch; }
@media (max-width: 720px) { .vs-fresh-grid { grid-template-columns: 1fr; } }
.vs-g { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.vs-g-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.vs-g-head b { font-size: 19px; }
.vs-g-head span { color: var(--muted); font-size: 14px; }
.vs-g-rule { margin: 8px 0 0; font-size: 15px; line-height: 1.55; }
.vs-g-formula { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 15px; }
.vs-card .vs-g-formula { padding: 8px 12px; border-radius: 12px; background: var(--gold-soft); }
.vs-g-ex { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; font-size: 15px; line-height: 1.6; }
.vs-g-ex li { padding: 4px 0 4px 10px; border-left: 3px solid var(--c, var(--line)); }
.vs-g-src { margin: 8px 0 0; color: var(--muted); font-size: 12.5px; }
.vs-dim { color: var(--muted); font-size: 14px; }
.vs-lines { margin-top: 10px; display: grid; gap: 6px; }
.vs-line { display: grid; grid-template-columns: 30px 1fr; gap: 8px; padding: 10px 12px; border: 1px solid var(--line-soft); border-radius: 16px; background: var(--surface); }
.vs-n { color: var(--muted); font-size: 13px; padding-top: 4px; font-variant-numeric: tabular-nums; }
.vs-body { min-width: 0; }
.vs-ko { font-size: 18px; line-height: 2; overflow-wrap: anywhere; }
.vs-ru { margin: 4px 0 0; padding: 8px 12px; border-radius: 12px; background: var(--gold-soft); font-size: 15px; line-height: 1.5; }
.vs-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 6px; }
.vs-gr { display: flex; flex-wrap: wrap; gap: 6px; }
.vs-btn { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 3px 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
.vs-btn.on { border-color: var(--ink); color: var(--ink); }
.vs-btn:disabled { opacity: .6; cursor: default; }
.vs-ask { margin-top: 8px; min-width: 0; }
.vs-gr-chip { border: 1px dashed var(--accent); border-radius: 999px; background: transparent; color: var(--ink); padding: 3px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.vs-gr-chip.on { background: rgba(150, 190, 255, .22); border-style: solid; }
.vs-card { position: sticky; bottom: 10px; margin-top: 14px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); box-shadow: 0 6px 24px rgba(0, 0, 0, .08); }
.vs-words { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px 14px; }
.vs-words li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; padding: 6px 10px; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); font-size: 14.5px; }
.vs-wr { color: var(--ink); }
.vs-words small { color: var(--muted); font-size: 12px; }
.cw { display: inline; border: 0; border-bottom: 2px solid transparent; border-radius: 8px; background: transparent; color: var(--ink); padding: 1px 3px; font: inherit; cursor: pointer; }
.cw.learned { background: var(--ok-bg); border-bottom-color: var(--ok); }
.cw.learning, .cw.new { background: var(--gold-soft); border-bottom-color: var(--gold); }
.cw.unknown { border-bottom: 2px dashed var(--accent); }
.cw.on { outline: 2px solid var(--accent); outline-offset: 1px; }
span.cw { cursor: default; }
@media (max-width: 520px) { .vs-line { grid-template-columns: 1fr; gap: 0; } .vs-ko { font-size: 17px; } }
</style>

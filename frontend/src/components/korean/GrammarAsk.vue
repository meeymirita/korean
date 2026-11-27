<script setup lang="ts">
/**
 * Вид «Что хочешь сказать?» страницы грамматики: диалог. Выбираешь задачу (раздел), потом правило, и помощник отвечает правилом, формулой и примерами «в разговоре».
 * Ничего не отправляется на сервер: ответы собираются из карточек. Описание: docs/data.md, «Страница грамматики: виды».
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SECS, firstBlock, type Gram } from '@/data/korean/grammar'
import { F, blocksHtml, esc } from '@/data/korean/render'
import { INTENT, formulaOf, headKo, plain, ruleOf, secColor } from '@/lib/grammarView'
import { CHAINS, LINKS, linksOf, marked, type Chain } from '@/data/korean/chains'

const props = defineProps<{ cards: Gram[] }>()
const emit = defineEmits<{ open: [id: string] }>()

interface Opt { label: string; sub?: string; color: string; ahead?: boolean; run: () => void }
interface Msg { id: number; who: 'bot' | 'me'; html?: string; pairs?: Array<[string, string]>; form?: string; opts?: Opt[] }

const msgs = ref<Msg[]>([])
const notes = ref<Gram[]>([])
const logEl = ref<HTMLElement>()
let n = 0
let epoch = 0 // «начать заново» и смена набора карточек отменяют ещё не показанные ответы
const timers = new Set<ReturnType<typeof setTimeout>>()
onBeforeUnmount(() => timers.forEach(clearTimeout))

const wait = (ms: number) => new Promise<void>(r => timers.add(setTimeout(r, ms)))
async function say(m: Omit<Msg, 'id'>, delay = 0) {
  const my = epoch
  if (delay) await wait(delay)
  if (my !== epoch) return false
  msgs.value.push({ ...m, id: ++n })
  await nextTick()
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight, behavior: 'smooth' })
  return true
}

const sections = () => SECS.filter(s => props.cards.some(g => g.s === s))
async function start() {
  epoch++
  msgs.value = []
  notes.value = []
  if (!(await say({ who: 'bot', html: 'Привет! Я подберу правило. <b>Что ты хочешь сказать по-корейски?</b>' }))) return
  const secs = sections()
  const opts: Opt[] = secs.map(s => ({ label: INTENT[s] ?? s, color: secColor({ s }), run: () => void pickIntent(s) }))
  // цепочки предложений не привязаны к карточкам: они всегда под рукой
  opts.push({ label: 'Соединить предложения в длинный рассказ', color: '#c9a24a', run: () => void pickChains() })
  await say({ who: 'bot', opts }, 250)
}
/** Длинные предложения: две-три связки 그리고 / 그런데 / 그래서 в одной цепочке. */
async function pickChains() {
  await say({ who: 'me', html: 'Соединить предложения в длинный рассказ' })
  const rows = Object.entries(LINKS).map(([k, v]) => `<div><span>${F(`{k|${k}}`)}</span> — ${esc(v)}</div>`).join('')
  if (!(await say({ who: 'bot', html: `Короткие предложения склеиваются связками. Их три:<div class="links">${rows}</div>Одной связки мало: в рассказе их по две-три. Выбери цепочку.` }, 350))) return
  await say({ who: 'bot', opts: CHAINS.map(c => ({ label: c.title, sub: [...new Set(linksOf(c))].join(' · '), color: '#c9a24a', run: () => void pickChain(c) })) }, 250)
}
async function pickChain(c: Chain) {
  await say({ who: 'me', html: esc(c.title) })
  const links = linksOf(c)
  const total = links.length
  if (!(await say({ who: 'bot', html: `Здесь ${total} связки: ${links.map(l => F(`{k|${l}}`)).join(' → ')}. Читай по порядку:`, pairs: c.steps.map(([ko, ru]) => [marked(ko), ru]) }, 350))) return
  await say(
    {
      who: 'bot',
      opts: [
        { label: 'Другая цепочка', color: '#c9a24a', run: () => void pickChains() },
        { label: 'Что хочешь сказать?', color: '#8f7cf0', run: () => void start() },
      ],
    },
    350,
  )
}
async function pickIntent(s: string) {
  await say({ who: 'me', html: esc(INTENT[s] ?? s) })
  const cs = props.cards.filter(g => g.s === s)
  const ahead = cs.filter(g => g.ahead).length
  const ready = cs.length - ahead
  if (!(await say({ who: 'bot', html: `Для этого есть ${ready} правил${ahead ? ` (ещё ${ahead} впереди)` : ''}. Какое нужно?` }, 350))) return
  await say({ who: 'bot', opts: cs.map(g => ({ label: headKo(g), sub: plain(g.ru).slice(0, 26), color: secColor(g), ahead: g.ahead, run: () => void pickRule(g) })) }, 250)
}
async function pickRule(g: Gram) {
  await say({ who: 'me', html: F(g.ko) })
  if (g.ahead) {
    await say({ who: 'bot', html: `Эту тему ещё не проходили, поэтому покажу только её место в книге: <b>${esc(g.bk ?? '—')}</b>. Выбери другую?` }, 350)
    return
  }
  if (!notes.value.some(x => x.id === g.id)) notes.value.push(g)
  if (!(await say({ who: 'bot', html: F(ruleOf(g)) }, 400))) return
  const f = formulaOf(g)
  if (f) await say({ who: 'bot', form: F(f) }, 350)
  const ex = (firstBlock(g.b, 'ex') ?? []).slice(0, 4)
  if (ex.length) await say({ who: 'bot', html: 'Вот как это звучит в разговоре:', pairs: ex }, 350)
  await say(
    {
      who: 'bot',
      opts: [
        { label: 'Объясни глубже ↓', color: '#8f7cf0', run: () => void deeper(g) },
        { label: 'Другое правило', color: '#e879b9', run: () => void pickIntent(g.s) },
        { label: 'Открыть карточку целиком', color: '#5db7e8', run: () => emit('open', g.id) },
      ],
    },
    350,
  )
}
async function deeper(g: Gram) {
  await say({ who: 'me', html: 'Объясни глубже' })
  await say({ who: 'bot', html: `<div class="rich">${blocksHtml(g.b)}</div>` }, 350)
}
function choose(m: Msg, o: Opt) {
  // выбранный вариант остаётся в истории, а кнопки гаснут: нажать второй раз нельзя
  m.opts = m.opts?.filter(x => x === o).map(x => ({ ...x, run: () => {} }))
  o.run()
}

// только в браузере: на сервере диалог не начинается
onMounted(() => void start())
// набор карточек поменялся (вкладка, поиск, «пройдено»): диалог начинается заново
watch(
  () => props.cards.map(g => g.id).join(),
  () => void start(),
)
</script>

<template>
  <div class="gask">
    <div class="chat">
      <div class="hd"><div class="av">✳︎</div>Что хочешь сказать?</div>
      <div ref="logEl" class="log" aria-live="polite">
        <div v-for="m in msgs" :key="m.id" class="m" :class="m.who">
          <div v-if="m.html" v-html="m.html"></div>
          <div v-if="m.form" class="form" v-html="m.form"></div>
          <div v-if="m.pairs" class="pair">
            <div v-for="(p, i) in m.pairs" :key="i" :class="i % 2 ? 'b' : 'a'"><span v-html="F(p[0])"></span><small v-html="F(p[1])"></small></div>
          </div>
          <div v-if="m.opts" class="opts">
            <button v-for="(o, i) in m.opts" :key="i" type="button" class="o" :class="{ ahead: o.ahead }" :style="{ '--c': o.color }" @click="choose(m, o)">{{ o.label }}<small v-if="o.sub">{{ o.sub }}</small></button>
          </div>
        </div>
      </div>
    </div>
    <aside class="side">
      <h3>Конспект диалога</h3>
      <button v-for="g in notes" :key="g.id" type="button" class="n" :style="{ '--c': secColor(g) }" @click="pickRule(g)"><i></i><b>{{ headKo(g) }}</b></button>
      <p v-if="!notes.length" class="none">Здесь появятся правила, которые ты разобрал.</p>
      <button type="button" class="reset" @click="start">Начать заново</button>
    </aside>
  </div>
</template>

<style scoped>
.gask { margin-top: 18px; display: grid; grid-template-columns: minmax(0, 1fr) 280px; height: min(680px, 78vh); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: rgba(255, 255, 255, .7); box-shadow: var(--shadow); }
.chat { display: flex; flex-direction: column; min-height: 0; }
.hd { padding: 14px 22px; background: #fff; border-bottom: 1px solid var(--line); font-weight: 700; display: flex; gap: 10px; align-items: center; }
.av { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #ff7eb6, #8f7cf0); display: grid; place-items: center; color: #fff; }
.log { flex: 1; overflow-y: auto; padding: 20px clamp(14px, 4vw, 48px); display: flex; flex-direction: column; gap: 12px; }
.m { max-width: 640px; padding: 12px 16px; border-radius: 20px; line-height: 1.45; animation: gask-pop .3s cubic-bezier(.2, 1.2, .3, 1); }
@keyframes gask-pop { from { opacity: 0; transform: translateY(10px) scale(.96); } }
.bot { background: #fff; border-bottom-left-radius: 5px; align-self: flex-start; box-shadow: 0 2px 8px rgba(80, 90, 160, .1); }
.me { background: linear-gradient(135deg, #8f7cf0, #e0559f); color: #fff; align-self: flex-end; border-bottom-right-radius: 5px; font-weight: 700; }
.opts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
.o { border: 2px solid var(--c); background: #fff; color: var(--c); border-radius: 99px; padding: 8px 15px; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; transition: .15s; }
.o:hover { background: var(--c); color: #fff; transform: translateY(-2px); }
.o small { opacity: .7; font-weight: 500; margin-left: 6px; }
.o.ahead { border-style: dashed; opacity: .55; }
.form { font-family: 'Noto Sans KR', sans-serif; font-weight: 700; font-size: 20px; background: #20265c; color: #fff; border-radius: 14px; padding: 10px 16px; margin: 6px 0; }
.pair { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.links { margin: 8px 0; display: grid; gap: 4px; font-weight: 700; }
.pair .a, .pair .b { padding: 8px 13px; border-radius: 16px; max-width: 92%; font-weight: 700; font-size: 17px; }
.pair .a { background: #f2efff; align-self: flex-start; }
.pair .b { background: #fff0f7; align-self: flex-end; }
.pair small { display: block; font: 500 12px Archivo, sans-serif; opacity: .65; }
.side { background: #fff; border-left: 1px solid var(--line); padding: 18px; overflow-y: auto; }
.side h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.n { display: flex; gap: 8px; align-items: center; width: 100%; padding: 8px 10px; border: 0; border-radius: 12px; margin-bottom: 6px; background: #f5f3ff; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.n i { width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
.none { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
.reset { margin-top: 12px; border: 0; background: #20265c; color: #fff; border-radius: 99px; padding: 8px 16px; cursor: pointer; font: inherit; font-weight: 700; }
@media (max-width: 760px) { .gask { grid-template-columns: 1fr; height: min(640px, 80vh); } .side { display: none; } }
</style>

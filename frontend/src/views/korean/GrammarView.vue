<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import PhotoViewer from '@/components/korean/PhotoViewer.vue'
import { useGrammarPhotos } from '@/composables/useGrammarPhotos'
import yunaGrammar from '@/assets/home/yuna-grammar.webp'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G, SECS, tabOf } from '@/data/korean/grammar'
import { F } from '@/data/korean/render'
import { COURSE } from '@/data/korean/course'
import { useProgressStore } from '@/stores/progress'
import { usePersisted } from '@/composables/usePersisted'

const sec = usePersisted('grammar_sec', '', v => typeof v === 'string')
const progress = useProgressStore()
const passed = (id: string) => progress.isMarked('d', id)
/** «пройдено» по данным, если владелец не снял отметку (метка u) */
const isOk = (g: { id: string; st: string }) => g.st === 'ok' && !progress.isMarked('u', g.id)
/** Вкладка 0: свои карточки (без номера урока: с Лерой и сам); 1 и 2: карточки уроков видеокурса */
const PARTS = [
  { id: 0, label: 'Мои карточки', sub: 'С Лерой и свои' },
  { id: 1, label: 'Часть 1', sub: 'Видеокурс · уроки 1–30' },
  { id: 2, label: 'Часть 2', sub: 'Видеокурс · 13 уроков' },
] as const
/** «Мои карточки» (вкладка 0) видны только по токену; части 1 и 2 открыты всем */
const parts = computed(() => PARTS.filter(p => p.id !== 0 || progress.unlocked))
const photo = ref<string | null>(null)
/** Иконки вкладок-тем (имена из src/lib/icons.ts) */
const SEC_ICON: Record<string, string> = {
  'Быть и отрицание': 'check', 'Частицы': 'puzzle', 'Место и направление': 'target', 'Глаголы и просьбы': 'pencil', 'Указатели и вопросы': 'question',
  'Вежливость': 'heart', 'Произношение': 'speech', 'Числительные': 'chart', 'Время': 'clock', 'Желание и предложение': 'star', 'Связки': 'arrows',
}
const part = usePersisted<0 | 1 | 2>('grammar_tab', 0, v => v === 0 || v === 1 || v === 2)
/** Открытая вкладка: без токена «Мои карточки» недоступны, показываем часть 1 */
const cur = computed<0 | 1 | 2>(() => (part.value === 0 && !progress.unlocked ? 1 : part.value))
/** Пройденные карточки части 1 показываются и во «Мои карточки» (там без видео, только фото) */
/** Урочные карточки, у которых есть своя карточка владельца на ту же тему: во «Мои карточки» они не дублируются (past и past_i → past_my: их содержание собрано в ней, решение владельца 2026-11-10) */
const OWN_TWIN = new Set(['past', 'past_i'])
const inTab = (g: (typeof G)[number], n: number) => tabOf(g) === n || (n === 0 && tabOf(g) === 1 && g.st === 'ok' && !OWN_TWIN.has(g.id))
const partCount = (n: number) => G.filter(g => inTab(g, n)).length
const q = ref('')
const onlyDone = usePersisted('grammar_done', false, v => typeof v === 'boolean')
const list = computed(() => {
  const w = q.value.trim().toLowerCase()
  return G.filter(g =>
    (progress.unlocked || tabOf(g) !== 0) &&
    (!sec.value || g.s === sec.value) &&
    (!onlyDone.value || isOk(g) || passed(g.id)) &&
    (!w || [g.ko, g.ru, g.d, g.s, g.l ?? ''].some(x => x.toLowerCase().includes(w))))
})
/** Карточки выбранной вкладки. В разметку попадают все вкладки (скрытые через v-show): поисковики видят все карточки, а не одну вкладку. */
const shown = computed(() => list.value.filter(g => inTab(g, cur.value)))
const { open } = useGrammarModal()
/** у каких карточек есть фото: список с Яндекс.Диска (до ответа сервера список из кода) */
const { photoOf, load: loadPhotos } = useGrammarPhotos()
onMounted(() => void loadPhotos())
const route = useRoute()
/** /korean/grammar?g=ayo сразу открывает карточку */
onMounted(() => {
  const g = String(route.query.g ?? '')
  const card = G.find(x => x.id === g)
  if (card && (progress.unlocked || tabOf(card) !== 0)) {
    part.value = tabOf(card)
    open(g, false)
  }
})
</script>

<template>
  <div class="wrap grammar-page">
    <SectionHead id="grammar" :big="G.length" />
    <img class="gr-banner" :src="yunaGrammar" alt="" aria-hidden="true" draggable="false" />
    <div class="chips">
      <button class="chip" :class="{ on: !sec }" @click="sec = ''"><Icon name="grammar" /> Все</button>
      <button v-for="s in SECS" :key="s" class="chip" :class="{ on: sec === s }" @click="sec = s"><Icon :name="SEC_ICON[s] ?? 'star'" /> {{ s }}</button>
    </div>
    <p class="gcourse">
      Видеоуроки части 1 (уроки 1–30) и части 2 принадлежат каналу
      <a :href="COURSE.channel" target="_blank" rel="noopener">{{ COURSE.teacher }} · {{ COURSE.name }}</a>:
      корейский с носителем языка, к каждому уроку есть материалы, их можно скачать бесплатно.
      <a :href="COURSE.telegram" target="_blank" rel="noopener">Telegram</a> ·
      <a :href="COURSE.instagram" target="_blank" rel="noopener">Instagram</a>
    </p>
    <div class="gsearch">
      <div class="sb">
        <input data-page-search v-model="q" type="text" autocomplete="off" placeholder="Найти правило: 은/는, прошедшее, урок 12…" />
        <button v-if="q" title="Очистить" aria-label="Очистить" @click="q = ''">✕</button>
      </div>
      <label class="gdone"><input v-model="onlyDone" type="checkbox" /> показывать только пройденное</label>
    </div>
    <p v-if="cur === 0" class="gcourse">
      Здесь правила, которые разбирали с Лерой по учебнику 서울대 한국어+, и свои карточки. Сюда же попадают пройденные карточки видеокурса (часть 1): здесь у них только фото, без видео; само видео осталось в «Части 1».
    </p>
    <div class="gparts" role="tablist">
      <button v-for="p in parts" :key="p.id" role="tab" :aria-selected="cur === p.id" class="gpart" :class="{ on: cur === p.id }" @click="part = p.id">
        <b>{{ p.label }}</b><small>{{ p.sub }} · {{ partCount(p.id) }} карточек</small>
      </button>
    </div>
    <p v-if="!shown.length" class="gempty">Ничего не найдено.</p>
    <div class="gg">
      <button v-for="g in list" v-show="inTab(g, cur)" :key="g.id" class="gc" @click="open(g.id, cur === 0)">
        <h3 v-html="F(g.ko)"></h3>
        <div class="rn">{{ g.ru }}</div>
        <div class="d">{{ g.d }}</div>
        <div class="ft">
          <span class="pill">{{ g.s }}</span>
          <!-- во «Мои карточки» подпись урока не пишется: вкладка владельца не про видеокурс -->
          <span v-if="g.l && cur !== 0" class="pill l">{{ g.l }}</span>
          <span class="pill" :class="isOk(g) ? 's' : 'n'">{{ isOk(g) ? 'пройдено' : 'ещё рано' }}</span>
          <span v-if="passed(g.id)" class="pill s">✓ {{ (cur !== 0 && g.l) || 'отмечено' }}</span>
          <span v-if="photoOf(g)" class="pill ph" role="button" tabindex="0" title="Показать фото Юны к этому правилу" @click.stop="photo = photoOf(g)!" @keydown.enter.stop.prevent="photo = photoOf(g)!">Фото</span>
        </div>
      </button>
    </div>
    <PhotoViewer :src="photo" @close="photo = null" />
  </div>
</template>

<style scoped>
.gsearch { display: flex; align-items: center; gap: 16px; margin: 16px 0 0; flex-wrap: wrap; }
.gsearch .sb { flex: 1 1 260px; }
.gdone { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 14px; color: var(--muted); cursor: pointer; white-space: nowrap; }
.gcourse { margin: 14px 0 0; font-size: 14px; line-height: 1.5; color: var(--muted); }
.gcourse a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.gparts { display: flex; gap: 10px; margin: 14px 0 0; flex-wrap: wrap; }
.gpart { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: inherit; font: inherit; cursor: pointer; text-align: left; }
.gpart small { color: var(--muted); font-size: 12.5px; }
.gpart.on { border-color: var(--gold); background: var(--gold-soft); }
.gempty { color: var(--muted); margin: 20px 0 0; }
.pill.ph { cursor: pointer; color: #fff; background: var(--pink, #d64da9); border-color: transparent; }
.pill.ph:hover { opacity: .85; }
</style>

<style>
/* ===== «Грамматика»: Юна справа вверху (двигай здесь) ===== */
.study .grammar-page { position: relative; }
.study-shell.sky .study-main .wrap.grammar-page { background: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.study .gr-banner { --h: 400px; --right: 0px; --top: 0px;
  position: absolute; z-index: 0; top: var(--top); right: var(--right); height: var(--h); width: auto; max-width: 70%; object-fit: contain; object-position: right top;
  pointer-events: none; user-select: none; }
.study .grammar-page > :not(.gr-banner) { position: relative; z-index: 1; }
.study .grammar-page > .page-head { border-bottom-color: transparent; }
/* число правил уходит влево от лица Юны */
.study .grammar-page > .page-head { padding-right: 59%; align-items: center; }
.study .grammar-page > .page-head .big { color: var(--pink); }
.study .grammar-page .gdone { padding: 8px 14px; background: rgba(255, 255, 255, .75); border-radius: 99px; }
/* чипы и текст не заходят под Юну */
.study .grammar-page > .chips, .study .grammar-page > .gcourse { max-width: 58%; }
@media (max-width: 900px) {
  .study .gr-banner { position: static; display: block; max-width: 100%; height: auto; margin: 0 0 10px auto; }
  .study .grammar-page > .chips, .study .grammar-page > .gcourse { max-width: none; }
  .study .grammar-page > .page-head { padding-right: 0; }
}
</style>

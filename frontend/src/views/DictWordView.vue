<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import DictStar from '@/components/dict/DictStar.vue'
import { conjugate, withParticles } from '@/lib/conjugate'
import { mainEntry, type DictWord } from '@/lib/dictApi'
import { useDictRecent } from '@/composables/useDictRecent'
import { canonicalOf } from '@/data/seo'
import { wordDescription, wordJsonLd, wordLead, wordTitle } from '@/lib/dictSeo'

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const word = computed(() => String(route.params.word ?? ''))

/** Статья грузится при отрисовке на сервере (useFetch): на сервере запрос идёт прямо в NestJS (runtimeConfig.apiBase). */
const { data, error } = await useFetch<DictWord>(() => `/api/dict/word/${encodeURIComponent(word.value)}`, {
  baseURL: import.meta.server ? config.apiBase : undefined,
  timeout: 15_000,
  key: `dict-word-${word.value}`,
  watch: [word],
})

const entries = computed(() => data.value?.entries ?? [])
const main = computed(() => (entries.value.length ? mainEntry(entries.value) : undefined))
const q = ref('')
const search = () => void router.push({ path: '/dict', query: q.value.trim() ? { q: q.value.trim() } : {} })

/** Перевод: слова. Если у значения только описание без перевода, описание идёт в «Значение», а «Перевод» не показываем. */
const ruList = (s: { ru: { t: string; d: string }[] }) => s.ru.map(r => r.t).filter(Boolean).join('; ')
const defOf = (s: { ru: { t: string; d: string }[] }) => (ruList(s) ? s.ru[0]?.d ?? '' : s.ru.map(r => r.d).filter(Boolean).join(' '))

/* ---------- значения: у слов с десятками значений показываем первые, остальные по кнопке ---------- */
const SHOWN = 6
const openAll = ref(false)

/* ---------- формы ---------- */
const NOUNISH = ['명사', '대명사', '수사', '의존 명사']
const isPredicate = computed(() => ['동사', '형용사', '보조 동사', '보조 형용사'].includes(main.value?.posKo ?? ''))
const forms = computed(() => {
  const m = main.value
  if (!m) return null
  if (isPredicate.value) return conjugate(m.word, m.posKo)
  if (NOUNISH.includes(m.posKo)) return withParticles(m.word)
  return null
})
const formsTitle = computed(() => (isPredicate.value ? 'Спряжение' : 'С частицами'))
const dictForms = computed(() => [...new Set(entries.value.flatMap(e => e.forms))])

/* ---------- примеры ---------- */
const allSenses = computed(() => entries.value.flatMap(e => e.senses.map((s, i) => ({ e, s, i }))))
const sentences = computed(() => allSenses.value.flatMap(({ s }) => s.sent))
const phrases = computed(() => allSenses.value.flatMap(({ s }) => s.phr))
const dialogs = computed(() => allSenses.value.flatMap(({ s }) => s.dial))
const uniq = (l: string[]) => [...new Set(l)]

/* ---------- вкладки ---------- */
const TABS = computed(() => [
  { id: 'forms', label: formsTitle.value, on: !!forms.value },
  { id: 'rel', label: 'Связанные слова', on: !!(data.value?.related.length || data.value?.similar?.length) },
  { id: 'ex', label: 'Примеры', on: sentences.value.length > 0 },
  { id: 'phr', label: 'Словосочетания', on: phrases.value.length > 0 },
  { id: 'dial', label: 'Диалоги', on: dialogs.value.length > 0 },
].filter(t => t.on))
const tab = computed(() => {
  const t = route.query.tab
  return TABS.value.find(x => x.id === t)?.id ?? TABS.value[0]?.id ?? ''
})
const setTab = (id: string) => void router.replace({ query: id === TABS.value[0]?.id ? {} : { tab: id } })

/** Клик по пустому месту (по бокам, где нет блоков слова, шапки и подписи) закрывает слово: возвращает к поиску. */
function closeOnOutside(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  if (!t || t.closest('.top, .crumbs, .head, .word-nav, .meanings, .tabs, .panel, .none, .src, a, button, input')) return
  if (window.getSelection()?.toString()) return
  void router.push('/dict')
}
const history = useDictRecent()
/** Любое открытое слово попадает в «Недавно искал». */
function rememberWord() {
  const m = main.value
  if (!m) return
  const first = m.senses[0]
  const ru = first?.ru.map(r => r.t).filter(Boolean).join('; ') || m.ru
  history.add({ q: m.word, word: m.word, ru: ru.split('; ').slice(0, 2).join('; ').slice(0, 60), pos: m.pos })
}
onMounted(() => {
  rememberWord()
  document.addEventListener('click', closeOnOutside)
})
watch(main, rememberWord)
onBeforeUnmount(() => { if (import.meta.client) document.removeEventListener('click', closeOnOutside) })

/* ---------- SEO: уникальные заголовок и описание по слову, JSON-LD, настоящий код 404 для несуществующего слова ---------- */
const seoEntry = computed(() => (main.value ? { ...main.value, senses: main.value.senses } : undefined))
const pageUrl = computed(() => canonicalOf(route.path))
if (import.meta.server && !data.value && error.value?.statusCode === 404) setResponseStatus(useRequestEvent()!, 404)
useSeoMeta({
  title: () => (seoEntry.value ? wordTitle(seoEntry.value) : 'Такого слова нет · 우리말'),
  description: () => (seoEntry.value ? wordDescription(seoEntry.value) : 'Такого слова нет в большом корейско-русском словаре.'),
  ogTitle: () => (seoEntry.value ? wordTitle(seoEntry.value) : 'Такого слова нет · 우리말'),
  ogDescription: () => (seoEntry.value ? wordDescription(seoEntry.value) : undefined),
  twitterTitle: () => (seoEntry.value ? wordTitle(seoEntry.value) : undefined),
  twitterDescription: () => (seoEntry.value ? wordDescription(seoEntry.value) : undefined),
  robots: () => (seoEntry.value ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, nofollow'),
})
useHead({
  script: [{ key: 'dict-ld', type: 'application/ld+json', innerHTML: () => (seoEntry.value ? JSON.stringify(wordJsonLd(seoEntry.value, pageUrl.value)) : '') }],
})
const lead = computed(() => (seoEntry.value ? wordLead(seoEntry.value) : ''))
</script>

<template>
  <DictShell>
    <template #top>
      <form class="tsearch" role="search" @submit.prevent="search">
        <input v-model="q" type="search" lang="ko" autocomplete="off" placeholder="Введите слово на корейском или русском…" aria-label="Поиск по большому словарю">
      </form>
    </template>

    <nav class="crumbs" aria-label="Хлебные крошки">
      <RouterLink to="/">Главная</RouterLink><span>›</span><RouterLink to="/dict">Словарь</RouterLink><span>›</span><b lang="ko">{{ word }}</b>
    </nav>

    <section v-if="!main" class="none">
      <h1 lang="ko">{{ word }}</h1>
      <p v-if="error?.statusCode === 404">Такого слова в словаре нет. Попробуй <RouterLink :to="{ path: '/dict', query: { q: word } }">поиск</RouterLink>.</p>
      <p v-else>Не получилось загрузить слово. Обнови страницу или попробуй позже.</p>
    </section>

    <template v-else>
      <section class="head">
        <h1 lang="ko">{{ main.word }}</h1>
        <span v-if="main.pron" class="pron">[{{ main.pron }}]</span>
        <span class="chip">{{ main.pos }}</span>
        <span class="chip lvl">{{ main.level === 'нет' ? 'без уровня' : main.level }}</span>
        <span v-if="main.cat" class="cat" lang="ko">{{ main.cat }}</span>
        <DictStar :word="main.word" />
      </section>

      <p class="lead" lang="ru">{{ lead }}</p>

      <nav v-if="data?.navigation" class="word-nav" aria-label="Алфавитная навигация">
        <RouterLink v-if="data.navigation.previous" :to="`/dict/${encodeURIComponent(data.navigation.previous)}`" rel="prev">← Предыдущее · <span lang="ko">{{ data.navigation.previous }}</span></RouterLink>
        <span v-else class="disabled">← Начало списка</span>
        <RouterLink v-if="data.navigation.next" :to="`/dict/${encodeURIComponent(data.navigation.next)}`" rel="next"><span lang="ko">{{ data.navigation.next }}</span> · Следующее →</RouterLink>
        <span v-else class="disabled">Конец списка →</span>
      </nav>

      <section class="meanings">
        <h2>Значения слова</h2>
        <article v-for="e in entries" :key="e.id" class="entry">
          <p v-if="entries.length > 1" class="hom">Слово №{{ e.hom || 1 }} · {{ e.pos }}</p>
          <div v-for="(s, i) in (openAll ? e.senses : e.senses.slice(0, SHOWN))" :key="i" class="sense">
            <p v-if="e.senses.length > 1" class="sn"><span>{{ i + 1 }}</span>Значение {{ i + 1 }}</p>
            <dl class="kv">
              <template v-if="ruList(s)"><dt>Перевод</dt><dd class="ru">{{ ruList(s) }}</dd></template>
              <template v-if="defOf(s)"><dt>Значение</dt><dd>{{ defOf(s) }}</dd></template>
              <template v-if="s.ko"><dt>Определение</dt><dd lang="ko">{{ s.ko }}</dd></template>
              <template v-if="s.sent[0]">
                <dt>Пример</dt>
                <dd class="exv"><span lang="ko">{{ s.sent[0] }}</span></dd>
              </template>
            </dl>
          </div>
          <button v-if="!openAll && e.senses.length > SHOWN" type="button" class="allbtn" @click="openAll = true">Показать все значения ({{ e.senses.length }})</button>
        </article>
      </section>

      <div v-if="TABS.length" class="tabs" role="tablist">
        <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ cur: tab === t.id }" @click="setTab(t.id)">{{ t.label }}</button>
      </div>

      <section v-if="TABS.length" class="panel">
        <!-- формы -->
        <template v-if="tab === 'forms' && forms">
          <table class="forms">
            <tbody>
              <tr v-for="f in forms" :key="f.label"><th>{{ f.label }}</th><td lang="ko">{{ f.ko }}</td><td class="mu">{{ f.ru }}</td></tr>
            </tbody>
          </table>
          <p class="note">Формы построены по правилам: у редких неправильных слов могут отличаться.</p>
          <p v-if="dictForms.length" class="dforms"><span class="lab">В словаре отмечены:</span><span v-for="f in dictForms" :key="f" class="tag" lang="ko">{{ f }}</span></p>
        </template>

        <!-- связанные слова -->
        <div v-else-if="tab === 'rel'" class="two">
          <div v-if="data?.similar?.length">
            <h3 class="ph">Слова той же темы<span v-if="data.category" class="cat2" lang="ko"> · {{ data.category }}</span></h3>
            <ul class="pairs">
              <li v-for="p in data.similar" :key="p.word"><RouterLink :to="`/dict/${encodeURIComponent(p.word)}`" class="w" lang="ko">{{ p.word }}</RouterLink><span class="mu">{{ p.ru }}</span></li>
            </ul>
          </div>
          <div v-if="data?.related.length">
            <h3 class="ph">Слова, в которых есть «{{ word }}»</h3>
            <ul class="pairs">
              <li v-for="p in data.related" :key="p.word"><RouterLink :to="`/dict/${encodeURIComponent(p.word)}`" class="w alt" lang="ko">{{ p.word }}</RouterLink><span class="mu">{{ p.ru }}</span></li>
            </ul>
          </div>
        </div>

        <!-- примеры -->
        <ul v-else-if="tab === 'ex'" class="exlist">
          <li v-for="x in uniq(sentences)" :key="x"><span lang="ko">{{ x }}</span></li>
        </ul>
        <ul v-else-if="tab === 'phr'" class="exlist cols">
          <li v-for="x in uniq(phrases)" :key="x"><span lang="ko">{{ x }}</span></li>
        </ul>
        <ul v-else-if="tab === 'dial'" class="exlist">
          <li v-for="x in uniq(dialogs)" :key="x"><span lang="ko">{{ x }}</span></li>
        </ul>
      </section>

    </template>
  </DictShell>
</template>

<style scoped>
.tsearch { flex: 1; max-width: 560px; }
.tsearch input { width: 100%; box-sizing: border-box; padding: 11px 20px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 14px; outline: none; }
.tsearch input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--pink); }
.crumbs { display: flex; gap: 8px; align-items: center; width: fit-content; margin: 14px 0 12px; padding: 6px 16px; border-radius: 999px; background: rgba(255, 255, 255, .7); font-size: 12.5px; color: var(--muted); }
.crumbs a:hover { color: var(--ink); }
.crumbs b { color: var(--ink); font-weight: 600; }
.head, .meanings, .panel, .none { padding: 20px 26px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 14px; }
.head h1, .none h1 { margin: 0; font-size: clamp(40px, 7vw, 60px); line-height: 1.1; font-weight: 700; }
.pron { color: var(--muted); font-size: 18px; }
.chip { padding: 4px 14px; border-radius: 999px; background: var(--pink); color: var(--accent); font-size: 13px; font-weight: 600; }
.chip.lvl { background: var(--soft); color: var(--accent2); }
.cat { margin-left: auto; font-size: 12.5px; color: var(--muted); }
.meanings { margin-top: 14px; display: flex; flex-direction: column; gap: 14px; }
.meanings h2 { margin: 0; font-size: 18px; }
.entry { display: flex; flex-direction: column; gap: 12px; }
.hom { margin: 0; font-size: 12px; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; }
.sense { padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255, 255, 255, .6); }
.sn { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 12px; font-weight: 700; color: var(--accent); }
.sn span { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 8px; background: var(--pink); }
.kv { margin: 0; min-width: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 16px; }
.kv dt { padding-top: 3px; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.kv dd { margin: 0; color: #14173a; font-size: 15px; line-height: 1.55; }
.kv dd.ru { font-size: 19px; font-weight: 700; color: #43308c; line-height: 1.4; }
.exv { display: flex; flex-direction: column; gap: 4px; }
.allbtn { align-self: flex-start; padding: 9px 20px; border: 1px solid #cbbcff; border-radius: 999px; background: #fff; color: #43308c; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 12px; }
.tabs button { padding: 10px 20px; border: 1px solid rgba(255, 255, 255, .85); border-radius: 999px; background: rgba(255, 255, 255, .72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); font: inherit; font-size: 14px; font-weight: 600; color: #43308c; cursor: pointer; transition: background .2s, color .2s, box-shadow .2s; }
.tabs button:hover { background: rgba(255, 255, 255, .95); box-shadow: 0 6px 18px rgba(70, 55, 140, .14); }
.tabs button.cur { background: linear-gradient(135deg, #ff9fd2, #b79cff); border-color: transparent; color: #fff; box-shadow: 0 8px 20px rgba(160, 90, 200, .3); }
.forms { width: 100%; border-collapse: separate; border-spacing: 0 6px; }
.forms th { width: 30%; padding: 10px 14px; border-radius: 10px 0 0 10px; background: var(--soft); text-align: left; font-size: 13px; font-weight: 600; }
.forms td { padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 17px; }
.forms td.mu, .mu { font-size: 14px; color: var(--muted); }
.note { margin: 10px 2px 0; font-size: 12.5px; color: var(--muted); }
.dforms { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 0; }
.lab { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.tag { padding: 4px 12px; border-radius: 999px; background: var(--soft); color: var(--accent2); font-size: 14px; font-weight: 600; }
.ph { margin: 0 0 10px; font-size: 14px; }
.cat2 { font-weight: 500; color: var(--muted); font-size: 12px; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
.lead { width: fit-content; max-width: 100%; margin: 12px 0 0; padding: 8px 16px; border-radius: 16px; background: rgba(255, 255, 255, .72); color: #3b3f7a; font-size: 14px; line-height: 1.5; }
.word-nav { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
.word-nav a, .word-nav .disabled { padding: 9px 15px; border-radius: 999px; background: rgba(255, 255, 255, .75); color: #43308c; font-size: 13px; font-weight: 600; }
.word-nav .disabled { color: var(--muted); }
.pairs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pairs li { display: flex; align-items: center; gap: 14px; }
.w { flex: none; padding: 6px 16px; border-radius: 999px; background: var(--pink); color: var(--accent); font-weight: 700; font-size: 16px; }
.w.alt { background: var(--soft); color: var(--accent2); }
.exlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.exlist.cols { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.exlist li { padding: 10px 14px; border-radius: 12px; background: var(--pink); display: flex; flex-direction: column; gap: 3px; font-size: 16px; color: #14173a; }
.exlist small { font-size: 13px; opacity: .75; }
@media (max-width: 600px) { .kv { grid-template-columns: 1fr; gap: 2px; } .kv dd { margin-bottom: 8px; } .forms th { width: auto; } .head, .meanings, .panel { padding: 16px; } .cat { margin-left: 0; } }
</style>

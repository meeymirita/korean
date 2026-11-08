<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import { entriesOf } from '@/data/korean/krdictMock'

const route = useRoute()
const router = useRouter()
const word = computed(() => String(route.params.word ?? ''))
const entries = computed(() => entriesOf(word.value))
const main = computed(() => entries.value[0])
const q = ref('')

const TABS = [
  { id: 'forms', label: 'Спряжение' },
  { id: 'syn', label: 'Синонимы' },
  { id: 'rel', label: 'Связанные слова' },
  { id: 'notes', label: 'Заметки' },
] as const
const tab = computed(() => {
  const t = route.query.tab
  return TABS.find(x => x.id === t)?.id ?? 'forms'
})
const setTab = (id: string) => void router.replace({ query: id === 'forms' ? {} : { tab: id } })
const search = () => void router.push({ path: '/dict', query: q.value.trim() ? { q: q.value.trim() } : {} })
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
      <p>Такого слова в тестовых данных нет. Попробуй <RouterLink :to="{ path: '/dict', query: { q: word } }">поиск</RouterLink>.</p>
    </section>

    <template v-else>
      <section class="head">
        <h1 lang="ko">{{ main.word }}</h1>
        <span class="pron">[{{ main.pron }}]</span>
        <span class="chip">{{ main.pos }}</span>
        <span class="chip lvl">{{ main.level }}</span>
      </section>

      <section class="meanings">
        <h2>Значения слова</h2>
        <article v-for="e in entries" :key="e.id" class="entry">
          <p v-if="entries.length > 1" class="hom">Слово №{{ e.homonym }} · {{ e.pos }}</p>
          <div v-for="(s, i) in e.senses" :key="i" class="sense">
            <span class="num">{{ i + 1 }}</span>
            <div>
              <p class="ru">{{ s.ru.map(r => r.translation).join(' · ') }}</p>
              <p class="def" lang="ko">{{ s.definition }}</p>
              <p v-if="s.example" class="ex" lang="ko">{{ s.example }}</p>
            </div>
          </div>
        </article>
      </section>

      <div class="tabs" role="tablist">
        <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ cur: tab === t.id }" @click="setTab(t.id)">{{ t.label }}</button>
      </div>

      <section class="panel">
        <table v-if="tab === 'forms' && main.forms" class="forms">
          <tbody>
            <tr v-for="f in main.forms" :key="f.label"><th>{{ f.label }}</th><td lang="ko">{{ f.ko }}</td><td class="mu">{{ f.ru }}</td></tr>
          </tbody>
        </table>
        <ul v-else-if="tab === 'syn' && main.synonyms" class="pairs">
          <li v-for="p in main.synonyms" :key="p.ko"><RouterLink :to="`/dict/${p.ko}`" class="w" lang="ko">{{ p.ko }}</RouterLink><span class="mu">{{ p.ru }}</span></li>
        </ul>
        <ul v-else-if="tab === 'rel' && main.related" class="pairs">
          <li v-for="p in main.related" :key="p.ko"><RouterLink :to="`/dict/${p.ko}`" class="w" lang="ko">{{ p.ko }}</RouterLink><span class="mu">{{ p.ru }}</span></li>
        </ul>
        <ul v-else-if="tab === 'notes' && main.notes" class="notes"><li v-for="n in main.notes" :key="n">{{ n }}</li></ul>
        <p v-else class="mu empty">Для этого слова здесь пока пусто.</p>
      </section>
    </template>
  </DictShell>
</template>

<style scoped>
.tsearch { flex: 1; max-width: 560px; }
.tsearch input { width: 100%; box-sizing: border-box; padding: 11px 20px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 14px; outline: none; }
.tsearch input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--pink); }
.crumbs { display: flex; gap: 8px; align-items: center; margin: 14px 0 12px; font-size: 12.5px; color: var(--muted); }
.crumbs a:hover { color: var(--ink); }
.crumbs b { color: var(--ink); font-weight: 600; }
.head, .meanings, .panel, .none { padding: 20px 26px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 14px; }
.head h1, .none h1 { margin: 0; font-size: clamp(40px, 7vw, 60px); line-height: 1.1; font-weight: 700; }
.pron { color: var(--muted); font-size: 18px; }
.chip { padding: 4px 14px; border-radius: 999px; background: var(--pink); color: var(--accent); font-size: 13px; font-weight: 600; }
.chip.lvl { background: var(--soft); color: var(--accent2); }
.meanings { margin-top: 14px; display: flex; flex-direction: column; gap: 14px; }
.meanings h2 { margin: 0; font-size: 18px; }
.entry { display: flex; flex-direction: column; gap: 12px; }
.hom { margin: 0; font-size: 12px; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; }
.sense { display: flex; gap: 16px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255, 255, 255, .6); }
.sense p { margin: 0; }
.num { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; background: var(--pink); color: var(--accent); font-weight: 700; }
.ru { font-size: 19px; font-weight: 700; }
.def { margin-top: 3px; font-size: 14px; color: var(--muted); }
.ex { margin-top: 10px; padding: 10px 14px; border-radius: 12px; background: var(--pink); font-size: 16px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 12px; }
.tabs button { padding: 10px 20px; border: 0; border-radius: 999px; background: transparent; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer; transition: background .2s, color .2s; }
.tabs button:hover { background: var(--soft); }
.tabs button.cur { background: var(--pink); color: var(--accent); }
.forms { width: 100%; border-collapse: separate; border-spacing: 0 6px; }
.forms th { width: 34%; padding: 10px 14px; border-radius: 10px 0 0 10px; background: var(--soft); text-align: left; font-size: 13px; font-weight: 600; }
.forms td { padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 17px; }
.forms td.mu, .mu { font-size: 14px; color: var(--muted); }
.pairs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pairs li { display: flex; align-items: center; gap: 16px; }
.w { padding: 6px 16px; border-radius: 999px; background: var(--pink); color: var(--accent); font-weight: 700; font-size: 16px; }
.notes { margin: 0; padding-left: 20px; display: grid; gap: 8px; line-height: 1.55; font-size: 15px; }
.notes li::marker { color: var(--accent); }
.empty { margin: 0; }
@media (max-width: 600px) { .forms th { width: auto; } .forms tr { display: grid; } .head, .meanings, .panel { padding: 16px; } }
</style>

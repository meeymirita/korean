<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { listDict, loadFolders, type DictFolders, type DictListItem } from '@/lib/dictApi'
import { errText } from '@/lib/http'

defineProps<{ selected?: string }>()
const emit = defineEmits<{ pick: [word: string]; close: [] }>()

interface Folder { key: string; title: string; level: string; pos: string; count: number; tone: string }

const order = ref<'pop' | 'abc'>('pop')
const folders = ref<DictFolders | null>(null)
const error = ref('')

const POS_TITLE: Record<string, string> = {
  существительное: 'Существительные', глагол: 'Глаголы', прилагательное: 'Прилагательные', наречие: 'Наречия', местоимение: 'Местоимения',
  числительное: 'Числительные', частица: 'Частицы', междометие: 'Междометия', определитель: 'Определители', выражение: 'Выражения',
  'зависимое существительное': 'Зависимые существительные', 'вспомогательный глагол': 'Вспомогательные глаголы',
  'вспомогательное прилагательное': 'Вспомогательные прилагательные', окончание: 'Окончания', аффикс: 'Приставки и суффиксы',
}
const LEVEL = [['начальный', 'l1'], ['средний', 'l2'], ['высокий', 'l3'], ['нет', 'l0']] as const

/** Папки: все слова, уровни, части речи (самые большие первыми). */
const groups = computed(() => {
  const f = folders.value
  if (!f) return null
  const all: Folder[] = [{ key: 'all', title: 'Все слова', level: '', pos: '', count: f.total, tone: 'all' }]
  const levels: Folder[] = LEVEL.filter(([l]) => f.level[l]).map(([l, tone]) => ({ key: 'l:' + l, title: l === 'нет' ? 'Без уровня' : l[0]!.toUpperCase() + l.slice(1), level: l, pos: '', count: f.level[l]!, tone }))
  const parts: Folder[] = Object.entries(f.pos).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ key: 'p:' + p, title: POS_TITLE[p] ?? p, level: '', pos: p, count: n, tone: 'pos' }))
  return { all, levels, parts }
})

interface Box { items: DictListItem[]; total: number; loading: boolean; error: string }
const open = reactive<Record<string, boolean>>({})
const boxes = reactive<Record<string, Box>>({})

async function load(f: Folder, more = false) {
  boxes[f.key] ??= { items: [], total: f.count, loading: false, error: '' }
  const b = boxes[f.key]! // берём через reactive, а не результат присваивания: иначе список не перерисуется
  if (b.loading || (more && b.items.length >= b.total)) return
  b.loading = true
  b.error = ''
  const ord = order.value
  try {
    const r = await listDict(ord, f.level, f.pos, more ? b.items.length : 0)
    if (ord !== order.value) return // порядок сменили, пока грузилось
    b.items = more ? [...b.items, ...r.items] : r.items
    b.total = r.total
  } catch (e) {
    b.error = errText(e)
  } finally {
    b.loading = false
  }
}

function toggle(f: Folder) {
  open[f.key] = !open[f.key]
  if (open[f.key] && !boxes[f.key]?.items.length) void load(f)
}

watch(order, () => {
  // порядок поменялся: открытые папки загружаются заново
  const list = groups.value ? [...groups.value.all, ...groups.value.levels, ...groups.value.parts] : []
  for (const f of list) {
    boxes[f.key] = { items: [], total: f.count, loading: false, error: '' }
    if (open[f.key]) void load(f)
  }
})

onMounted(async () => {
  try {
    folders.value = await loadFolders()
  } catch (e) {
    error.value = errText(e)
  }
})
const fmt = (n: number) => n.toLocaleString('ru-RU')
</script>

<template>
  <div class="dwl-wl">
    <header class="dwl-wh">
      <div><h2>Все слова</h2><p v-if="folders" class="dwl-cnt">{{ fmt(folders.total) }} слов</p></div>
      <button type="button" class="dwl-x" aria-label="Закрыть список" @click="emit('close')">×</button>
    </header>
    <div class="dwl-ctl">
      <button type="button" :class="{ 'dwl-cur': order === 'pop' }" @click="order = 'pop'">популярные</button>
      <button type="button" :class="{ 'dwl-cur': order === 'abc' }" @click="order = 'abc'">по алфавиту</button>
    </div>

    <div class="dwl-scroll">
      <p v-if="error" class="dwl-msg">{{ error }}</p>
      <p v-else-if="!groups" class="dwl-msg">Загружаю…</p>
      <template v-else>
        <template v-for="sec in [{ t: '', list: groups.all }, { t: 'По уровню', list: groups.levels }, { t: 'По части речи', list: groups.parts }]" :key="sec.t">
          <h3 v-if="sec.t" class="dwl-sec">{{ sec.t }}</h3>
          <section v-for="f in sec.list" :key="f.key" class="dwl-folder">
            <button type="button" class="dwl-fh" :class="['dwl-' + f.tone, { 'dwl-op': open[f.key] }]" :aria-expanded="!!open[f.key]" @click="toggle(f)">
              <span class="dwl-ar">{{ open[f.key] ? '▾' : '▸' }}</span>{{ f.title }}<em>{{ fmt(f.count) }}</em>
            </button>
            <div v-if="open[f.key]" class="dwl-body">
              <button v-for="it in boxes[f.key]?.items ?? []" :key="it.id" type="button" class="dwl-row" :class="{ 'dwl-sel': selected === it.word }" @click="emit('pick', it.word)">
                <b lang="ko">{{ it.word }}</b><i v-if="it.hom" class="dwl-hm">{{ it.hom }}</i><span>{{ it.ru }}</span>
              </button>
              <p v-if="boxes[f.key]?.loading" class="dwl-msg">Загружаю…</p>
              <p v-else-if="boxes[f.key]?.error" class="dwl-msg">{{ boxes[f.key]?.error }}</p>
              <button v-else-if="boxes[f.key] && boxes[f.key]!.items.length < boxes[f.key]!.total" type="button" class="dwl-more" @click="load(f, true)">Ещё слова ({{ fmt(boxes[f.key]!.total - boxes[f.key]!.items.length) }})</button>
            </div>
          </section>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dwl-wl { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 26px; background: rgba(255, 255, 255, .6); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: var(--shadow); color: var(--ink); }
.dwl-wh { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 18px 14px; background: linear-gradient(135deg, #ff7ab8, #d64da9); }
.dwl-wh h2 { margin: 0; font-size: 19px; font-weight: 800; color: #fff; letter-spacing: -.01em; }
.dwl-cnt { margin: 2px 0 0; font-size: 12px; color: #ffe3f1; }
.dwl-x { display: none; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .25); color: #fff; font-size: 20px; line-height: 1; cursor: pointer; }
.dwl-ctl { display: flex; margin: 12px 14px 4px; padding: 3px; border-radius: 999px; background: rgba(255, 255, 255, .7); }
.dwl-ctl button { flex: 1; padding: 7px 8px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background .2s, color .2s, box-shadow .2s; }
.dwl-ctl button.dwl-cur { background: var(--ink); color: #fff; box-shadow: none; }
.dwl-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 10px 12px 14px; scrollbar-width: thin; scrollbar-color: rgba(120, 110, 200, .35) transparent; }
.dwl-sec { margin: 14px 4px 6px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 800; }
.dwl-folder { margin-bottom: 6px; }
.dwl-fh { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; border: 0; border-radius: 12px; background: rgba(255, 255, 255, .7); color: var(--accent2); font: inherit; font-size: 14px; font-weight: 800; text-align: left; cursor: pointer; transition: filter .15s; }
.dwl-fh:hover { filter: brightness(.97); }
.dwl-fh em { margin-left: auto; font-style: normal; font-size: 11.5px; font-weight: 700; opacity: .7; }
.dwl-ar { width: 10px; font-size: 11px; }
.dwl-all { background: rgba(214, 77, 169, .14); }
.dwl-l1 { background: rgba(214, 77, 169, .14); color: var(--muted); }
.dwl-l2 { background: rgba(255, 255, 255, .7); color: var(--accent2); }
.dwl-l3 { background: rgba(255, 255, 255, .7); color: var(--accent2); }
.dwl-l0 { background: rgba(255, 255, 255, .6); color: var(--accent2); }
.dwl-pos { background: rgba(255, 255, 255, .6); }
.dwl-body { margin: 4px 0 2px; }
.dwl-row { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 6px 12px 6px 22px; border: 0; border-radius: 8px; background: transparent; text-align: left; font: inherit; color: var(--ink); cursor: pointer; transition: background .12s; }
.dwl-row b { font-size: 16px; font-weight: 700; white-space: nowrap; }
.dwl-hm { font-style: normal; font-size: 10px; color: var(--muted); }
.dwl-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted); }
.dwl-row:hover { background: rgba(255, 255, 255, .95); }
.dwl-row.dwl-sel { background: rgba(214, 77, 169, .22); }
.dwl-more { display: block; width: calc(100% - 20px); margin: 4px 10px 6px; padding: 7px; border: 1px dashed rgba(120, 110, 200, .3); border-radius: 10px; background: transparent; color: var(--accent2); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.dwl-more:hover { background: rgba(255, 255, 255, .95); }
.dwl-msg { margin: 8px 12px; font-size: 12px; color: var(--muted); }
@media (max-width: 959px) { .dwl-x { display: inline-grid; place-items: center; } }
</style>

<script setup lang="ts">
/**
 * Массовая загрузка картинок (/upload): перетащить сразу много файлов, у каждого теги и описание, потом «Загрузить» одной кнопкой.
 * Картинки попадают в «Кабинет → Картинки» (kind gallery). Ссылка сюда — во вкладке «Картинки». Дизайн по макету владельца (сакура), в две колонки:
 * слева загрузка и действия с выбранными, справа список файлов.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, onBeforeRouteLeave } from 'vue-router'
import AuthGate from '@/components/AuthGate.vue'
import TagInput from '@/components/cabinet/TagInput.vue'
import { askConfirm } from '@/composables/useConfirm'
import { useAllTags } from '@/composables/useAllTags'
import { errText } from '@/lib/http'
import { cleanTags } from '@/lib/tags'
import { ALLOWED, MAX_DESCRIPTION, UploadLimitError, formatSize, useImagesStore } from '@/stores/images'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Сколько файлов можно положить в список за раз. */
const MAX_FILES = 100
const BACK = '/korean/cabinet?tab=images'

const progress = useProgressStore()
const store = useImagesStore()
const toast = useToastStore()
const allTags = useAllTags()

interface Row {
  key: number
  file: File
  url: string
  tags: string[]
  description: string
  picked: boolean
  state: 'wait' | 'busy' | 'error'
  error: string
}
const rows = ref<Row[]>([])
let nextKey = 1
const dragging = ref(false)
const busy = ref(false)
const status = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  if (!progress.unlocked || progress.role === 'guest') return
  try {
    await store.load() // занятое место и лимиты для проверки файлов
  } catch (e) {
    toast.error(errText(e))
  }
})

/* ---------- список файлов ---------- */
function addFiles(list: FileList | File[] | null) {
  const files = [...(list ?? [])]
  if (!files.length) return
  const problems: string[] = []
  let planned = rows.value.reduce((n, r) => n + r.file.size, 0)
  for (const f of files) {
    if (rows.value.length >= MAX_FILES) {
      problems.push(`за раз не больше ${MAX_FILES} файлов`)
      break
    }
    const problem = store.check(f)
    if (problem) {
      problems.push(problem)
      continue
    }
    if (store.used + planned + f.size > store.limit) {
      problems.push(`${f.name}: не хватает места`)
      continue
    }
    planned += f.size
    rows.value.push({ key: nextKey++, file: f, url: URL.createObjectURL(f), tags: [], description: '', picked: true, state: 'wait', error: '' })
  }
  if (problems.length) toast.error(problems.length === 1 ? problems[0]! : `${problems[0]} (и ещё ${problems.length - 1})`)
}
function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  addFiles(el.files)
  el.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  if (!busy.value) addFiles(e.dataTransfer?.files ?? null)
}
function drop(row: Row) {
  URL.revokeObjectURL(row.url)
  rows.value = rows.value.filter(r => r !== row)
}
async function clearAll() {
  if (!rows.value.length) return
  if (!(await askConfirm({ title: 'Убрать все файлы из списка?', text: 'На сервер они ещё не загружены, загруженные картинки не пострадают.', ok: 'Очистить' }))) return
  rows.value.forEach(r => URL.revokeObjectURL(r.url))
  rows.value = []
}
onBeforeUnmount(() => rows.value.forEach(r => URL.revokeObjectURL(r.url)))

/* ---------- выбранные: теги, описание, удаление пачкой ---------- */
const picked = computed(() => rows.value.filter(r => r.picked))
const allPicked = computed({
  get: () => rows.value.length > 0 && picked.value.length === rows.value.length,
  set: v => rows.value.forEach(r => (r.picked = v)),
})
const panel = ref<'' | 'tags' | 'desc'>('')
const bulkTags = ref<string[]>([])
const bulkDesc = ref('')
function togglePanel(p: 'tags' | 'desc') {
  panel.value = panel.value === p ? '' : p
}
function applyTags() {
  if (!bulkTags.value.length) return
  for (const r of picked.value) r.tags = cleanTags([...r.tags, ...bulkTags.value])
  toast.ok(`Теги добавлены: ${picked.value.length}`)
  bulkTags.value = []
  panel.value = ''
}
function applyDesc() {
  for (const r of picked.value) r.description = bulkDesc.value.slice(0, MAX_DESCRIPTION)
  toast.ok(`Описание заполнено: ${picked.value.length}`)
  bulkDesc.value = ''
  panel.value = ''
}
function dropPicked() {
  picked.value.forEach(r => URL.revokeObjectURL(r.url))
  rows.value = rows.value.filter(r => !r.picked)
}

/* ---------- загрузка ---------- */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** По очереди; сервер пускает 40 загрузок в минуту: на 429 ждём и пробуем тот же файл снова. Загруженные уходят из списка. */
async function uploadAll() {
  if (busy.value || !rows.value.length) return
  busy.value = true
  panel.value = ''
  const queue = rows.value.filter(r => r.state !== 'busy')
  let done = 0
  for (const [i, r] of queue.entries()) {
    r.state = 'busy'
    r.error = ''
    status.value = `Загружаю ${i + 1} из ${queue.length}`
    for (;;) {
      try {
        await store.upload(r.file, '', 'gallery', r.tags, r.description)
        done++
        drop(r)
        break
      } catch (e) {
        if (e instanceof UploadLimitError) {
          for (let s = e.retryAfter; s > 0; s--) {
            status.value = `Сервер принимает 40 картинок в минуту: продолжу через ${s} с`
            await sleep(1000)
          }
          continue
        }
        r.state = 'error'
        r.error = errText(e)
        break
      }
    }
  }
  busy.value = false
  status.value = ''
  const failed = rows.value.filter(r => r.state === 'error').length
  if (done) toast.ok(`Загружено картинок: ${done}. Они в «Кабинете» на вкладке «Картинки»`)
  if (failed) toast.error(`Не загрузилось: ${failed}. Причина написана у файла, можно нажать «Загрузить» ещё раз`)
}

onBeforeRouteLeave(async () => {
  if (busy.value) return askConfirm({ title: 'Загрузка ещё идёт', text: 'Если уйти, оставшиеся файлы не загрузятся.', ok: 'Уйти', danger: true })
  if (rows.value.length) return askConfirm({ title: 'Файлы не загружены', text: `В списке ${rows.value.length} — они пропадут.`, ok: 'Уйти', danger: true })
  return true
})
</script>

<template>
  <div class="study sky up">
    <div class="up-bg" aria-hidden="true"></div>
    <AuthGate v-if="!progress.unlocked" />
    <p v-else-if="progress.role === 'guest'" class="up-card up-guest">Картинки доступны только владельцу. <RouterLink :to="BACK">Назад</RouterLink></p>
    <div v-else class="up-wrap">
      <aside class="up-card up-side">
        <RouterLink :to="BACK" class="up-back">← Назад к картинкам</RouterLink>
        <header class="up-head">
          <svg class="up-ic" viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="9" width="32" height="28" rx="6" /><circle cx="15" cy="19" r="3.5" /><path d="M8 33l9-9 6 6 5-4 9 7" /><circle cx="38" cy="10" r="7" class="plus" /><path d="M38 6.5v7M34.5 10h7" class="plus-x" /></svg>
          <div>
            <h1>Массовая загрузка изображений</h1>
            <p>Загружайте сразу много картинок и добавляйте теги с описанием</p>
          </div>
        </header>

        <label class="up-drop" :class="{ on: dragging, off: busy }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
          <input ref="input" type="file" multiple :accept="ALLOWED.join(',')" :disabled="busy" @change="onPick" />
          <svg class="up-drop-ic" viewBox="0 0 64 56" aria-hidden="true"><rect x="12" y="4" width="40" height="32" rx="6" class="back" /><rect x="6" y="12" width="40" height="32" rx="6" /><circle cx="17" cy="23" r="4" /><path d="M10 40l12-12 8 8 6-5 10 9" /><circle cx="48" cy="44" r="9" class="plus" /><path d="M48 39.5v9M43.5 44h9" class="plus-x" /></svg>
          <b>Перетащите изображения сюда</b>
          <span>или нажмите, чтобы выбрать файлы</span>
          <small><em>PNG · JPG · WEBP · GIF</em> <i>|</i> <em>До {{ MAX_FILES }} файлов</em> <i>|</i> <em>До {{ formatSize(store.maxFile) }} на файл</em></small>
        </label>

        <template v-if="rows.length">
          <div class="up-bar">
            <label class="up-all"><input v-model="allPicked" type="checkbox" :disabled="busy" /> Выбрано: {{ picked.length }} из {{ rows.length }}</label>
            <div class="up-acts">
              <button type="button" class="up-btn" :class="{ on: panel === 'tags' }" :disabled="!picked.length || busy" @click="togglePanel('tags')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.5" /></svg>Добавить теги
              </button>
              <button type="button" class="up-btn" :class="{ on: panel === 'desc' }" :disabled="!picked.length || busy" @click="togglePanel('desc')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>Заполнить описание
              </button>
              <button type="button" class="up-btn danger" :disabled="!picked.length || busy" @click="dropPicked">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>Удалить
              </button>
            </div>
          </div>

          <div v-if="panel === 'tags'" class="up-panel">
            <TagInput v-model="bulkTags" :suggestions="allTags" label="Теги для выбранных: напишите и нажмите Enter" />
            <button type="button" class="up-btn main" :disabled="!bulkTags.length" @click="applyTags">Добавить к {{ picked.length }}</button>
          </div>
          <div v-else-if="panel === 'desc'" class="up-panel">
            <input v-model="bulkDesc" class="up-input" :maxlength="MAX_DESCRIPTION" placeholder="Одно описание для всех выбранных" aria-label="Описание для выбранных" @keydown.enter.prevent="applyDesc" />
            <button type="button" class="up-btn main" @click="applyDesc">Заполнить у {{ picked.length }}</button>
          </div>
        </template>
      </aside>

      <main class="up-card up-main">
        <p v-if="!rows.length" class="up-empty">Здесь появятся выбранные картинки: у каждой можно добавить теги и описание, потом загрузить всё одной кнопкой.</p>
        <template v-else>
          <ul class="up-list">
            <li v-for="r in rows" :key="r.key" class="up-row" :class="{ busy: r.state === 'busy', bad: r.state === 'error' }">
              <input v-model="r.picked" type="checkbox" class="up-check" :disabled="busy" :aria-label="`Выбрать ${r.file.name}`" />
              <img :src="r.url" :alt="r.file.name" class="up-thumb" />
              <div class="up-file">
                <b :title="r.file.name">{{ r.file.name }}</b>
                <small>{{ formatSize(r.file.size) }}</small>
                <small v-if="r.state === 'busy'" class="up-st">загружаю…</small>
                <small v-else-if="r.error" class="up-st bad">{{ r.error }}</small>
              </div>
              <div class="up-fields">
                <span class="up-lbl">Теги</span>
                <TagInput v-model="r.tags" :suggestions="allTags" label="Тег и Enter" />
                <span class="up-lbl">Описание</span>
                <input v-model="r.description" class="up-input" :maxlength="MAX_DESCRIPTION" placeholder="Описание (необязательно)" :aria-label="`Описание ${r.file.name}`" :disabled="r.state === 'busy'" />
              </div>
              <button type="button" class="up-x" :aria-label="`Убрать ${r.file.name}`" :disabled="r.state === 'busy'" @click="drop(r)">✕</button>
            </li>
          </ul>

          <footer class="up-foot">
            <button type="button" class="up-btn" :disabled="busy" @click="input?.click()"><b>+</b> Добавить ещё</button>
            <span class="up-status">{{ status }}</span>
            <button type="button" class="up-btn plain" :disabled="busy" @click="clearAll">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>Очистить всё
            </button>
            <button type="button" class="up-btn main big" :disabled="busy" @click="uploadAll">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" /></svg>{{ busy ? 'Загружаю…' : `Загрузить ${rows.length} ${rows.length % 10 === 1 && rows.length % 100 !== 11 ? 'файл' : rows.length % 10 >= 2 && rows.length % 10 <= 4 && (rows.length % 100 < 12 || rows.length % 100 > 14) ? 'файла' : 'файлов'}` }}
            </button>
          </footer>
        </template>
      </main>
    </div>
  </div>
</template>

<style>
.study.sky.up { position: relative; min-height: 100vh; padding: 32px 20px 48px; background: none; --up-violet: #8a5fc8; --up-deep: #4b2a7a; --up-pink: #d867b8; }
.up-bg { position: fixed; inset: 0; z-index: 0; background: #e9d8f6 url('@/assets/upload/bg.webp') center / cover no-repeat; }
.study.sky.up > :not(.up-bg) { position: relative; z-index: 1; }
.up-bg::after { content: ''; position: absolute; inset: 0; background: rgba(255, 255, 255, .18); }
.up-wrap { max-width: 1440px; margin: 0 auto; display: grid; grid-template-columns: minmax(340px, 420px) minmax(0, 1fr); gap: 20px; align-items: start; }
/* левая колонка остаётся на месте, пока листается длинный список справа */
.up-side { position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; box-sizing: border-box; }
.up-main { min-height: 420px; }
.up-empty { margin: 120px auto; max-width: 420px; font-size: 16px; line-height: 1.5; text-align: center; color: #7d659f; }
.up-card { padding: 22px 28px 26px; background: rgba(255, 250, 255, .86); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 30px 60px -30px rgba(75, 42, 122, .45); backdrop-filter: blur(10px); color: var(--up-deep); }
.up-guest { max-width: 520px; margin: 80px auto; text-align: center; }
.up-back { display: inline-block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: var(--up-violet); text-decoration: none; }
.up-back:hover { text-decoration: underline; }
.up-head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.up-head h1 { margin: 0; font-size: 24px; line-height: 1.2; font-weight: 700; color: var(--up-deep); }
.up-head p { margin: 4px 0 0; font-size: 15px; color: #6b4f93; }
.up-ic { flex: none; width: 52px; height: 52px; fill: none; stroke: var(--up-deep); stroke-width: 2.6; stroke-linejoin: round; stroke-linecap: round; }
.up-ic .plus, .up-drop-ic .plus { fill: var(--up-pink); stroke: #fff; stroke-width: 2; }
.up-ic .plus-x, .up-drop-ic .plus-x { stroke: #fff; stroke-width: 2.4; }

.up-drop { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 30px 16px 26px; text-align: center; background: rgba(243, 228, 250, .7); border: 2px dashed rgba(138, 95, 200, .55); border-radius: 22px; cursor: pointer; transition: background .2s, border-color .2s; }
.up-drop:hover, .up-drop.on { background: rgba(236, 214, 250, .9); border-color: var(--up-pink); }
.up-drop.off { opacity: .6; cursor: default; }
.up-drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.up-drop-ic { width: 96px; height: 84px; fill: rgba(200, 170, 240, .55); stroke: var(--up-violet); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
.up-drop-ic .back { fill: rgba(220, 200, 250, .8); }
.up-drop b { font-size: 19px; color: var(--up-deep); }
.up-drop span { font-size: 15px; color: #6b4f93; }
.up-drop small { margin-top: 6px; font-size: 13px; line-height: 1.6; color: #7d659f; }
.up-drop small i { margin: 0 8px; font-style: normal; opacity: .5; }
.up-drop small em { font-style: normal; white-space: nowrap; }

.up-bar { display: flex; flex-direction: column; gap: 12px; margin: 20px 0 12px; }
.up-all { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
.up-acts { display: flex; flex-direction: column; gap: 8px; }
.up-acts .up-btn { justify-content: flex-start; }
.up .up-btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; font-size: 14.5px; font-weight: 600; color: var(--up-deep); background: rgba(255, 255, 255, .85); border: 1.5px solid rgba(138, 95, 200, .35); border-radius: 14px; transition: background .15s, border-color .15s; }
.up .up-btn:hover:not(:disabled), .up .up-btn.on { border-color: var(--up-violet); background: #fff; }
.up .up-btn:disabled { opacity: .5; cursor: default; }
.up .up-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.up .up-btn.danger, .up .up-btn.main { color: #fff; background: linear-gradient(135deg, #e07ac8, #b65cc7); border-color: transparent; box-shadow: 0 10px 20px -12px rgba(182, 92, 199, .8); }
.up .up-btn.danger:hover:not(:disabled), .up .up-btn.main:hover:not(:disabled) { background: linear-gradient(135deg, #d667bf, #a64cba); border-color: transparent; }
.up .up-btn.plain { background: transparent; border-color: transparent; }
.up .up-btn.big { padding: 13px 28px; font-size: 17px; border-radius: 18px; }
.up .up-btn.big svg { width: 24px; height: 24px; }
.up .up-btn b { font-size: 20px; line-height: 1; }

.up-panel { display: flex; flex-direction: column; align-items: stretch; gap: 10px; margin-bottom: 12px; padding: 12px; background: rgba(243, 228, 250, .6); border-radius: 16px; }
.up .up-input { width: 100%; box-sizing: border-box; padding: 9px 14px; font: inherit; font-size: 14.5px; color: var(--up-deep); background: #fff; border: 1.5px solid rgba(138, 95, 200, .25); border-radius: 12px; outline: none; }
.up .up-input:focus { border-color: var(--up-violet); }
.up .tg-box { background: #fff; border-color: rgba(138, 95, 200, .25); }
.up .tg-chip { color: var(--up-deep); background: rgba(220, 190, 245, .7); }

.up-list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.up-row { display: grid; grid-template-columns: auto 132px minmax(110px, 170px) minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 12px 16px; background: rgba(255, 255, 255, .8); border: 1px solid rgba(138, 95, 200, .18); border-radius: 18px; }
.up-row.busy { opacity: .6; }
.up-row.bad { border-color: var(--bad); }
.up-check, .up-all input { width: 22px; height: 22px; accent-color: var(--up-violet); cursor: pointer; }
.up-thumb { width: 132px; height: 98px; object-fit: cover; border-radius: 12px; background: #f3e4fa; }
.up-file { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.up-file b { overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.up-file small { font-size: 13.5px; color: #7d659f; }
.up-st { font-weight: 600; }
.up-st.bad { color: var(--bad); }
.up-fields { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px 14px; }
.up-lbl { font-size: 14px; font-weight: 600; color: #6b4f93; }
.up .up-x { align-self: start; width: 34px; height: 34px; padding: 0; font-size: 18px; color: var(--up-deep); background: transparent; border: 0; border-radius: 50%; }
.up .up-x:hover:not(:disabled) { background: rgba(138, 95, 200, .12); }

.up-foot { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 18px -12px -12px; padding: 12px; background: rgba(255, 250, 255, .92); border-radius: 18px; }
.up-status { flex: 1; min-width: 120px; font-size: 14px; color: #6b4f93; }

@media (max-width: 1000px) {
  .up-wrap { grid-template-columns: 1fr; }
  .up-side { position: static; max-height: none; overflow: visible; }
  .up-acts { flex-direction: row; flex-wrap: wrap; }
  .up-main { min-height: 0; }
  .up-empty { margin: 30px auto; }
}
@media (max-width: 720px) {
  .study.sky.up { padding: 16px 10px 32px; }
  .up-card { padding: 16px 14px 20px; border-radius: 22px; }
  .up-head h1 { font-size: 22px; }
  .up-ic { width: 44px; height: 44px; }
  .up-row { grid-template-columns: auto 84px minmax(0, 1fr) auto; gap: 10px; padding: 10px; }
  .up-thumb { width: 84px; height: 64px; }
  .up-fields { grid-column: 1 / -1; grid-template-columns: 1fr; gap: 6px; }
  .up .up-x { grid-row: 1; grid-column: 4; }
  .up-foot .up-btn.big { width: 100%; justify-content: center; }
}

html[data-theme='dark'] .up-bg::after { background: rgba(20, 21, 43, .55); }
html[data-theme='dark'] .up-foot { background: rgba(37, 30, 66, .95); }
html[data-theme='dark'] .up-card { background: rgba(37, 30, 66, .88); border-color: rgba(165, 160, 255, .2); color: #ece4ff; }
html[data-theme='dark'] .up { --up-deep: #ece4ff; --up-violet: #c3a5ff; }
html[data-theme='dark'] .up-head p, html[data-theme='dark'] .up-drop span, html[data-theme='dark'] .up-lbl, html[data-theme='dark'] .up-status { color: #c9b8ec; }
html[data-theme='dark'] .up-drop { background: rgba(60, 45, 100, .6); }
html[data-theme='dark'] .up-row, html[data-theme='dark'] .up .up-btn:not(.main):not(.danger), html[data-theme='dark'] .up .up-input, html[data-theme='dark'] .up .tg-box { background: rgba(50, 40, 88, .9); color: #ece4ff; }
</style>

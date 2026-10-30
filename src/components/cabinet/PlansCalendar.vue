<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TagInput from '@/components/cabinet/TagInput.vue'
import { useAllTags } from '@/composables/useAllTags'
import { askConfirm } from '@/composables/useConfirm'
import { usePersisted } from '@/composables/usePersisted'
import { DOC_ACCEPT, MAX_PLAN_FILES, MAX_PLAN_TEXT, MAX_PLAN_TITLE, formatSize, isImage, usePlansStore, type Plan, type PlanFile } from '@/stores/plans'
import { dayKey, useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

const progress = useProgressStore()
const plans = usePlansStore()
const toast = useToastStore()
const allTags = useAllTags()
const owner = computed(() => progress.unlocked && !progress.isGuest)

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const todayKey = dayKey()
const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
/** Выбранный день и месяц переживают обновление страницы. */
const selected = usePersisted('plans_day', todayKey, isDay)
const cursor = usePersisted('plans_month', selected.value.slice(0, 7), v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v))

const monthLabel = computed(() => {
  const [y, m] = cursor.value.split('-').map(Number)
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(y!, m! - 1, 1))
})
const cells = computed(() => {
  const [y, m] = cursor.value.split('-').map(Number)
  const lead = (new Date(y!, m! - 1, 1).getDay() + 6) % 7
  const count = new Date(y!, m!, 0).getDate()
  return {
    lead,
    days: Array.from({ length: count }, (_, i) => {
      const key = dayKey(new Date(y!, m! - 1, i + 1))
      return { d: i + 1, key, done: (progress.data.days[key] ?? 0) > 0, plans: plans.byDay.get(key)?.length ?? 0 }
    }),
  }
})
function shift(delta: number) {
  const [y, m] = cursor.value.split('-').map(Number)
  cursor.value = dayKey(new Date(y!, m! - 1 + delta, 1)).slice(0, 7)
}
function pick(key: string) {
  selected.value = key
  closeForm()
}

const dayTitle = computed(() => {
  const s = new Date(selected.value + 'T12:00:00')
  const t = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(s)
  return t.charAt(0).toUpperCase() + t.slice(1)
})
const dayPlans = computed(() => plans.byDay.get(selected.value) ?? [])

/* ---------- форма записи ---------- */
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const title = ref('')
const time = ref('')
const text = ref('')
const tags = ref<string[]>([])
const picked = ref<File[]>([])
const busy = ref(false)
const problems = ref<string[]>([])

function closeForm() {
  formOpen.value = false
  editingId.value = null
  title.value = text.value = time.value = ''
  tags.value = []
  picked.value = []
  problems.value = []
}
function openNew() {
  closeForm()
  formOpen.value = true
}
function startEdit(p: Plan) {
  closeForm()
  editingId.value = p.id
  formOpen.value = true
  title.value = p.title
  time.value = p.time
  text.value = p.text
  tags.value = [...p.tags]
}
/** Файлы для новой записи: проверка до отправки, лишнее отбрасывается с объяснением. */
function pickFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const list = [...(input.files ?? [])]
  input.value = ''
  problems.value = []
  for (const f of list) {
    const problem = plans.check(f)
    if (problem) problems.value.push(problem)
    else if (picked.value.length < MAX_PLAN_FILES) picked.value.push(f)
  }
}
async function save() {
  if (busy.value) return
  busy.value = true
  problems.value = []
  try {
    if (editingId.value) {
      await plans.update(editingId.value, { title: title.value, time: time.value, text: text.value, tags: tags.value })
      toast.ok('Запись сохранена')
    } else {
      const plan = await plans.add({ day: selected.value, time: time.value, title: title.value, text: text.value, tags: tags.value })
      let failed = 0
      for (const f of picked.value) {
        try {
          await plans.upload(plan.id, f)
        } catch (err) {
          failed++
          problems.value.push(`${f.name}: ${(err as Error).message}`)
        }
      }
      if (failed) {
        toast.error(`Запись создана, но файлов не загрузилось: ${failed}`)
        picked.value = []
        formOpen.value = false
        editingId.value = null
        return
      }
      toast.ok('Запись добавлена')
    }
    closeForm()
  } catch (err) {
    problems.value = [(err as Error).message]
    toast.error((err as Error).message)
  } finally {
    busy.value = false
  }
}

async function removePlan(p: Plan) {
  const yes = await askConfirm({ title: `Удалить запись «${p.title}»?`, text: p.files.length ? `Вместе с ней удалятся файлы: ${p.files.length}. Это нельзя отменить.` : 'Это нельзя отменить.', ok: 'Удалить', danger: true })
  if (!yes) return
  try {
    await plans.remove(p.id)
    toast.ok('Запись удалена')
  } catch (err) {
    toast.error((err as Error).message)
  }
}

/* ---------- файлы записи ---------- */
const uploading = ref('')
async function attach(e: Event, p: Plan) {
  const input = e.target as HTMLInputElement
  const list = [...(input.files ?? [])]
  input.value = ''
  for (const f of list) {
    if (p.files.length >= MAX_PLAN_FILES) {
      toast.error(`В записи не больше ${MAX_PLAN_FILES} файлов`)
      break
    }
    const problem = plans.check(f)
    if (problem) {
      toast.error(problem)
      continue
    }
    uploading.value = p.id
    try {
      await plans.upload(p.id, f)
      toast.ok('Файл добавлен')
    } catch (err) {
      toast.error(`${f.name}: ${(err as Error).message}`)
    }
  }
  uploading.value = ''
}
async function removeFile(p: Plan, f: PlanFile) {
  const yes = await askConfirm({ title: `Удалить файл «${f.name}»?`, text: 'Это нельзя отменить.', ok: 'Удалить', danger: true })
  if (!yes) return
  try {
    await plans.removeFile(p.id, f.id)
    delete thumbs.value[f.id]
    toast.ok('Файл удалён')
  } catch (err) {
    toast.error((err as Error).message)
  }
}
/** PDF и картинки открываются в новой вкладке, Word скачивается. */
async function openFile(f: PlanFile) {
  try {
    const url = await plans.blobUrl(f.id, 'file')
    if (f.mime === 'application/pdf' || isImage(f.mime)) window.open(url, '_blank', 'noopener')
    else {
      const a = document.createElement('a')
      a.href = url
      a.download = f.name
      a.click()
    }
  } catch {
    toast.error('Не получилось открыть файл')
  }
}
const thumbs = ref<Record<string, string>>({})
async function showThumb(f: PlanFile) {
  if (thumbs.value[f.id] || !f.thumb) return
  try {
    thumbs.value[f.id] = await plans.blobUrl(f.id, 'thumb')
  } catch {
    /* останется значок файла */
  }
}
const withThumb = (p: Plan) => {
  p.files.forEach(showThumb)
  return p.files.filter(f => f.thumb)
}
const docsOf = (p: Plan) => p.files.filter(f => !f.thumb)

onMounted(async () => {
  if (!owner.value) return
  try {
    await plans.load()
  } catch (err) {
    toast.error((err as Error).message)
  }
})
onBeforeUnmount(() => plans.release())
</script>

<template>
  <section class="pc">
    <h2 class="today-h">Календарь</h2>
    <div class="pc-nav">
      <button type="button" class="plain" aria-label="Предыдущий месяц" @click="shift(-1)">←</button>
      <b>{{ monthLabel }}</b>
      <button type="button" class="plain" aria-label="Следующий месяц" @click="shift(1)">→</button>
      <button v-if="cursor !== todayKey.slice(0, 7) || selected !== todayKey" type="button" class="plain" @click="(cursor = todayKey.slice(0, 7)), pick(todayKey)">Сегодня</button>
    </div>
    <div class="pc-grid">
      <span v-for="d in WD" :key="d" class="pc-wd">{{ d }}</span>
      <span v-for="i in cells.lead" :key="'e' + i"></span>
      <button
        v-for="c in cells.days"
        :key="c.key"
        type="button"
        class="pc-day"
        :class="{ done: c.done, today: c.key === todayKey, sel: c.key === selected, has: c.plans > 0 }"
        :aria-label="`${c.d}${c.plans ? ', записей: ' + c.plans : ''}`"
        :aria-pressed="c.key === selected"
        @click="pick(c.key)"
      >{{ c.d }}<i v-if="c.plans" class="pc-dot"></i></button>
    </div>
    <p class="pg-legend"><i class="known"></i> были занятия <i class="pc-dot-leg"></i> есть запись</p>

    <div class="pc-panel">
      <div class="pc-head">
        <h3>{{ dayTitle }}</h3>
        <button v-if="owner && !formOpen" type="button" class="pc-new" @click="openNew">＋ Новая запись</button>
      </div>

      <p v-if="!owner" class="pg-empty">Записи и файлы к ним доступны владельцу после входа по токену.</p>

      <form v-if="owner && formOpen" class="pc-form" @submit.prevent="save">
        <div class="pc-row">
          <label class="pc-f grow">Название
            <input v-model="title" :maxlength="MAX_PLAN_TITLE" placeholder="Например, Урок с Лерой + домашка" aria-label="Название записи" />
          </label>
          <label class="pc-f">Время
            <input v-model="time" type="time" aria-label="Время" />
          </label>
        </div>
        <label class="pc-f">Что было и что задали
          <textarea v-model="text" :maxlength="MAX_PLAN_TEXT" rows="4" placeholder="Темы урока, домашнее задание, вопросы к следующему разу" aria-label="Текст записи"></textarea>
        </label>
        <TagInput v-model="tags" :suggestions="allTags" />
        <div v-if="!editingId" class="pc-pick">
          <label class="nt-add">📎 PDF, Word, картинки<input type="file" multiple :accept="DOC_ACCEPT" :disabled="busy" @change="pickFiles" /></label>
          <span v-for="(f, i) in picked" :key="f.name + i" class="pc-file">📄 {{ f.name }} · {{ formatSize(f.size) }}<button type="button" :aria-label="`Убрать ${f.name}`" @click="picked.splice(i, 1)">✕</button></span>
        </div>
        <ul v-if="problems.length" class="im-err"><li v-for="p in problems" :key="p">{{ p }}</li></ul>
        <div class="pc-acts">
          <button type="submit" :disabled="busy">{{ busy ? 'Сохраняю…' : editingId ? 'Сохранить' : 'Добавить запись' }}</button>
          <button type="button" class="plain" :disabled="busy" @click="closeForm">Отмена</button>
        </div>
      </form>

      <p v-if="owner && !dayPlans.length && !formOpen" class="pg-empty">На этот день записей нет. Можно записать урок, домашку или прикрепить конспект.</p>

      <ul v-if="owner" class="pc-list">
        <li v-for="p in dayPlans" :key="p.id" class="pc-card">
          <div class="pc-ch">
            <span v-if="p.time" class="pc-time">{{ p.time }}</span>
            <h4>{{ p.title }}</h4>
          </div>
          <p v-if="p.text" class="pc-text">{{ p.text }}</p>
          <ul v-if="p.tags.length" class="tg-tags"><li v-for="t in p.tags" :key="t"><span class="tg-tag">#{{ t }}</span></li></ul>

          <div v-if="withThumb(p).length" class="pc-thumbs">
            <div v-for="f in withThumb(p)" :key="f.id" class="pc-th">
              <button type="button" :aria-label="`Открыть ${f.name}`" @click="openFile(f)"><img v-if="thumbs[f.id]" :src="thumbs[f.id]" :alt="f.name" loading="lazy" /><span v-else>…</span></button>
              <button type="button" class="pc-rm" :aria-label="`Удалить ${f.name}`" @click="removeFile(p, f)">✕</button>
            </div>
          </div>
          <div v-if="docsOf(p).length" class="pc-docs">
            <span v-for="f in docsOf(p)" :key="f.id" class="pc-file">
              <button type="button" class="pc-open" @click="openFile(f)">📄 {{ f.name }} <small>{{ formatSize(f.size) }}</small></button>
              <button type="button" :aria-label="`Удалить ${f.name}`" @click="removeFile(p, f)">✕</button>
            </span>
          </div>

          <div class="pc-acts">
            <label class="nt-add">{{ uploading === p.id ? 'Загружаю…' : '📎 Файл' }}<input type="file" multiple :accept="DOC_ACCEPT" :disabled="uploading === p.id" @change="attach($event, p)" /></label>
            <button type="button" class="plain" @click="startEdit(p)">Изменить</button>
            <button type="button" class="plain danger" @click="removePlan(p)">Удалить</button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style>
.study .pc-nav { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.study .pc-nav b { min-width: 150px; text-align: center; text-transform: capitalize; }
.study .pc-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; max-width: 520px; margin-top: 10px; text-align: center; }
.study .pc-wd { padding: 4px 0; font-size: 11px; color: var(--muted); }
.study .pc-day { position: relative; display: grid; place-items: center; aspect-ratio: 1; padding: 0; font: inherit; font-size: 13px; color: var(--ink); background: var(--gold-soft); border: 0; border-radius: 50%; cursor: pointer; transition: transform .15s; }
.study .pc-day:hover { transform: scale(1.08); }
.study .pc-day.done { color: #fff; background: var(--gold); }
.study .pc-day.today { outline: 2px solid #ed9fe1; outline-offset: 2px; }
.study .pc-day.sel { box-shadow: 0 0 0 3px var(--ink); }
.study .pc-dot { position: absolute; bottom: 4px; width: 5px; height: 5px; background: #d64da9; border-radius: 50%; }
.study .pc-dot-leg { display: inline-block; width: 8px; height: 8px; background: #d64da9; border-radius: 50%; }
.study .pc-panel { margin-top: 18px; padding: 18px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
.study .pc-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.study .pc-head h3 { margin: 0; font-family: var(--serif); font-size: 22px; font-weight: 600; }
.study .pc-new, .study .pc-acts button[type="submit"] { padding: 9px 18px; font: inherit; font-size: 14px; font-weight: 600; color: #fff; background: var(--gold); border: 0; border-radius: 10px; cursor: pointer; }
.study .pc-form { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.study .pc-row { display: flex; flex-wrap: wrap; gap: 10px; }
.study .pc-f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); }
.study .pc-f.grow { flex: 1; min-width: 220px; }
.study .pc-f input, .study .pc-f textarea { padding: 10px 14px; font: inherit; font-size: 15px; color: var(--ink); background: var(--bg, #fff); border: 1px solid var(--line); border-radius: 10px; outline: none; }
.study .pc-f input:focus, .study .pc-f textarea:focus { border-color: var(--gold); }
.study .pc-f textarea { resize: vertical; }
.study .pc-pick, .study .pc-docs, .study .pc-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.study .pc-file { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px 4px 10px; font-size: 13px; background: var(--gold-soft); border-radius: 99px; }
.study .pc-file button { padding: 0 4px; font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer; }
.study .pc-file .pc-open { font-weight: 600; }
.study .pc-file small { color: var(--muted); font-weight: 400; }
.study .pc-list { display: flex; flex-direction: column; gap: 12px; margin: 14px 0 0; padding: 0; list-style: none; }
.study .pc-card { padding: 14px 16px; background: var(--bg, #fff); border: 1px solid var(--line); border-radius: 12px; }
.study .pc-ch { display: flex; align-items: baseline; gap: 10px; }
.study .pc-ch h4 { margin: 0; font-size: 17px; overflow-wrap: anywhere; }
.study .pc-time { font-family: var(--mono); font-size: 12.5px; font-weight: 700; color: var(--gold); }
.study .pc-text { margin: 8px 0 0; font-size: 14.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.study .pc-thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.study .pc-th { position: relative; width: 96px; height: 96px; }
.study .pc-th > button:first-child { width: 100%; height: 100%; padding: 0; overflow: hidden; background: var(--gold-soft); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.study .pc-th img { width: 100%; height: 100%; object-fit: cover; }
.study .pc-rm { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; padding: 0; font-size: 10px; color: #fff; background: rgba(0, 0, 0, .55); border: 0; border-radius: 50%; cursor: pointer; }
.study .pc-docs { margin-top: 10px; }
.study .pc-card .pc-acts { margin-top: 12px; }
.study .pc-nav .plain, .study .pc-acts .plain { padding: 8px 16px; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.study .pc-nav .plain:hover, .study .pc-acts .plain:hover { border-color: var(--gold); }
.study .pc-acts .plain.danger:hover { color: #b44634; border-color: #b44634; }
.study .pc-acts .nt-add { padding: 8px 16px; font-size: 14px; font-weight: 600; border: 1px dashed var(--line); border-radius: 10px; cursor: pointer; }
.study .pc-acts .nt-add input { display: none; }
@media (max-width: 600px) { .study .pc-panel { padding: 14px; } }
</style>

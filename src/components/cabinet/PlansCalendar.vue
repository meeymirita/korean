<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { errText } from '@/lib/http'
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
/** Выбранный день, месяц и открытая шторка переживают обновление страницы. */
const selected = usePersisted('plans_day', todayKey, isDay)
const cursor = usePersisted('plans_month', selected.value.slice(0, 7), v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v))
const open = usePersisted('plans_open', false, v => typeof v === 'boolean')

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
      const list = plans.byDay.get(key) ?? []
      return { d: i + 1, key, tutor: list.some(p => p.kind === 'tutor'), own: list.some(p => p.kind === 'own'), n: list.length }
    }),
  }
})
function shift(delta: number) {
  const [y, m] = cursor.value.split('-').map(Number)
  cursor.value = dayKey(new Date(y!, m! - 1 + delta, 1)).slice(0, 7)
}
/** Клик по дню открывает шторку справа с записями этого дня. */
function pick(key: string) {
  selected.value = key
  closeForm()
  open.value = true
}
function goToday() {
  cursor.value = todayKey.slice(0, 7)
  pick(todayKey)
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
/** Галочка «материал от репетитора»; без неё запись личная. */
const tutor = ref(false)
const tags = ref<string[]>([])
const picked = ref<File[]>([])
const busy = ref(false)
const problems = ref<string[]>([])
const dragging = ref(false)

function closeForm() {
  formOpen.value = false
  editingId.value = null
  title.value = text.value = time.value = ''
  tutor.value = false
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
  tutor.value = p.kind === 'tutor'
  tags.value = [...p.tags]
}
/** Файлы для новой записи: проверка до отправки, лишнее отбрасывается с объяснением. */
function takeFiles(list: File[]) {
  problems.value = []
  for (const f of list) {
    const problem = plans.check(f)
    if (problem) problems.value.push(problem)
    else if (picked.value.length < MAX_PLAN_FILES) picked.value.push(f)
  }
}
function pickFiles(e: Event) {
  const input = e.target as HTMLInputElement
  takeFiles([...(input.files ?? [])])
  input.value = ''
}
async function save() {
  if (busy.value) return
  busy.value = true
  problems.value = []
  const kind = tutor.value ? 'tutor' : 'own'
  try {
    if (editingId.value) {
      await plans.update(editingId.value, { title: title.value, time: time.value, text: text.value, kind, tags: tags.value })
      toast.ok('Запись сохранена')
    } else {
      const plan = await plans.add({ day: selected.value, time: time.value, title: title.value, text: text.value, kind, tags: tags.value })
      let failed = 0
      for (const f of picked.value) {
        try {
          await plans.upload(plan.id, f)
        } catch (err) {
          failed++
          problems.value.push(`${f.name}: ${errText(err)}`)
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
    problems.value = [errText(err)]
    toast.error(errText(err))
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
    toast.error(errText(err))
  }
}

/* ---------- файлы записи ---------- */
const uploading = ref('')
async function attachList(p: Plan, list: File[]) {
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
      toast.error(`${f.name}: ${errText(err)}`)
    }
  }
  uploading.value = ''
}
function attach(e: Event, p: Plan) {
  const input = e.target as HTMLInputElement
  const list = [...(input.files ?? [])]
  input.value = ''
  void attachList(p, list)
}
/** Перетащил файлы на карточку записи: прикрепляются к ней. Перетащил на форму: к новой записи. Текстом в поле они не вставляются. */
function dropOnPlan(e: DragEvent, p: Plan) {
  dragging.value = false
  void attachList(p, [...(e.dataTransfer?.files ?? [])])
}
function dropOnForm(e: DragEvent) {
  dragging.value = false
  const list = [...(e.dataTransfer?.files ?? [])]
  if (!list.length) return
  if (editingId.value) {
    const p = plans.items.find(x => x.id === editingId.value)
    if (p) void attachList(p, list)
  } else takeFiles(list)
}
async function removeFile(p: Plan, f: PlanFile) {
  const yes = await askConfirm({ title: `Удалить файл «${f.name}»?`, text: 'Это нельзя отменить.', ok: 'Удалить', danger: true })
  if (!yes) return
  try {
    await plans.removeFile(p.id, f.id)
    delete thumbs.value[f.id]
    toast.ok('Файл удалён')
  } catch (err) {
    toast.error(errText(err))
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
const ext = (f: PlanFile) => (f.name.split('.').pop() ?? '').toUpperCase().slice(0, 4)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value && !busy.value) open.value = false
}
onMounted(async () => {
  document.addEventListener('keydown', onKey)
  if (!owner.value) return
  try {
    await plans.load()
  } catch (err) {
    toast.error(errText(err))
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  plans.release()
})
</script>

<template>
  <section class="pc">
    <h2 class="today-h">Календарь</h2>
    <div class="pc-nav">
      <button type="button" class="plain" aria-label="Предыдущий месяц" @click="shift(-1)">←</button>
      <b>{{ monthLabel }}</b>
      <button type="button" class="plain" aria-label="Следующий месяц" @click="shift(1)">→</button>
      <button v-if="cursor !== todayKey.slice(0, 7)" type="button" class="plain" @click="goToday">Сегодня</button>
    </div>
    <div class="pc-grid">
      <span v-for="d in WD" :key="d" class="pc-wd">{{ d }}</span>
      <span v-for="i in cells.lead" :key="'e' + i"></span>
      <button
        v-for="c in cells.days"
        :key="c.key"
        type="button"
        class="pc-day"
        :class="{ today: c.key === todayKey, sel: open && c.key === selected }"
        :aria-label="`${c.d}${c.n ? ', записей: ' + c.n : ''}`"
        :aria-pressed="open && c.key === selected"
        @click="pick(c.key)"
      >
        {{ c.d }}
        <span v-if="c.tutor || c.own" class="pc-dots"><i v-if="c.tutor" class="tutor"></i><i v-if="c.own" class="own"></i></span>
      </button>
    </div>
    <p class="pc-legend"><i class="tutor"></i> от репетитора <i class="own"></i> моё личное</p>

    <!-- вынесено в body, как шторка на главной: внутри карточки с transform окно «прилипало» бы к ней -->
    <Teleport to="body">
      <Transition name="pc-drawer">
        <div v-if="open" class="study sky pc-dr" @click.self="open = false">
          <aside class="pc-box" role="dialog" aria-modal="true" :aria-label="dayTitle">
            <header class="pc-hd">
              <h2>{{ dayTitle }}</h2>
              <button class="pc-x" aria-label="Закрыть" @click="open = false">✕</button>
            </header>

            <p v-if="!owner" class="pc-empty">Записи и файлы к ним доступны владельцу после входа по токену.</p>
            <template v-else>
              <button v-if="!formOpen" type="button" class="pc-new" @click="openNew">＋ Новая запись</button>

              <form v-if="formOpen" class="pc-form" :class="{ drag: dragging }" @submit.prevent="save" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="dropOnForm">
                <label class="pc-f">Название
                  <input v-model="title" :maxlength="MAX_PLAN_TITLE" placeholder="Например, Урок с Лерой + домашка" aria-label="Название записи" />
                </label>
                <div class="pc-row">
                  <label class="pc-f">Время
                    <input v-model="time" type="time" aria-label="Время" />
                  </label>
                  <label class="pc-check"><input v-model="tutor" type="checkbox" /> Материал от репетитора <small>без галочки — моё личное</small></label>
                </div>
                <label class="pc-f">Что было и что задали
                  <textarea v-model="text" :maxlength="MAX_PLAN_TEXT" rows="4" placeholder="Темы урока, домашнее задание, вопросы к следующему разу" aria-label="Текст записи" @drop.prevent="dropOnForm"></textarea>
                </label>
                <TagInput v-model="tags" :suggestions="allTags" />
                <div v-if="!editingId" class="pc-pick">
                  <label class="pc-attach">📎 PDF, Word, картинки<input type="file" multiple :accept="DOC_ACCEPT" :disabled="busy" @change="pickFiles" /></label>
                  <span v-for="(f, i) in picked" :key="f.name + i" class="pc-file">📄 {{ f.name }} · {{ formatSize(f.size) }}<button type="button" :aria-label="`Убрать ${f.name}`" @click="picked.splice(i, 1)">✕</button></span>
                  <small class="pc-hint">Файлы можно перетащить прямо сюда.</small>
                </div>
                <ul v-if="problems.length" class="pc-err"><li v-for="p in problems" :key="p">{{ p }}</li></ul>
                <div class="pc-acts">
                  <button type="submit" class="pc-new" :disabled="busy">{{ busy ? 'Сохраняю…' : editingId ? 'Сохранить' : 'Добавить запись' }}</button>
                  <button type="button" class="pc-btn" :disabled="busy" @click="closeForm">Отмена</button>
                </div>
              </form>

              <p v-if="!dayPlans.length && !formOpen" class="pc-empty">На этот день записей нет. Можно записать урок, домашку или прикрепить конспект.</p>

              <ul class="pc-list">
                <li v-for="p in dayPlans" :key="p.id" class="pc-card" :class="p.kind" @dragover.prevent @drop.prevent="dropOnPlan($event, p)">
                  <div class="pc-ch">
                    <span class="pc-kind" :class="p.kind">{{ p.kind === 'tutor' ? 'От репетитора' : 'Моё личное' }}</span>
                    <span v-if="p.time" class="pc-time">{{ p.time }}</span>
                  </div>
                  <h4>{{ p.title }}</h4>
                  <p v-if="p.text" class="pc-text">{{ p.text }}</p>
                  <ul v-if="p.tags.length" class="pc-tags"><li v-for="t in p.tags" :key="t">#{{ t }}</li></ul>

                  <div v-if="withThumb(p).length" class="pc-thumbs">
                    <div v-for="f in withThumb(p)" :key="f.id" class="pc-th">
                      <button type="button" :aria-label="`Открыть ${f.name}`" @click="openFile(f)"><img v-if="thumbs[f.id]" :src="thumbs[f.id]" :alt="f.name" loading="lazy" /><span v-else>…</span></button>
                      <button type="button" class="pc-rm" :aria-label="`Удалить ${f.name}`" @click="removeFile(p, f)">✕</button>
                    </div>
                  </div>
                  <ul v-if="docsOf(p).length" class="pc-docs">
                    <li v-for="f in docsOf(p)" :key="f.id">
                      <button type="button" class="pc-doc" @click="openFile(f)"><em>{{ ext(f) }}</em><span>{{ f.name }}</span><small>{{ formatSize(f.size) }}</small></button>
                      <button type="button" class="pc-rm2" :aria-label="`Удалить ${f.name}`" @click="removeFile(p, f)">✕</button>
                    </li>
                  </ul>

                  <div class="pc-acts">
                    <label class="pc-attach">{{ uploading === p.id ? 'Загружаю…' : '📎 Файл' }}<input type="file" multiple :accept="DOC_ACCEPT" :disabled="uploading === p.id" @change="attach($event, p)" /></label>
                    <button type="button" class="pc-btn" @click="startEdit(p)">Изменить</button>
                    <button type="button" class="pc-btn danger" @click="removePlan(p)">Удалить</button>
                  </div>
                </li>
              </ul>
            </template>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style>
/* календарь: компактный, цвета по виду записи */
.study .pc { --tutor: #7a63e8; --own: #d64da9; }
.study .pc-nav { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.study .pc-nav b { min-width: 130px; text-align: center; text-transform: capitalize; font-size: 15px; }
.study .pc-nav .plain { padding: 6px 12px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.study .pc-nav .plain:hover { border-color: var(--gold); }
.study .pc-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; max-width: 340px; margin-top: 10px; text-align: center; }
.study .pc-wd { padding: 2px 0; font-size: 11px; color: var(--muted); }
.study .pc-day { position: relative; display: grid; place-items: center; aspect-ratio: 1; padding: 0; font: inherit; font-size: 12.5px; color: var(--ink); background: var(--gold-soft); border: 0; border-radius: 50%; cursor: pointer; transition: transform .15s; }
.study .pc-day:hover { transform: scale(1.1); }
.study .pc-day.today { outline: 2px solid #ed9fe1; outline-offset: 1px; font-weight: 700; }
.study .pc-day.sel { background: var(--ink); color: #fff; }
.study .pc-dots { position: absolute; bottom: 3px; display: flex; gap: 2px; }
.study .pc-dots i, .study .pc-legend i { display: inline-block; width: 5px; height: 5px; border-radius: 50%; }
.study .pc-legend i { width: 8px; height: 8px; margin: 0 4px 0 12px; }
.study .pc-legend i:first-child { margin-left: 0; }
.study .pc-dots .tutor, .study .pc-legend .tutor { background: var(--tutor); }
.study .pc-dots .own, .study .pc-legend .own { background: var(--own); }
.study .pc-legend { margin: 10px 0 0; font-size: 12px; color: var(--muted); }

/* шторка справа: как «Что здесь есть» на главной */
.study.sky.pc-dr { position: fixed; inset: 0; z-index: 200; display: block; min-height: 0; padding: 0; background: rgba(32, 38, 92, .45); backdrop-filter: blur(8px); }
.pc-box { position: absolute; top: 0; right: 0; bottom: 0; width: min(520px, 94vw); overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 24px clamp(16px, 3vw, 28px) 30px;
  color: #20265c; border-left: 1px solid #fff; background: linear-gradient(160deg, #fbeefc, #eaedff 60%, #fff3f8); box-shadow: -20px 0 50px rgba(100, 87, 170, .2); scrollbar-width: thin; }
.pc-box > * { flex: none; }
.pc-hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.pc-hd h2 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.15; }
.pc-x { flex: none; width: 40px; height: 40px; border: 1px solid #fff; border-radius: 50%; background: rgba(255, 255, 255, .8); color: #20265c; font: inherit; font-size: 16px; cursor: pointer; transition: .2s; }
.pc-x:hover { background: #fff; color: #d64da9; }
.pc-new { align-self: flex-start; padding: 10px 20px; font: inherit; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(100deg, #8f7cf0, #d64da9); border: 0; border-radius: 99px; cursor: pointer; }
.pc-new:disabled { opacity: .6; }
.pc-empty { margin: 0; font-size: 14px; color: #6c70a8; }
.pc-form { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: rgba(255, 255, 255, .75); border: 1px dashed transparent; border-radius: 18px; }
.pc-form.drag { border-color: #8f7cf0; background: rgba(255, 255, 255, .95); }
.pc-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.pc-f { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: #6c70a8; }
.pc-f input, .pc-f textarea { padding: 10px 14px; font: inherit; font-size: 15px; color: #20265c; background: #fff; border: 1px solid rgba(111, 105, 190, .3); border-radius: 10px; outline: none; }
.pc-f input:focus, .pc-f textarea:focus { border-color: #8f7cf0; }
.pc-f textarea { resize: vertical; }
.pc-check { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-bottom: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
.pc-check input { width: 18px; height: 18px; accent-color: #7a63e8; }
.pc-check small { flex-basis: 100%; margin-left: 26px; font-weight: 400; font-size: 12px; color: #6c70a8; }
.pc-pick { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pc-hint { flex-basis: 100%; font-size: 12px; color: #6c70a8; }
.pc-attach { padding: 8px 14px; font-size: 13px; font-weight: 600; color: #7a63e8; background: #fff; border: 1px dashed rgba(111, 105, 190, .45); border-radius: 10px; cursor: pointer; }
.pc-attach input { display: none; }
.pc-file { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px 4px 10px; font-size: 13px; background: #fff; border-radius: 99px; overflow-wrap: anywhere; }
.pc-file button { padding: 0 4px; font: inherit; color: inherit; background: transparent; border: 0; cursor: pointer; }
.pc-err { margin: 0; padding-left: 18px; font-size: 13px; color: #b44634; }
.pc-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pc-btn { padding: 8px 16px; font: inherit; font-size: 13px; font-weight: 600; color: #20265c; background: transparent; border: 1px solid rgba(111, 105, 190, .3); border-radius: 10px; cursor: pointer; }
.pc-btn:hover { border-color: #8f7cf0; }
.pc-btn.danger:hover { color: #b44634; border-color: #b44634; }
.pc-list { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.pc-card { padding: 16px 18px; background: rgba(255, 255, 255, .85); border: 1px solid #fff; border-left: 4px solid var(--own, #d64da9); border-radius: 16px; box-shadow: 0 10px 24px -18px rgba(80, 70, 160, .5); }
.pc-card.tutor { border-left-color: #7a63e8; }
.pc-ch { display: flex; align-items: center; gap: 10px; }
.pc-kind { padding: 2px 10px; font-size: 11.5px; font-weight: 700; color: #fff; border-radius: 99px; }
.pc-kind.tutor { background: #7a63e8; }
.pc-kind.own { background: #d64da9; }
.pc-time { font-size: 13px; font-weight: 700; color: #7a63e8; }
.pc-card h4 { margin: 8px 0 0; font-size: 18px; line-height: 1.25; overflow-wrap: anywhere; }
.pc-text { margin: 8px 0 0; font-size: 14.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.pc-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.pc-tags li { padding: 2px 10px; font-size: 12.5px; font-weight: 600; color: #7a63e8; background: #efeaff; border-radius: 99px; }
.pc-thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.pc-th { position: relative; width: 84px; height: 84px; }
.pc-th > button:first-child { width: 100%; height: 100%; padding: 0; overflow: hidden; background: #efeaff; border: 1px solid #fff; border-radius: 12px; cursor: pointer; }
.pc-th img { width: 100%; height: 100%; object-fit: cover; }
.pc-rm { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; padding: 0; font-size: 10px; color: #fff; background: rgba(0, 0, 0, .55); border: 0; border-radius: 50%; cursor: pointer; }
.pc-docs { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.pc-docs li { display: flex; align-items: center; gap: 6px; }
.pc-doc { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px 12px; font: inherit; font-size: 13.5px; text-align: left; color: #20265c; background: #f6f1ff; border: 1px solid #fff; border-radius: 12px; cursor: pointer; }
.pc-doc:hover { background: #efeaff; }
.pc-doc em { flex: none; padding: 2px 6px; font-size: 10.5px; font-style: normal; font-weight: 700; color: #fff; background: #8f7cf0; border-radius: 6px; }
.pc-doc span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-doc small { flex: none; color: #6c70a8; }
.pc-rm2 { flex: none; width: 28px; height: 28px; padding: 0; font-size: 11px; color: #6c70a8; background: transparent; border: 0; border-radius: 50%; cursor: pointer; }
.pc-rm2:hover { color: #b44634; background: #fff; }
.pc-card .pc-acts { margin-top: 12px; }
.pc-drawer-enter-active, .pc-drawer-leave-active { transition: opacity .25s; }
.pc-drawer-enter-active .pc-box, .pc-drawer-leave-active .pc-box { transition: transform .3s ease; }
.pc-drawer-enter-from, .pc-drawer-leave-to { opacity: 0; }
.pc-drawer-enter-from .pc-box, .pc-drawer-leave-to .pc-box { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) { .pc-drawer-enter-active, .pc-drawer-leave-active, .pc-drawer-enter-active .pc-box, .pc-drawer-leave-active .pc-box { transition: none; } }
</style>

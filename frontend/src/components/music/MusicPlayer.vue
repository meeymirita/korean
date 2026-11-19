<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { askConfirm } from '@/composables/useConfirm'
import { errText } from '@/lib/http'
import { CATEGORIES, useMusicAvailable, useMusicStore, type Category, type Track } from '@/stores/music'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'
import { PLAYER_IMG as IMG, coverFor, formatTime } from '@/components/music/playerAssets'

/**
 * Музыкальный плеер владельца: круглая кнопка на всех страницах, справа выезжает меню с плеером (макет владельца).
 * Звук живёт в `stores/music.ts`, поэтому не прерывается при переходе между страницами. Песни: `docs/music.md`.
 */
const store = useMusicStore()
const progress = useProgressStore()
const toast = useToastStore()

/** Музыка личная: гостю и без токена кнопки нет. */
const show = useMusicAvailable()
onMounted(() => void (show.value && store.load()))
watch(show, v => v && void store.load())

const pct = computed(() => (store.length > 0 ? Math.min(100, (store.time / store.length) * 100) : 0))
const cover = computed(() => (store.current ? (store.current.cover ?? coverFor(store.current.id)) : IMG.vinyl))
const subtitle = computed(() => (!store.current ? 'Выбери песню' : store.playing ? 'Сейчас играет' : 'Пауза'))

/* ---------- добавить ---------- */
const fileInput = ref<HTMLInputElement>()
const url = ref('')
const urlBusy = ref(false)
const urlError = ref('')
const dragOver = ref(false)

/** Файлы, которые уже есть в плеере (тот же размер или название) или выбраны дважды: предупреждение и выбор «только новые». */
async function startUpload(files: File[]) {
  const { fresh, dups } = store.splitDuplicates(files)
  if (dups.length) {
    const names = dups.slice(0, 5).map(d => `«${d.file.name}» (${d.of})`).join(', ') + (dups.length > 5 ? ` и ещё ${dups.length - 5}` : '')
    const ok = await askConfirm({
      title: 'Такие песни уже есть',
      text: `Повторов: ${dups.length} из ${files.length}: ${names}. ${fresh.length ? `Загрузить только новые (${fresh.length})?` : 'Новых файлов нет.'}`,
      ok: fresh.length ? 'Только новые' : 'Понятно',
      cancel: 'Отмена',
    })
    if (!ok) return
  }
  if (fresh.length) void store.uploadFiles(fresh)
}

function pickFiles(list: FileList | null) {
  const files = [...(list ?? [])]
  if (files.length) void startUpload(files)
  if (fileInput.value) fileInput.value.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  pickFiles(e.dataTransfer?.files ?? null)
}

async function addUrl() {
  const u = url.value.trim()
  if (!u || urlBusy.value) return
  urlBusy.value = true
  urlError.value = ''
  try {
    await store.addUrl(u)
    url.value = ''
  } catch (e) {
    urlError.value = errText(e)
  } finally {
    urlBusy.value = false
  }
}

/* ---------- песня: название и удаление ---------- */
const menuFor = ref('')
const editing = ref('')
const editTitle = ref('')

function startRename(t: Track) {
  menuFor.value = ''
  editing.value = t.id
  editTitle.value = t.title
}

async function saveRename() {
  const id = editing.value
  if (!id) return
  editing.value = ''
  try {
    await store.rename(id, editTitle.value)
  } catch (e) {
    toast.error(errText(e))
  }
}

async function removeTrack(t: Track) {
  menuFor.value = ''
  if (!(await askConfirm({ title: 'Удалить песню?', text: `«${t.title}» уйдёт из списка и с Яндекс.Диска (там в корзину).`, ok: 'Удалить', danger: true }))) return
  try {
    await store.remove(t.id)
    toast.ok('Песня удалена')
  } catch (e) {
    toast.error(errText(e))
  }
}

const tabName = computed(() => CATEGORIES.find(c => c.id === store.tab)?.name ?? '')

/* ---------- поиск по названию ---------- */
const query = ref('')
const q = computed(() => query.value.trim().toLowerCase())
/** Пока в поиске что-то набрано, ищем по обеим вкладкам сразу (песня может лежать в другой); иначе песни открытой вкладки. */
const shown = computed(() => (q.value ? store.tracks.filter(t => t.title.toLowerCase().includes(q.value)) : store.visible))
const tabOf = (t: Track) => CATEGORIES.find(c => c.id === t.category)?.name ?? ''
const count = (c: Category) => store.tracks.filter(t => t.category === c).length
/** Сколько загрузок закончилось ошибкой и может быть повторено. */
const failedCount = computed(() => store.uploads.filter(u => u.error && u.file).length)
const otherTab = (t: Track) => CATEGORIES.find(c => c.id !== t.category)!

async function moveTrack(t: Track) {
  menuFor.value = ''
  const to = otherTab(t)
  try {
    await store.setCategory(t.id, to.id)
    toast.ok(`«${t.title}» теперь во вкладке «${to.name}»`)
  } catch (e) {
    toast.error(errText(e))
  }
}

/* ---------- очередь, плейлисты, таймер сна ---------- */
/** Показан список плейлистов вместо песен вкладки. */
const lists = ref(false)
const pickTab = (c: Category) => {
  lists.value = false
  store.setTab(c)
}
const titleOf = (id: string) => store.tracks.find(t => t.id === id)?.title ?? 'песня удалена'
const shownLists = computed(() => (q.value ? store.playlists.filter(p => p.name.toLowerCase().includes(q.value)) : store.playlists))

function queueNext(t: Track) {
  menuFor.value = ''
  store.playNext(t.id)
  toast.ok(`«${t.title}» сыграет следом`)
}
function queueLast(t: Track) {
  menuFor.value = ''
  store.enqueue(t.id)
  toast.ok(`«${t.title}» в очереди`)
}

/** Выбор плейлиста для песни из меню «⋮»: id песни, новое название. */
const pickFor = ref('')
const newName = ref('')
async function addTo(plId: string, t: Track) {
  try {
    const added = await store.addToPlaylist(plId, t.id)
    const name = store.playlists.find(p => p.id === plId)?.name ?? ''
    if (added) toast.ok(`«${t.title}» добавлена в «${name}»`)
    else toast.ok(`«${t.title}» уже в «${name}»`)
  } catch (e) {
    toast.error(errText(e))
  }
  pickFor.value = ''
  menuFor.value = ''
}
async function createWith(t: Track) {
  const name = newName.value.trim()
  if (!name) return
  try {
    await store.createPlaylist(name, [t.id])
    toast.ok(`Плейлист «${name}» создан, «${t.title}» в нём`)
    newName.value = ''
    pickFor.value = ''
    menuFor.value = ''
  } catch (e) {
    toast.error(errText(e))
  }
}
async function makeList() {
  const name = newName.value.trim()
  if (!name) return
  try {
    await store.createPlaylist(name)
    newName.value = ''
  } catch (e) {
    toast.error(errText(e))
  }
}
const renamingList = ref('')
const listName = ref('')
function startRenameList(id: string, name: string) {
  renamingList.value = id
  listName.value = name
}
async function saveRenameList() {
  const id = renamingList.value
  if (!id) return
  renamingList.value = ''
  try {
    await store.renamePlaylist(id, listName.value)
  } catch (e) {
    toast.error(errText(e))
  }
}
async function dropList(id: string, name: string) {
  if (!(await askConfirm({ title: 'Удалить плейлист?', text: `«${name}» исчезнет, песни из плеера не удалятся.`, ok: 'Удалить', danger: true }))) return
  try {
    await store.deletePlaylist(id)
    toast.ok('Плейлист удалён')
  } catch (e) {
    toast.error(errText(e))
  }
}
async function dropFromList(plId: string, trackId: string) {
  try {
    await store.removeFromPlaylist(plId, trackId)
  } catch (e) {
    toast.error(errText(e))
  }
}

const sleepOpen = ref(false)
const sleeping = computed(() => store.sleepEnd > 0 || store.sleepTrack)
const sleepLabel = computed(() => (store.sleepEnd > 0 ? `Сон · ${formatTime(store.sleepLeft)}` : store.sleepTrack ? 'Сон · после песни' : 'Таймер сна'))
function setSleep(m: number | 'track') {
  store.setSleep(m)
  sleepOpen.value = false
  if (m === 'track') toast.ok('Музыка остановится после этой песни')
  else if (m > 0) toast.ok(`Музыка остановится через ${m} мин`)
  else toast.ok('Таймер сна выключен')
}

/** Меню песни открылось у нижнего края списка: прокручиваем, чтобы оно было видно целиком. */
watch([menuFor, pickFor], async ([m]) => {
  if (!m) return
  await nextTick()
  document.querySelector('.mp-menu')?.scrollIntoView?.({ block: 'nearest' })
})

const rowPlay = (t: Track) => (store.currentId === t.id && store.playing ? store.pause() : void store.play(t.id))
const seekTo = (e: Event) => store.seek((Number((e.target as HTMLInputElement).value) / 100) * (store.length || 0))
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) store.open = false
}
const repeatLabel = computed(() => ({ off: 'Без повтора', all: 'Повторять все', one: 'Повторять одну' })[store.repeat])
</script>

<template>
  <div v-if="show" class="mp-root">
    <!-- мини-плеер: виден, пока меню закрыто, а песня выбрана -->
    <Transition name="mp-mini">
      <div v-if="store.current && !store.open" class="mp-mini" role="group" aria-label="Мини-плеер">
        <img class="mp-mini-cover" :src="cover" alt="" draggable="false" />
        <div class="mp-mini-text">
          <b>{{ store.current.title }}</b>
          <small>{{ formatTime(store.time) }} / {{ formatTime(store.length || store.current.duration) }}</small>
          <input class="mp-mini-seek" type="range" min="0" max="100" step="0.1" :value="pct" :style="{ '--p': pct + '%' }" aria-label="Перемотка" @input="seekTo" />
        </div>
        <button type="button" class="mp-ic" aria-label="Предыдущая" @click="store.prev()"><img :src="IMG.prev" alt="" /></button>
        <button type="button" class="mp-ic mp-ic-main" :aria-label="store.playing ? 'Пауза' : 'Играть'" @click="store.toggle()"><img :src="store.playing ? IMG.pause : IMG.play" alt="" /></button>
        <button type="button" class="mp-ic" aria-label="Следующая" @click="store.advance(true)"><img :src="IMG.next" alt="" /></button>
        <button type="button" class="mp-ic" aria-label="Развернуть плеер" title="Развернуть" @click="store.open = true"><img :src="IMG.playlist" alt="" /></button>
        <button type="button" class="mp-ic" aria-label="Закрыть плеер и остановить музыку" title="Закрыть и остановить" @click="store.stop()"><img :src="IMG.close" alt="" /></button>
      </div>
    </Transition>

    <Teleport to="body">
      <Transition name="mp-panel">
        <aside v-if="store.open" class="mp-panel" role="dialog" aria-label="Музыкальный плеер" @keydown="onKey">
          <header class="mp-head">
            <img :src="IMG.note" alt="" draggable="false" />
            <h2>음악 플레이어</h2>
            <button type="button" class="mp-ic" aria-label="Закрыть плеер" @click="store.open = false"><img :src="IMG.close" alt="" /></button>
          </header>

          <div class="mp-now">
            <img class="mp-cover" :src="cover" alt="" draggable="false" />
            <img class="mp-deco" :src="IMG.cat" alt="" aria-hidden="true" draggable="false" />
            <div class="mp-now-text">
              <small>{{ subtitle }}</small>
              <b>{{ store.current?.title ?? 'Музыка не выбрана' }}</b>
            </div>
          </div>

          <div class="mp-seek">
            <input type="range" min="0" max="100" step="0.1" :value="pct" :style="{ '--p': pct + '%' }" :disabled="!store.current" aria-label="Время песни" @input="seekTo" />
            <div class="mp-times"><span>{{ formatTime(store.time) }}</span><span>{{ formatTime(store.length || store.current?.duration || 0) }}</span></div>
          </div>

          <div class="mp-ctl">
            <button type="button" class="mp-ic mp-tog" :class="{ on: store.shuffle }" :aria-pressed="store.shuffle" aria-label="Вперемешку" title="Вперемешку" @click="store.toggleShuffle()"><img :src="IMG.shuffle" alt="" /></button>
            <button type="button" class="mp-ic" aria-label="Предыдущая" @click="store.prev()"><img :src="IMG.prev" alt="" /></button>
            <button type="button" class="mp-ic mp-ic-main" :aria-label="store.playing ? 'Пауза' : 'Играть'" @click="store.toggle()"><img :src="store.playing ? IMG.pause : IMG.play" alt="" /></button>
            <button type="button" class="mp-ic" aria-label="Следующая" @click="store.advance(true)"><img :src="IMG.next" alt="" /></button>
            <button type="button" class="mp-ic mp-tog" :class="{ on: store.repeat !== 'off' }" :aria-label="repeatLabel" :title="repeatLabel" @click="store.cycleRepeat()">
              <img :src="IMG.repeat" alt="" /><em v-if="store.repeat === 'one'">1</em>
            </button>
            <div class="mp-vol">
              <button type="button" class="mp-ic" :aria-label="store.muted ? 'Включить звук' : 'Выключить звук'" @click="store.toggleMute()"><img :src="store.muted || store.volume === 0 ? IMG.mute : IMG.volume" alt="" /></button>
              <input type="range" min="0" max="100" :value="store.muted ? 0 : Math.round(store.volume * 100)" :style="{ '--p': (store.muted ? 0 : Math.round(store.volume * 100)) + '%' }" aria-label="Громкость" @input="store.setVolume(Number(($event.target as HTMLInputElement).value) / 100)" />
            </div>
          </div>

          <div class="mp-sleep">
            <button type="button" class="mp-chip" :class="{ on: sleeping }" :aria-expanded="sleepOpen" @click="sleepOpen = !sleepOpen">{{ sleepLabel }}</button>
            <div v-if="sleepOpen" class="mp-pop" role="menu" aria-label="Таймер сна">
              <button v-for="m in [15, 30, 60, 90]" :key="m" type="button" @click="setSleep(m)">Через {{ m }} мин</button>
              <button type="button" @click="setSleep('track')">После этой песни</button>
              <button v-if="sleeping" type="button" class="mp-del" @click="setSleep(0)">Выключить таймер</button>
            </div>
          </div>

          <div class="mp-bar">
            <div class="mp-tabs" role="tablist" aria-label="Вкладки плеера">
              <button v-for="c in CATEGORIES" :key="c.id" type="button" role="tab" :aria-selected="!lists && store.tab === c.id" :class="{ on: !lists && store.tab === c.id }" @click="pickTab(c.id)">
                {{ c.name }} <small>{{ count(c.id) }}</small>
              </button>
              <button type="button" role="tab" :aria-selected="lists" :class="{ on: lists }" @click="lists = true">Плейлисты <small>{{ store.playlists.length }}</small></button>
            </div>
            <div class="mp-search">
              <input v-model="query" type="text" :placeholder="lists ? 'Поиск плейлиста' : 'Поиск по названию'" aria-label="Поиск по названию" autocomplete="off" @keydown.esc.stop="query = ''" />
              <button v-if="query" type="button" class="mp-search-x" aria-label="Очистить поиск" @click="query = ''">✕</button>
            </div>
          </div>

          <div class="mp-scroll">
            <details v-if="store.upNext.length" class="mp-queue" open>
              <summary>Дальше по очереди · {{ store.upNext.length }}</summary>
              <ol>
                <li v-for="(id, i) in store.upNext" :key="i + id"><span>{{ titleOf(id) }}</span><button type="button" aria-label="Убрать из очереди" @click="store.unqueue(i)">×</button></li>
              </ol>
              <button type="button" class="mp-link" @click="store.clearQueue()">Очистить очередь</button>
            </details>

            <div v-if="lists" class="mp-lists">
              <form class="mp-newlist" @submit.prevent="makeList">
                <input v-model="newName" type="text" maxlength="60" placeholder="Новый плейлист" aria-label="Название нового плейлиста" />
                <button type="submit" class="mp-btn" :disabled="!newName.trim()">Создать</button>
              </form>
              <p v-if="!store.playlists.length" class="mp-hint">Плейлистов пока нет. Создай первый здесь или добавь песню через «⋮ → В плейлист».</p>
              <p v-else-if="!shownLists.length" class="mp-hint">Ничего не нашлось по «{{ query.trim() }}».</p>
              <details v-for="p in shownLists" :key="p.id" class="mp-pl" :class="{ cur: p.id === store.ctx }">
                <summary><b>{{ p.name }}</b> <small>{{ p.tracks.length }}</small></summary>
                <div class="mp-pl-act">
                  <button type="button" class="mp-btn" :disabled="!p.tracks.length" @click="store.playFromPlaylist(p.id)">Играть</button>
                  <input v-if="renamingList === p.id" v-model="listName" type="text" maxlength="60" class="mp-rename" aria-label="Название плейлиста" autofocus @keydown.enter="saveRenameList" @keydown.esc.stop="renamingList = ''" @blur="saveRenameList" />
                  <button v-else type="button" class="mp-link" @click="startRenameList(p.id, p.name)">Переименовать</button>
                  <button type="button" class="mp-link mp-del" @click="dropList(p.id, p.name)">Удалить</button>
                </div>
                <p v-if="!p.tracks.length" class="mp-hint">Пусто: добавляй песни через «⋮ → В плейлист».</p>
                <ol v-else class="mp-pl-songs">
                  <li v-for="id in p.tracks" :key="id" :class="{ cur: id === store.currentId && p.id === store.ctx }">
                    <button type="button" class="mp-pl-title" @click="store.playFromPlaylist(p.id, id)">{{ titleOf(id) }}</button>
                    <button type="button" aria-label="Убрать из плейлиста" @click="dropFromList(p.id, id)">×</button>
                  </li>
                </ol>
              </details>
            </div>

            <ul v-else-if="shown.length" class="mp-list">
              <li v-for="t in shown" :key="t.id" :class="{ cur: t.id === store.currentId }">
                <button type="button" class="mp-play" :aria-label="t.id === store.currentId && store.playing ? 'Пауза' : 'Играть'" @click="rowPlay(t)">
                  <img :src="t.cover ?? coverFor(t.id)" alt="" draggable="false" />
                  <span class="mp-play-ic"><img :src="t.id === store.currentId && store.playing ? IMG.pause : IMG.play" alt="" /></span>
                </button>
                <input v-if="editing === t.id" v-model="editTitle" class="mp-rename" type="text" maxlength="150" aria-label="Название песни" autofocus @keydown.enter="saveRename" @keydown.esc.stop="editing = ''" @blur="saveRename" />
                <button v-else type="button" class="mp-title" @click="rowPlay(t)"><b>{{ t.title }}</b><small>{{ t.duration ? formatTime(t.duration) : '' }}<template v-if="q && t.category !== store.tab"> · {{ tabOf(t) }}</template></small></button>
                <div class="mp-more">
                  <button type="button" class="mp-ic" aria-label="Действия" :aria-expanded="menuFor === t.id" @click="menuFor = menuFor === t.id ? '' : t.id"><img :src="IMG.more" alt="" /></button>
                  <div v-if="menuFor === t.id && pickFor === t.id" class="mp-menu">
                    <button v-for="p in store.playlists" :key="p.id" type="button" @click="addTo(p.id, t)">{{ p.tracks.includes(t.id) ? '✓ ' : '' }}{{ p.name }}</button>
                    <form class="mp-menu-new" @submit.prevent="createWith(t)">
                      <input v-model="newName" type="text" maxlength="60" placeholder="Новый плейлист" aria-label="Название нового плейлиста" />
                      <button type="submit" :disabled="!newName.trim()">＋</button>
                    </form>
                    <button type="button" @click="pickFor = ''">← Назад</button>
                  </div>
                  <div v-else-if="menuFor === t.id" class="mp-menu">
                    <button type="button" @click="queueNext(t)">Играть следом</button>
                    <button type="button" @click="queueLast(t)">В очередь</button>
                    <button type="button" @click="pickFor = t.id">В плейлист…</button>
                    <button type="button" @click="startRename(t)">Переименовать</button>
                    <button type="button" @click="moveTrack(t)">В «{{ otherTab(t).name }}»</button>
                    <button type="button" class="mp-del" @click="removeTrack(t)">Удалить</button>
                  </div>
                </div>
              </li>
            </ul>
            <div v-else-if="store.loaded && !lists" class="mp-empty">
              <img :src="IMG.sleepCat" alt="" draggable="false" />
              <p v-if="q">Ничего не нашлось по «{{ query.trim() }}».</p>
              <p v-else>Во вкладке «{{ tabName }}» пока пусто. Добавь файл или ссылку ниже.</p>
            </div>
            <p v-if="store.loadError" class="mp-err">Не получилось загрузить список: {{ store.loadError }}</p>

            <section class="mp-add" aria-label="Добавить песню">
              <p class="mp-where">Новые песни попадут во вкладку «{{ tabName }}»</p>
              <div class="mp-drop" :class="{ over: dragOver }" @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop">
                <img :src="IMG.add" alt="" draggable="false" />
                <span>Перетащи файлы сюда</span>
                <button type="button" class="mp-btn" @click="fileInput?.click()">Выбрать файлы</button>
                <input ref="fileInput" type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.flac,.wav,.webm" hidden @change="pickFiles(($event.target as HTMLInputElement).files)" />
              </div>
              <form class="mp-url" @submit.prevent="addUrl">
                <input v-model="url" type="url" inputmode="url" placeholder="Ссылка на видео или песню (YouTube)" aria-label="Ссылка" :disabled="urlBusy" />
                <button type="submit" class="mp-btn" :disabled="urlBusy || !url.trim()">Скачать</button>
              </form>
              <p v-if="urlError" class="mp-err">{{ urlError }}</p>

              <ul v-if="store.uploads.length || store.shownJobs.length" class="mp-jobs" aria-live="polite">
                <li v-for="u in store.uploads" :key="u.key" :class="{ bad: u.error }">
                  <span class="mp-job-name">{{ u.name }}</span>
                  <span class="mp-job-state" :class="{ wait: u.wait }">{{ u.error ?? (u.wait ? `Лимит запросов, жду ${u.wait} с и повторю сам` : u.percent < 100 ? `Передаю на сервер ${u.percent}%` : 'Передано') }}</span>
                  <i class="mp-job-bar"><i :style="{ width: (u.error ? 100 : u.percent) + '%' }"></i></i>
                  <button v-if="u.error && u.file" type="button" class="mp-retry" :disabled="store.busy" @click="store.retryUpload(u.key)">Повторить</button>
                  <button v-if="u.error" type="button" class="mp-x" aria-label="Убрать" @click="store.dismissUpload(u.key)">×</button>
                </li>
                <li v-if="failedCount > 1" class="mp-retry-all">
                  <button type="button" class="mp-btn" :disabled="store.busy" @click="store.retryFailed()">Повторить все ({{ failedCount }})</button>
                </li>
                <li v-for="j in store.shownJobs" :key="j.id" :class="{ bad: j.stage === 'error', done: j.stage === 'done' }">
                  <span class="mp-job-name">{{ j.title }}</span>
                  <span class="mp-job-state">{{ j.stage === 'error' ? j.error : j.stage === 'download' ? `${j.text} ${Math.round(j.percent)}%` : j.text }}</span>
                  <i class="mp-job-bar"><i :class="{ wait: j.stage !== 'download' && j.stage !== 'done' && j.stage !== 'error' }" :style="{ width: (j.stage === 'download' ? j.percent : 100) + '%' }"></i></i>
                  <button v-if="j.stage === 'error'" type="button" class="mp-x" aria-label="Убрать" @click="store.dismissJob(j.id)">×</button>
                </li>
              </ul>
            </section>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* Музыкальный плеер (макет владельца): светлая панель справа, розовые кнопки; классы с префиксом mp- */
.mp-root, .mp-panel { --mp-pink: #e86bc0; --mp-pink-d: #d64da9; --mp-ink: #2b2a5c; --mp-muted: #8a86b8; --mp-line: #eadff7; }
/* мини-плеер по центру у самого верха экрана */
.mp-mini { position: fixed; top: 12px; left: 0; right: 0; margin-inline: auto; width: max-content; z-index: 41; display: flex; align-items: center; gap: 6px; max-width: min(470px, calc(100vw - 24px)); padding: 6px 10px 6px 6px;
  color: var(--mp-ink); background: rgba(255, 255, 255, .95); border: 1px solid #fff; border-radius: 30px; box-shadow: 0 10px 26px rgba(100, 87, 170, .25); }
.mp-mini-cover { width: 42px; height: 42px; object-fit: cover; border-radius: 12px; flex: none; }
.mp-mini-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; font-size: 13px; line-height: 1.25; }
.mp-mini-text b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.mp-mini-text small { color: var(--mp-muted); font-size: 11px; }
.mp-mini .mp-ic { width: 30px; height: 30px; }
.mp-mini .mp-ic-main { width: 38px; height: 38px; }
.mp-mini-enter-active, .mp-mini-leave-active { transition: opacity .2s, transform .2s; }
.mp-mini-enter-from, .mp-mini-leave-to { opacity: 0; transform: translateY(-14px); }
@media (max-width: 560px) { .mp-mini-text small, .mp-mini .mp-ic:nth-of-type(1) { display: none; } }

.mp-panel { position: fixed; z-index: 48; top: 12px; right: 12px; bottom: 12px; width: min(clamp(440px, 46vw, 900px), calc(100vw - 24px)); display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 14px; overflow: hidden;
  color: var(--mp-ink); background: linear-gradient(165deg, #fff7fd 0%, #f1efff 100%); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 24px 60px rgba(70, 55, 140, .35); }
.mp-panel-enter-active, .mp-panel-leave-active { transition: transform .3s cubic-bezier(.2, .8, .2, 1), opacity .25s; }
.mp-panel-enter-from, .mp-panel-leave-to { transform: translateX(32px); opacity: 0; }
@media (prefers-reduced-motion: reduce) { .mp-panel-enter-active, .mp-panel-leave-active, .mp-mini-enter-active, .mp-mini-leave-active { transition: none; } }

.mp-head { display: flex; align-items: center; gap: 10px; }
.mp-head > img { width: 30px; height: 30px; object-fit: contain; }
.mp-head h2 { margin: 0; flex: 1; font-size: 19px; font-weight: 700; }
.mp-ic { position: relative; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; cursor: pointer; background: none; border: 0; border-radius: 50%; transition: transform .15s, filter .15s; flex: none; }
.mp-ic img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.mp-ic:hover { transform: scale(1.08); filter: brightness(1.04); }
.mp-ic-main { width: 60px; height: 60px; }
.mp-tog { opacity: .55; }
.mp-tog.on { opacity: 1; filter: drop-shadow(0 0 6px rgba(232, 107, 192, .6)); }
.mp-tog em { position: absolute; right: 4px; top: 4px; font-size: 10px; font-style: normal; font-weight: 800; color: #fff; background: var(--mp-pink-d); border-radius: 8px; padding: 0 4px; }

.mp-now { position: relative; flex: none; height: clamp(168px, 30vh, 340px); border-radius: 22px; overflow: hidden; background: #f3e9fb; }
.mp-cover { width: 100%; height: 100%; object-fit: cover; }
.mp-deco { position: absolute; right: 6px; bottom: 30px; width: 88px; height: auto; filter: drop-shadow(0 4px 8px rgba(70, 55, 140, .3)); pointer-events: none; }
.mp-now-text { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; padding: 22px 16px 10px; color: #fff; background: linear-gradient(to top, rgba(40, 25, 90, .75), transparent); }
.mp-now-text small { font-size: 12px; opacity: .85; }
.mp-now-text b { font-size: 16px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ползунки времени и громкости: тонкая полоска с розовой заливкой (--p: сколько пройдено) и узкий бегунок-палочка вместо кружка */
.mp-seek input, .mp-vol input, .mp-mini-seek { --mp-th: 3px; --mp-bar: 12px; -webkit-appearance: none; appearance: none; width: 100%; height: 16px; margin: 0; padding: 0; background: transparent; cursor: pointer; }
.mp-mini-seek { --mp-th: 2px; --mp-bar: 9px; height: 12px; margin-top: 2px; }
.mp-seek input:disabled { opacity: .5; cursor: default; }
.mp-seek input::-webkit-slider-runnable-track, .mp-vol input::-webkit-slider-runnable-track, .mp-mini-seek::-webkit-slider-runnable-track {
  height: var(--mp-th); border-radius: 3px; background: linear-gradient(90deg, var(--mp-pink-d) var(--p, 0%), var(--mp-line) var(--p, 0%)); }
.mp-seek input::-webkit-slider-thumb, .mp-vol input::-webkit-slider-thumb, .mp-mini-seek::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 3px; height: var(--mp-bar); margin-top: calc((var(--mp-th) - var(--mp-bar)) / 2); border: 0; border-radius: 2px; background: var(--mp-pink-d); transition: transform .15s; }
.mp-seek input:hover::-webkit-slider-thumb, .mp-vol input:hover::-webkit-slider-thumb, .mp-mini-seek:hover::-webkit-slider-thumb { transform: scaleY(1.25); }
.mp-seek input::-moz-range-track, .mp-vol input::-moz-range-track, .mp-mini-seek::-moz-range-track { height: var(--mp-th); border-radius: 3px; background: var(--mp-line); }
.mp-seek input::-moz-range-progress, .mp-vol input::-moz-range-progress, .mp-mini-seek::-moz-range-progress { height: var(--mp-th); border-radius: 3px; background: var(--mp-pink-d); }
.mp-seek input::-moz-range-thumb, .mp-vol input::-moz-range-thumb, .mp-mini-seek::-moz-range-thumb { width: 3px; height: var(--mp-bar); border: 0; border-radius: 2px; background: var(--mp-pink-d); }
.mp-times { display: flex; justify-content: space-between; font-size: 12px; color: var(--mp-muted); }
.mp-ctl { display: flex; align-items: center; justify-content: space-between; gap: 4px; flex-wrap: wrap; }
.mp-vol { display: flex; align-items: center; gap: 2px; flex: 1 1 110px; min-width: 110px; }

.mp-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: none; }
.mp-tabs { display: flex; flex-wrap: wrap; gap: 8px; flex: 0 1 auto; max-width: 100%; }
@media (max-width: 480px) { .mp-tabs button { padding: 8px 13px; font-size: 13px; } }
.mp-sleep { position: relative; display: flex; justify-content: flex-end; flex: none; margin: -4px 0 0; }
.mp-chip { padding: 5px 14px; font: inherit; font-size: 12px; font-weight: 700; color: var(--mp-muted); cursor: pointer; background: rgba(255, 255, 255, .7); border: 1px solid var(--mp-line); border-radius: 99px; }
.mp-chip.on { color: #fff; background: linear-gradient(100deg, var(--mp-pink), var(--mp-pink-d)); border-color: transparent; }
.mp-pop { position: absolute; z-index: 5; right: 0; top: 100%; display: flex; flex-direction: column; min-width: 190px; margin-top: 4px; padding: 6px; background: #fff; border: 1px solid var(--mp-line); border-radius: 14px; box-shadow: 0 10px 24px rgba(80, 40, 120, .18); }
.mp-pop button { padding: 8px 12px; font: inherit; font-size: 14px; text-align: left; color: var(--mp-ink); cursor: pointer; background: none; border: 0; border-radius: 10px; }
.mp-pop button:hover { background: rgba(214, 77, 169, .1); }
.mp-queue { padding: 8px 12px; font-size: 13px; background: rgba(255, 255, 255, .7); border: 1px solid var(--mp-line); border-radius: 14px; }
.mp-queue summary { cursor: pointer; font-weight: 700; color: var(--mp-pink-d); }
.mp-queue ol { margin: 6px 0; padding-left: 20px; }
.mp-queue li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mp-queue li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-queue li button, .mp-pl-songs li button:last-child { flex: none; padding: 0 6px; font: inherit; font-size: 16px; color: var(--mp-muted); cursor: pointer; background: none; border: 0; }
.mp-link { padding: 0; font: inherit; font-size: 13px; color: var(--mp-pink-d); cursor: pointer; background: none; border: 0; }
.mp-link:hover { text-decoration: underline; }
.mp-link.mp-del { color: #c0392b; }
.mp-hint { margin: 6px 0; font-size: 13px; color: var(--mp-muted); }
.mp-lists { display: flex; flex-direction: column; gap: 8px; }
.mp-newlist { display: flex; gap: 8px; }
.mp-newlist input { flex: 1 1 auto; min-width: 0; padding: 9px 14px; font: inherit; font-size: 14px; color: var(--mp-ink); background: #fff; border: 1px solid var(--mp-line); border-radius: 99px; }
.mp-pl { padding: 8px 12px; background: rgba(255, 255, 255, .7); border: 1px solid var(--mp-line); border-radius: 14px; }
.mp-pl.cur { border-color: var(--mp-pink); }
.mp-pl summary { cursor: pointer; display: flex; align-items: baseline; gap: 8px; }
.mp-pl summary small { color: var(--mp-muted); }
.mp-pl-act { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 8px 0; }
.mp-pl-songs { margin: 4px 0 0; padding-left: 20px; }
.mp-pl-songs li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mp-pl-songs li.cur .mp-pl-title { color: var(--mp-pink-d); font-weight: 700; }
.mp-pl-title { flex: 1 1 auto; min-width: 0; padding: 4px 0; font: inherit; font-size: 14px; text-align: left; color: inherit; cursor: pointer; background: none; border: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-menu-new { display: flex; gap: 6px; padding: 4px 8px; }
.mp-menu-new input { flex: 1 1 auto; min-width: 0; padding: 6px 10px; font: inherit; font-size: 13px; border: 1px solid var(--mp-line); border-radius: 99px; background: #fff; color: var(--mp-ink); }
.mp-search { position: relative; flex: 1 1 130px; min-width: 0; }
.mp-search input { width: 100%; box-sizing: border-box; padding: 9px 34px 9px 14px; font: inherit; font-size: 14px; color: var(--mp-ink); background: #fff; border: 1px solid var(--mp-line); border-radius: 99px; }
.mp-search input:focus { outline: none; border-color: var(--mp-pink); }
.mp-search-x { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; padding: 0; font: inherit; font-size: 12px; color: var(--mp-muted); cursor: pointer; background: none; border: 0; }
.mp-tabs button { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; font: inherit; font-size: 14px; font-weight: 700; color: var(--mp-muted); cursor: pointer; background: rgba(255, 255, 255, .7); border: 1px solid #fff; border-radius: 99px; transition: color .15s, background .15s; }
.mp-tabs button small { font-size: 12px; font-weight: 600; opacity: .8; }
.mp-tabs button:hover { color: var(--mp-pink-d); }
.mp-tabs button.on { color: #fff; background: linear-gradient(100deg, var(--mp-pink), var(--mp-pink-d)); box-shadow: 0 6px 14px rgba(214, 77, 169, .3); }
.mp-where { margin: 0; font-size: 12px; color: var(--mp-muted); }
.mp-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0 -8px; padding: 0 8px; display: flex; flex-direction: column; gap: 12px; }
.mp-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.mp-list li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 16px; transition: background .15s; position: relative; }
.mp-list li:hover { background: rgba(255, 255, 255, .7); }
.mp-list li.cur { background: linear-gradient(90deg, #fbd9ef, #ece6ff); }
.mp-play { position: relative; width: 46px; height: 46px; padding: 0; border: 0; border-radius: 12px; overflow: hidden; cursor: pointer; flex: none; background: #f3e9fb; }
.mp-play > img { width: 100%; height: 100%; object-fit: cover; }
.mp-play-ic { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(255, 255, 255, .45); opacity: 0; transition: opacity .15s; }
.mp-play-ic img { width: 30px; height: 30px; }
.mp-list li:hover .mp-play-ic, .mp-list li.cur .mp-play-ic { opacity: 1; }
.mp-title { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 0; font: inherit; text-align: left; color: inherit; cursor: pointer; background: none; border: 0; }
.mp-title b { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
.mp-title small { font-size: 12px; color: var(--mp-muted); }
.mp-rename { flex: 1 1 auto; min-width: 0; padding: 8px 10px; font: inherit; font-size: 14px; border: 1px solid var(--mp-pink); border-radius: 10px; background: #fff; color: var(--mp-ink); }
.mp-more { position: relative; }
.mp-more .mp-ic { width: 32px; height: 32px; }
.mp-menu { position: absolute; right: 0; top: 34px; z-index: 3; display: flex; flex-direction: column; min-width: 150px; padding: 6px; background: #fff; border: 1px solid var(--mp-line); border-radius: 14px; box-shadow: 0 12px 30px rgba(70, 55, 140, .25); }
.mp-menu button { padding: 9px 12px; font: inherit; font-size: 14px; text-align: left; color: var(--mp-ink); background: none; border: 0; border-radius: 10px; cursor: pointer; }
.mp-menu button:hover { background: #f4eefd; }
.mp-menu .mp-del { color: #c0392b; }
.mp-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0; text-align: center; color: var(--mp-muted); font-size: 14px; }
.mp-empty img { width: 120px; height: auto; }
.mp-empty p { margin: 0; }
.mp-err { margin: 0; font-size: 13px; color: #c0392b; }

.mp-add { display: flex; flex-direction: column; gap: 10px; padding-top: 10px; border-top: 1px solid var(--mp-line); }
.mp-drop { display: flex; align-items: center; gap: 10px; padding: 12px 14px; font-size: 14px; color: var(--mp-muted); border: 2px dashed #e3cdf1; border-radius: 18px; transition: background .15s, border-color .15s; }
.mp-drop > img { width: 30px; height: 30px; flex: none; }
.mp-drop > span { flex: 1 1 auto; }
.mp-drop.over { background: #fbe3f4; border-color: var(--mp-pink); }
.mp-btn { padding: 9px 16px; font: inherit; font-size: 14px; font-weight: 700; color: #fff; cursor: pointer; background: linear-gradient(100deg, var(--mp-pink), var(--mp-pink-d)); border: 0; border-radius: 99px; box-shadow: 0 6px 14px rgba(214, 77, 169, .3); white-space: nowrap; }
.mp-btn:disabled { opacity: .5; cursor: default; box-shadow: none; }
.mp-url { display: flex; gap: 8px; }
.mp-url input { flex: 1 1 auto; min-width: 0; padding: 10px 14px; font: inherit; font-size: 14px; color: var(--mp-ink); background: #fff; border: 1px solid var(--mp-line); border-radius: 99px; }
.mp-jobs { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.mp-jobs li { position: relative; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 8px 12px; font-size: 13px; background: rgba(255, 255, 255, .7); border-radius: 14px; }
.mp-job-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.mp-job-state { color: var(--mp-muted); text-align: right; }
.mp-jobs .mp-job-state.wait { grid-column: 1 / -1; text-align: left; order: 3; }
.mp-jobs .bad .mp-job-state { color: #c0392b; text-align: left; grid-column: 1 / -1; order: 3; }
.mp-job-bar { grid-column: 1 / -1; display: block; height: 5px; border-radius: 5px; background: var(--mp-line); overflow: hidden; }
.mp-job-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--mp-pink), var(--mp-pink-d)); transition: width .4s; }
.mp-job-bar i.wait { animation: mp-wait 1.2s ease-in-out infinite alternate; }
.mp-jobs .bad .mp-job-bar i { background: #e7a39b; }
@keyframes mp-wait { from { opacity: .35; } to { opacity: 1; } }
.mp-retry { grid-column: 1 / -1; justify-self: start; order: 4; padding: 4px 14px; font: inherit; font-size: 13px; font-weight: 700; color: var(--mp-pink-d); cursor: pointer; background: transparent; border: 1px solid var(--mp-pink); border-radius: 99px; }
.mp-retry:disabled { opacity: .5; cursor: default; }
.mp-jobs .mp-retry-all { display: block; padding: 0; background: none; }
.mp-x { position: absolute; right: 6px; top: 4px; width: 22px; height: 22px; padding: 0; font-size: 18px; line-height: 1; color: var(--mp-muted); background: none; border: 0; cursor: pointer; }

html[data-theme='dark'] .mp-root, html[data-theme='dark'] .mp-panel { --mp-ink: #ece9ff; --mp-muted: #a49fd6; --mp-line: #3b3866; }
html[data-theme='dark'] .mp-panel { background: linear-gradient(165deg, #2b2450 0%, #1f1e42 100%); border-color: #3b3866; }
html[data-theme='dark'] .mp-mini { background: rgba(43, 36, 80, .95); border-color: #3b3866; }
html[data-theme='dark'] .mp-list li:hover { background: rgba(255, 255, 255, .06); }
html[data-theme='dark'] .mp-list li.cur { background: linear-gradient(90deg, rgba(232, 107, 192, .3), rgba(125, 107, 240, .25)); }
html[data-theme='dark'] .mp-tabs button:not(.on) { background: rgba(255, 255, 255, .08); border-color: #3b3866; }
html[data-theme='dark'] .mp-pop, html[data-theme='dark'] .mp-newlist input, html[data-theme='dark'] .mp-menu-new input { background: #2b2450; border-color: #3b3866; color: var(--mp-ink); }
html[data-theme='dark'] .mp-chip:not(.on), html[data-theme='dark'] .mp-queue, html[data-theme='dark'] .mp-pl { background: rgba(255, 255, 255, .08); border-color: #3b3866; }
html[data-theme='dark'] .mp-menu, html[data-theme='dark'] .mp-url input, html[data-theme='dark'] .mp-rename, html[data-theme='dark'] .mp-search input { background: #2b2450; border-color: #3b3866; color: var(--mp-ink); }
html[data-theme='dark'] .mp-menu button { color: var(--mp-ink); }
html[data-theme='dark'] .mp-menu button:hover { background: rgba(255, 255, 255, .08); }
html[data-theme='dark'] .mp-jobs li { background: rgba(255, 255, 255, .06); }
html[data-theme='dark'] .mp-drop { border-color: #4a4680; }
html[data-theme='dark'] .mp-drop.over { background: rgba(232, 107, 192, .18); }
</style>

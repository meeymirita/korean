<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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

function pickFiles(list: FileList | null) {
  const files = [...(list ?? [])]
  if (files.length) void store.uploadFiles(files)
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
const count = (c: Category) => store.tracks.filter(t => t.category === c).length
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
          <input class="mp-mini-seek" type="range" min="0" max="100" step="0.1" :value="pct" aria-label="Перемотка" @input="seekTo" />
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
            <input type="range" min="0" max="100" step="0.1" :value="pct" :disabled="!store.current" aria-label="Время песни" @input="seekTo" />
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
              <input type="range" min="0" max="100" :value="store.muted ? 0 : Math.round(store.volume * 100)" aria-label="Громкость" @input="store.setVolume(Number(($event.target as HTMLInputElement).value) / 100)" />
            </div>
          </div>

          <div class="mp-tabs" role="tablist" aria-label="Вкладки плеера">
            <button v-for="c in CATEGORIES" :key="c.id" type="button" role="tab" :aria-selected="store.tab === c.id" :class="{ on: store.tab === c.id }" @click="store.setTab(c.id)">
              {{ c.name }} <small>{{ count(c.id) }}</small>
            </button>
          </div>

          <div class="mp-scroll">
            <ul v-if="store.visible.length" class="mp-list">
              <li v-for="t in store.visible" :key="t.id" :class="{ cur: t.id === store.currentId }">
                <button type="button" class="mp-play" :aria-label="t.id === store.currentId && store.playing ? 'Пауза' : 'Играть'" @click="rowPlay(t)">
                  <img :src="t.cover ?? coverFor(t.id)" alt="" draggable="false" />
                  <span class="mp-play-ic"><img :src="t.id === store.currentId && store.playing ? IMG.pause : IMG.play" alt="" /></span>
                </button>
                <input v-if="editing === t.id" v-model="editTitle" class="mp-rename" type="text" maxlength="150" aria-label="Название песни" autofocus @keydown.enter="saveRename" @keydown.esc.stop="editing = ''" @blur="saveRename" />
                <button v-else type="button" class="mp-title" @click="rowPlay(t)"><b>{{ t.title }}</b><small>{{ t.duration ? formatTime(t.duration) : '' }}</small></button>
                <div class="mp-more">
                  <button type="button" class="mp-ic" aria-label="Действия" :aria-expanded="menuFor === t.id" @click="menuFor = menuFor === t.id ? '' : t.id"><img :src="IMG.more" alt="" /></button>
                  <div v-if="menuFor === t.id" class="mp-menu">
                    <button type="button" @click="startRename(t)">Переименовать</button>
                    <button type="button" @click="moveTrack(t)">В «{{ otherTab(t).name }}»</button>
                    <button type="button" class="mp-del" @click="removeTrack(t)">Удалить</button>
                  </div>
                </div>
              </li>
            </ul>
            <div v-else-if="store.loaded" class="mp-empty">
              <img :src="IMG.sleepCat" alt="" draggable="false" />
              <p>Во вкладке «{{ tabName }}» пока пусто. Добавь файл или ссылку ниже.</p>
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
                  <span class="mp-job-state">{{ u.error ?? (u.percent < 100 ? `Передаю на сервер ${u.percent}%` : 'Передано') }}</span>
                  <i class="mp-job-bar"><i :style="{ width: (u.error ? 100 : u.percent) + '%' }"></i></i>
                  <button v-if="u.error" type="button" class="mp-x" aria-label="Убрать" @click="store.dismissUpload(u.key)">×</button>
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
.mp-mini-seek { width: 100%; height: 14px; margin: 2px 0 0; accent-color: var(--mp-pink-d); cursor: pointer; }
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

.mp-seek input, .mp-vol input { width: 100%; accent-color: var(--mp-pink-d); cursor: pointer; }
.mp-times { display: flex; justify-content: space-between; font-size: 12px; color: var(--mp-muted); }
.mp-ctl { display: flex; align-items: center; justify-content: space-between; gap: 4px; flex-wrap: wrap; }
.mp-vol { display: flex; align-items: center; gap: 2px; flex: 1 1 110px; min-width: 110px; }

.mp-tabs { display: flex; gap: 8px; flex: none; }
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
.mp-jobs .bad .mp-job-state { color: #c0392b; text-align: left; grid-column: 1 / -1; order: 3; }
.mp-job-bar { grid-column: 1 / -1; display: block; height: 5px; border-radius: 5px; background: var(--mp-line); overflow: hidden; }
.mp-job-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--mp-pink), var(--mp-pink-d)); transition: width .4s; }
.mp-job-bar i.wait { animation: mp-wait 1.2s ease-in-out infinite alternate; }
.mp-jobs .bad .mp-job-bar i { background: #e7a39b; }
@keyframes mp-wait { from { opacity: .35; } to { opacity: 1; } }
.mp-x { position: absolute; right: 6px; top: 4px; width: 22px; height: 22px; padding: 0; font-size: 18px; line-height: 1; color: var(--mp-muted); background: none; border: 0; cursor: pointer; }

html[data-theme='dark'] .mp-root, html[data-theme='dark'] .mp-panel { --mp-ink: #ece9ff; --mp-muted: #a49fd6; --mp-line: #3b3866; }
html[data-theme='dark'] .mp-panel { background: linear-gradient(165deg, #2b2450 0%, #1f1e42 100%); border-color: #3b3866; }
html[data-theme='dark'] .mp-mini { background: rgba(43, 36, 80, .95); border-color: #3b3866; }
html[data-theme='dark'] .mp-list li:hover { background: rgba(255, 255, 255, .06); }
html[data-theme='dark'] .mp-list li.cur { background: linear-gradient(90deg, rgba(232, 107, 192, .3), rgba(125, 107, 240, .25)); }
html[data-theme='dark'] .mp-tabs button:not(.on) { background: rgba(255, 255, 255, .08); border-color: #3b3866; }
html[data-theme='dark'] .mp-menu, html[data-theme='dark'] .mp-url input, html[data-theme='dark'] .mp-rename { background: #2b2450; border-color: #3b3866; color: var(--mp-ink); }
html[data-theme='dark'] .mp-menu button { color: var(--mp-ink); }
html[data-theme='dark'] .mp-menu button:hover { background: rgba(255, 255, 255, .08); }
html[data-theme='dark'] .mp-jobs li { background: rgba(255, 255, 255, .06); }
html[data-theme='dark'] .mp-drop { border-color: #4a4680; }
html[data-theme='dark'] .mp-drop.over { background: rgba(232, 107, 192, .18); }
</style>

<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import MarkStar from '@/components/korean/MarkStar.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { trainableRule } from '@/data/korean/rule-tasks'
import { famOfCard, gameOfCard } from '@/game/families'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { firstBlock } from '@/data/korean/grammar'
import { F, blk } from '@/data/korean/render'
import { useShareCard } from '@/composables/useShareCard'
import { useProgressStore } from '@/stores/progress'
import { CHANNEL, videoOf } from '@/data/korean/course'
import { titleOfVideo } from '@/data/korean/videoTitles'
import PhotoViewer from '@/components/korean/PhotoViewer.vue'
import { photoKey } from '@/data/korean/grammarPhotos'
import { useGrammarPhotos } from '@/composables/useGrammarPhotos'
import { askConfirm } from '@/composables/useConfirm'
import { errText } from '@/lib/http'
import { useToastStore } from '@/stores/toast'

const { current, mine, close, prev, next } = useGrammarModal()
const router = useRouter()
/** «Потренировать это правило»: серия заданий из примеров карточки; игры открыты тем, кто вошёл (владелец и гости). */
const canTrain = computed(() => progress.unlocked && !!current.value && trainableRule(current.value))
/** «Текст по правилу»: есть у карточек про частицы 은/는, 이/가, 을/를, 에, 에서, 하고. */
const textFam = computed(() => (progress.unlocked && current.value ? famOfCard(current.value.id) : undefined))
/** «Игра по правилу»: свой режим игры у карточки (-(으)ㄹ 거예요, 만). */
const ruleGame = computed(() => (progress.unlocked && current.value ? gameOfCard(current.value.id) : undefined))
function playGame() {
  const game = ruleGame.value
  if (!game) return
  close()
  void router.push({ path: '/game/home', query: { game } })
}
function trainText() {
  const fam = textFam.value
  if (!fam) return
  close()
  void router.push({ path: '/game/home', query: { game: 'ptext', fam } })
}
function train() {
  const id = current.value?.id
  if (!id) return
  close()
  void router.push({ path: '/game/home', query: { game: 'rule', g: id } })
}
const { share, busy } = useShareCard()
const progress = useProgressStore()
/** Отметка «урок пройден» ведёт сам владелец (у гостя записи не сохраняются). */
const owner = computed(() => progress.unlocked && !progress.isGuest)
const passed = computed(() => !!current.value && progress.isMarked('d', current.value.id))
/** отметка «пройдено» из данных снята владельцем (метка u) */
const unmarked = computed(() => !!current.value && progress.isMarked('u', current.value.id))
const isOk = computed(() => current.value?.st === 'ok' && !unmarked.value)
/** Видео урока; если файла на сервере нет (или локально), показываем заглушку. */
const broken = ref('')
const video = computed(() => {
  if (mine.value) return undefined
  const v = current.value?.video ?? videoOf(current.value?.l)
  return v && v !== broken.value ? v : undefined
})

/** Фото Юны к карточке: метка «Фото» открывает его на весь экран; у своей карточки (не урок) оно ещё стоит справа вместо видео. */
/** Картинка не загрузилась (файл на Диске заменили, а ссылка в памяти сервера и браузера ещё старая): один раз просим свежую ссылку. */
const photos = useGrammarPhotos()
const toast = useToastStore()
const photo = computed(() => (current.value ? photos.photoOf(current.value) : undefined))
function photoFailed() {
  if (current.value) photos.failed(current.value)
}
const viewer = ref<string | null>(null)

/* ---------- владелец управляет фото: загрузить, заменить, удалить (файл сразу на Яндекс.Диске) ---------- */
/** имя файла фото этой карточки; управление есть там, где фото показано: у своих карточек и у уроков во «Мои карточки» */
const photoName = computed(() => (current.value && owner.value && (!current.value.l || mine.value) ? photoKey(current.value) : undefined))
const photoBusy = ref(false)
const fileInput = ref<HTMLInputElement>()
/** для какой карточки выбирают файл (пока открыт выбор, карточку могут перелистнуть) */
let pickedFor = ''
function pickPhoto() {
  if (!photoName.value || photoBusy.value) return
  pickedFor = photoName.value
  fileInput.value?.click()
}
async function onPhotoFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !pickedFor) return
  photoBusy.value = true
  try {
    await photos.upload(pickedFor, file)
    toast.ok('Фото сохранено на Яндекс.Диске')
  } catch (err) {
    toast.error(`Фото не загрузилось: ${errText(err)}`)
  } finally {
    photoBusy.value = false
  }
}
async function dropPhoto() {
  const key = photoName.value
  if (!key || photoBusy.value) return
  if (!(await askConfirm({ title: 'Удалить фото карточки?', text: 'Фото пропадёт с сайта. На Яндекс.Диске оно уйдёт в корзину.', ok: 'Удалить', danger: true }))) return
  photoBusy.value = true
  try {
    await photos.remove(key)
    viewer.value = null
    toast.ok('Фото удалено')
  } catch (err) {
    toast.error(`Фото не удалилось: ${errText(err)}`)
  } finally {
    photoBusy.value = false
  }
}

/** Метки цвета ({o|…}) и теги — в простой текст для карточки. */
const plain = (s: string) => s.replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '')
function shareRule() {
  const g = current.value
  if (!g) return
  const formula = firstBlock(g.b, 'formula')
  const ex = firstBlock(g.b, 'ex')
  const lines = [formula ? plain(formula) : '', ...(ex ?? []).slice(0, 2).map(([k, r]) => `${plain(k)}  ${r}`)].filter(Boolean)
  void share({ kicker: g.l ? `правило · ${g.l}` : 'правило', title: plain(g.ko), sub: plain(g.ru), lines, icon: 'grammar' }, `правило-${g.id}`)
}

/* ---------- движок между описанием и видео ---------- */
const SPLIT_KEY = 'gram_split'
const SPLIT_DEFAULT = 0.46
/** доля ширины, которую занимает видео справа */
const split = ref(SPLIT_DEFAULT)
try {
  const v = Number(localStorage.getItem(SPLIT_KEY))
  if (v >= 0.2 && v <= 0.75) split.value = v
} catch {
  /* без хранилища остаётся значение по умолчанию */
}
const gm = ref<HTMLElement>()
const dragging = ref(false)
function splitDown(e: PointerEvent) {
  if (e.button !== 0) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
}
function splitMove(e: PointerEvent) {
  if (!dragging.value || !gm.value) return
  const r = gm.value.getBoundingClientRect()
  split.value = Math.min(0.75, Math.max(0.2, (r.right - e.clientX) / r.width))
}
function splitUp() {
  if (!dragging.value) return
  dragging.value = false
  try {
    localStorage.setItem(SPLIT_KEY, String(split.value))
  } catch {
    /* не страшно */
  }
}
function splitReset() {
  split.value = SPLIT_DEFAULT
  splitUp()
}

function onKey(e: KeyboardEvent) {
  if (!current.value) return
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  void photos.load()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
watch(current, g => (document.body.style.overflow = g ? 'hidden' : ''))
</script>

<template>
  <div v-if="current" class="study sky study-modal" @click.self="close">
    <div class="gp wide" role="dialog" aria-modal="true">
      <div class="gh">
        <div class="tt">
          <h2 v-html="F(current.ko)"></h2>
          <div class="rn">{{ current.ru }}</div>
          <div class="pl">
            <span class="pill">{{ current.s }}</span>
            <span v-if="current.l" class="pill l">{{ current.l }}</span>
            <span class="pill" :class="isOk ? 's' : 'n'">
              {{ isOk ? 'пройдено' : 'ещё рано' }}
            </span>
            <button v-if="canTrain" type="button" class="pass train" title="Игра из примеров этой карточки" @click="train">Потренировать это правило</button>
            <button v-if="ruleGame" type="button" class="pass train" title="Режим игры именно про это правило" @click="playGame">Игра по правилу</button>
            <button v-if="textFam" type="button" class="pass train" title="Предложения и рассказы с этой частицей: поставь её в пропуски" @click="trainText">Текст по правилу</button>
            <span v-if="photo || photoName" class="phw">
              <button v-if="photo" type="button" class="pass ph" title="Показать фото Юны к этому правилу" @click="viewer = photo!">Фото</button>
              <button v-else type="button" class="pass" :disabled="photoBusy" title="Загрузить фото к этой карточке: оно сразу ляжет на Яндекс.Диск" @click="pickPhoto">{{ photoBusy ? 'Загружается…' : '＋ Фото' }}</button>
              <span v-if="photo && photoName" class="phm">
                <button type="button" class="pass" :disabled="photoBusy" @click="pickPhoto">{{ photoBusy ? 'Загружается…' : 'Заменить' }}</button>
                <button type="button" class="pass del" :disabled="photoBusy" @click="dropPhoto">Удалить</button>
              </span>
            </span>
            <button v-if="owner && current.st === 'ok'" type="button" class="pass" :class="{ on: unmarked }" :aria-pressed="unmarked" :title="unmarked ? 'Вернуть отметку «пройдено»' : 'Снять отметку «пройдено»: карточка не пройдена'" @click="progress.toggleMark('u', current.id)">
              {{ unmarked ? 'Вернуть отметку «пройдено»' : 'Снять отметку «пройдено»' }}
            </button>
            <button v-if="owner && current && current.st !== 'ok'" type="button" class="pass" :class="{ on: passed }" :aria-pressed="passed" @click="progress.toggleMark('d', current.id)">
              {{ passed ? `✓ ${current.l || 'Тема'} пройдено` : `Отметить пройденным${current.l ? ': ' + current.l.toLowerCase() : ''}` }}
            </button>
          </div>
        </div>
        <MarkStar kind="g" :id="current.id" />
        <button title="Поделиться карточкой" aria-label="Поделиться карточкой" :disabled="busy" @click="shareRule"><Icon name="picture" /></button>
        <button title="Предыдущая" aria-label="Предыдущая" @click="prev">←</button>
        <button title="Следующая" aria-label="Следующая" @click="next">→</button>
        <button title="Закрыть" aria-label="Закрыть" @click="close">✕</button>
      </div>
      <div ref="gm" class="gm" :class="{ dragging }" :style="{ '--vw': split * 100 + '%' }">
        <div :key="current.id" class="gb rich" v-html="current.b.map(blk).join('')"></div>
        <div class="gsplit" role="separator" aria-orientation="vertical" title="Потяни, чтобы изменить ширину. Двойной щелчок возвращает как было" @pointerdown="splitDown" @pointermove="splitMove" @pointerup="splitUp" @pointercancel="splitUp" @dblclick="splitReset"><i></i></div>
        <aside class="gv">
          <video v-if="video" :key="video" class="gvp" :src="video" controls preload="metadata" @error="broken = video!"></video>
          <div v-else-if="photo && (!current.l || mine)" class="gphw" :class="{ busy: photoBusy }">
            <button type="button" class="gph" title="Открыть фото на весь экран" @click="viewer = photo!"><img :src="photo" :alt="`Фото Юны: ${current.ru}`" draggable="false" @error="photoFailed" /></button>
            <div v-if="photoName" class="gpht">
              <button type="button" :disabled="photoBusy" @click="pickPhoto">{{ photoBusy ? 'Загружается…' : 'Заменить' }}</button>
              <button type="button" class="del" :disabled="photoBusy" @click="dropPhoto">Удалить</button>
            </div>
          </div>
          <div v-else-if="broken" class="gvp stub">
            <span class="play" aria-hidden="true">▶</span>
            <b>{{ current.l ? `Видео · ${current.l}` : 'Видео' }}</b>
            <small>Не проигралось в этом браузере: смотри в Яндекс Браузере или Chrome</small>
          </div>
          <button v-else-if="photoName" type="button" class="gpha" :disabled="photoBusy" @click="pickPhoto">
            <b>{{ photoBusy ? 'Загружается…' : '＋ Загрузить фото' }}</b>
            <small>сразу ляжет на Яндекс.Диск</small>
          </button>
          <p v-if="video && titleOfVideo(video)" class="vt">{{ titleOfVideo(video) }}</p>
          <p v-if="video" class="src">Видео в формате AV1: в Яндекс Браузере, Chrome и Firefox играет, в Safari и на части iPad может не открываться.</p>
          <p v-if="current.l && !mine" class="src">Автор видеоурока: <a :href="CHANNEL" target="_blank" rel="noopener">Учитель Ян · 양쌤의 한국어 교실</a></p>
        </aside>
      </div>
    </div>
    <PhotoViewer :src="viewer" :alt="current.ru" @close="viewer = null" />
    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="onPhotoFile" />
  </div>
</template>

<style>
.study-modal .gph { all: unset; display: block; cursor: zoom-in; }
.study-modal .gph img { display: block; width: 100%; height: auto; border-radius: 14px; box-shadow: 0 8px 24px rgba(110, 90, 190, .18); }
.study-modal .gh .pass.ph { color: #fff; background: var(--pink, #d64da9); border-color: transparent; }

/* управление фото (только владелец): кнопки плавно появляются при наведении на метку «Фото» и на само фото */
.study-modal .phw { position: relative; display: inline-flex; }
.study-modal .phm { position: absolute; top: 100%; left: 0; z-index: 3; display: flex; gap: 6px; padding: 8px; margin-top: 2px; border-radius: 14px;
  background: var(--bg); border: 1px solid var(--line); box-shadow: 0 10px 24px rgba(110, 90, 190, .18);
  opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .2s, transform .2s, visibility .2s; }
.study-modal .phw:hover .phm, .study-modal .phw:focus-within .phm { opacity: 1; visibility: visible; transform: none; }
.study-modal .gh button.pass.del:hover { border-color: var(--bad); color: var(--bad); }
.study-modal .gh button.pass:disabled { opacity: .6; cursor: default; }
.study-modal .gphw { position: relative; }
.study-modal .gphw.busy img { opacity: .5; transition: opacity .2s; }
.study-modal .gpht { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; opacity: 0; transition: opacity .2s; }
.study-modal .gphw:hover .gpht, .study-modal .gphw:focus-within .gpht, .study-modal .gphw.busy .gpht { opacity: 1; }
.study-modal .gpht button { height: 30px; padding: 0 14px; border: 0; border-radius: 999px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  color: #2b2a27; background: rgba(255, 255, 255, .94); box-shadow: 0 4px 14px rgba(40, 38, 34, .25); transition: background .2s, color .2s; }
.study-modal .gpht button:hover { background: var(--pink, #d64da9); color: #fff; }
.study-modal .gpht button.del:hover { background: #d1495b; }
.study-modal .gpht button:disabled { opacity: .7; cursor: default; }
.study-modal .gpha { width: 100%; aspect-ratio: 16 / 9; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
  font: inherit; color: var(--ink); background: transparent; border: 2px dashed var(--line); border-radius: 14px; transition: border-color .2s, color .2s; }
.study-modal .gpha:hover { border-color: var(--pink, #d64da9); color: var(--pink, #d64da9); }
.study-modal .gpha small { font-size: 13px; color: var(--muted); }
.study-modal .gpha:disabled { opacity: .6; cursor: default; }
/* на планшете и телефоне наведения нет: кнопки на фото видны всегда */
@media (hover: none) {
  .study-modal .gpht { opacity: 1; }
}
</style>

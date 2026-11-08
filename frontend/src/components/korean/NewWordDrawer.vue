<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NEW_WORD_MAX, useNewWordsStore, type NewWord, type NewWordInput } from '@/stores/newWords'
import { useToastStore } from '@/stores/toast'
import { askConfirm } from '@/composables/useConfirm'

/** Шторка справа: список записанных слов и одна кнопка «Добавить». По нажатию появляется форма; после «Сохранить» она остаётся пустой для следующего слова. */
const props = defineProps<{ open: boolean; edit: NewWord | null }>()
const emit = defineEmits<{ close: [] }>()

const store = useNewWordsStore()
const toast = useToastStore()
const empty = (): NewWordInput => ({ ko: '', reading: '', ru: '', example: '', note: '' })
const f = ref<NewWordInput>(empty())
const busy = ref(false)
const formShown = ref(false)
/** Блок «Записанные слова» свёрнут, пока не нажать на стрелку */
const listOpen = ref(false)

const tipOpen = ref(false)

/** Временный токен для Claude: создаётся кнопкой, показывается один раз, живёт 10 минут */
const tok = ref<{ token: string; expires: number } | null>(null)
const left = ref(0)
let tick: ReturnType<typeof setInterval> | undefined
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
function clearTok() {
  clearInterval(tick)
  tok.value = null
}
async function makeToken() {
  try {
    tok.value = await store.createToken()
    left.value = tok.value.expires - Date.now()
    clearInterval(tick)
    tick = setInterval(() => {
      left.value = (tok.value?.expires ?? 0) - Date.now()
      if (left.value <= 0) clearTok()
    }, 1000)
  } catch (e) {
    toast.error((e as Error).message)
  }
}
async function copyToken() {
  try {
    await navigator.clipboard.writeText(tok.value?.token ?? '')
    toast.ok('Токен скопирован')
  } catch {
    toast.error('Не удалось скопировать: выдели токен и скопируй вручную')
  }
}
async function revoke() {
  try {
    await store.revokeToken()
    clearTok()
    toast.ok('Токен отозван')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
/** id слова, которое сейчас правится (null: новое) */
const editId = ref<string | null>(null)
const first = ref<HTMLInputElement>()

function showForm(w: NewWord | null = null) {
  if (w) listOpen.value = true // правим запись из списка: список остаётся виден
  editId.value = w?.id ?? null
  f.value = w ? { ko: w.ko, reading: w.reading, ru: w.ru, example: w.example, note: w.note } : empty()
  formShown.value = true
  nextTick(() => first.value?.focus())
}
function hideForm() {
  formShown.value = false
  editId.value = null
}

watch(
  () => [props.open, props.edit] as const,
  ([open, edit]) => {
    if (!open) {
      listOpen.value = false
      clearTok() // токен показывается только пока шторка открыта (сам он работает до конца срока)
      return hideForm()
    }
    if (edit) showForm(edit)
  },
)

async function save() {
  if (busy.value) return
  const v = f.value
  const onlyNote = !v.ko.trim() && !v.ru.trim() && v.note.trim()
  if (!onlyNote && (!v.ko.trim() || !v.ru.trim())) return toast.error('Нужны корейское слово и перевод или хотя бы заметка')
  busy.value = true
  try {
    if (editId.value) {
      await store.update(editId.value, v)
      toast.ok('Слово изменено')
      hideForm()
    } else {
      await store.add(v)
      toast.ok(v.ko.trim() ? `Добавлено: ${v.ko.trim()}` : 'Заметка добавлена')
      showForm() // форма остаётся открытой и пустой: можно сразу писать следующее
    }
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

async function drop(w: NewWord) {
  if (!(await askConfirm({ title: `Удалить «${w.ko || 'заметку'}»?`, ok: 'Удалить', danger: true }))) return
  try {
    await store.remove(w.id)
    if (editId.value === w.id) hideForm()
    toast.ok('Удалено')
  } catch (e) {
    toast.error((e as Error).message)
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) formShown.value ? hideForm() : emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  clearInterval(tick)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="nwd">
      <div v-if="open" class="nwd-back" @click.self="emit('close')">
        <aside class="nwd" role="dialog" aria-label="Новые слова">
          <header>
            <h2>Новые слова <small>{{ store.items.length }}</small></h2>
            <button v-if="!formShown" type="button" class="save add" @click="showForm()">+ Добавить</button>
            <button type="button" class="ghost tokbtn" @click="makeToken">Создать токен</button>
            <span class="tip">
              <button type="button" class="q" aria-label="Что это за токен" @click="tipOpen = !tipOpen" @blur="tipOpen = false">?</button>
              <span class="tipbox" :class="{ show: tipOpen }" role="tooltip">Токен для Claude: по нему он может только читать записанные слова, ничего не меняет. Действует 10 минут, потом перестаёт работать. Новый токен отменяет прежний.</span>
            </span>
            <button type="button" class="x" aria-label="Закрыть" @click="emit('close')">✕</button>
          </header>

          <div v-if="tok" class="tokbox">
            <b>Токен для Claude <small>действует ещё {{ mmss(left) }}, только чтение слов</small></b>
            <code>{{ tok.token }}</code>
            <div class="btns">
              <button type="button" class="save" @click="copyToken">Скопировать</button>
              <button type="button" class="ghost" @click="revoke">Отозвать</button>
            </div>
            <p>Скинь его мне в чат: я прочитаю записанное. После показа он здесь больше не покажется; новый токен отменяет прежний.</p>
          </div>

          <form v-if="formShown" class="form" @submit.prevent="save">
            <h3>{{ editId ? 'Изменить запись' : 'Новое слово' }}</h3>
            <div class="two">
              <label>Корейский
                <input ref="first" v-model="f.ko" :maxlength="NEW_WORD_MAX.ko" lang="ko" placeholder="기다리다" autocomplete="off" />
              </label>
              <label>Чтение
                <input v-model="f.reading" :maxlength="NEW_WORD_MAX.reading" placeholder="кидарида" autocomplete="off" />
              </label>
            </div>
            <label>Перевод
              <input v-model="f.ru" :maxlength="NEW_WORD_MAX.ru" placeholder="ждать" autocomplete="off" />
            </label>
            <label>Предложение
              <textarea v-model="f.example" :maxlength="NEW_WORD_MAX.example" rows="2" lang="ko" placeholder="저는 카페에서 친구를 기다려요."></textarea>
            </label>
            <label>Заметка <small>любой текст: что нашёл, что заметил, вопрос. Я прочитаю, проверю и отвечу, важное разберём вместе. Можно без слова, только заметка.</small>
              <textarea v-model="f.note" :maxlength="NEW_WORD_MAX.note" rows="6" placeholder="Например: услышал в сериале, так говорят, когда… Это правда?"></textarea>
            </label>
            <div class="btns">
              <button class="save" type="submit" :disabled="busy">{{ editId ? 'Сохранить' : 'Сохранить и добавить ещё' }}</button>
              <button class="ghost" type="button" @click="hideForm">{{ editId ? 'Отмена' : 'Готово' }}</button>
            </div>
          </form>

          <section class="acc" :class="{ open: listOpen }">
            <button type="button" class="acc-head" :aria-expanded="listOpen" @click="listOpen = !listOpen">
              <span>Записанные слова <small>{{ store.items.length }}</small></span>
              <i aria-hidden="true">▾</i>
            </button>
            <div class="acc-body">
              <div class="acc-in">
          <ul v-if="store.items.length" class="list">
            <li v-for="w in store.items" :key="w.id" :class="{ cur: w.id === editId }">
              <div class="ln">
                <b lang="ko">{{ w.ko || 'Заметка' }}</b>
                <span v-if="w.reading" class="rd">{{ w.reading }}</span>
                <span v-if="w.ru">{{ w.ru }}</span>
                <span class="acts">
                  <button type="button" @click="showForm(w)">изменить</button>
                  <button type="button" @click="drop(w)">удалить</button>
                </span>
              </div>
              <p v-if="w.example" class="ex" lang="ko">{{ w.example }}</p>
              <p v-if="w.note" class="nt">{{ w.note }}</p>
            </li>
          </ul>
          <p v-else class="empty">Пока пусто. Нажми «Добавить слово» и запиши первое.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.nwd-back { position: fixed; inset: 0; z-index: 200; background: rgba(32, 38, 92, .45); backdrop-filter: blur(8px); display: flex; justify-content: flex-end; }
.nwd { width: min(max(70vw, 565px), 97vw); height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; padding: 26px clamp(18px, 3vw, 36px) 30px; color: #20265c; border-left: 1px solid #fff; background: linear-gradient(160deg, #fbeefc, #eaedff 60%, #fff3f8); box-shadow: -20px 0 50px rgba(100, 87, 170, .2); font-family: 'Archivo', 'Noto Sans KR', sans-serif; font-size: 15px; scrollbar-width: thin; }
.nwd > * { flex: none; }
.nwd header { display: flex; align-items: center; gap: 12px; }
.nwd h2 { margin: 0; font-size: 26px; font-weight: 700; line-height: 1; }
.nwd h2 small { margin-left: 8px; font-size: 14px; color: #8f7cf0; font-weight: 600; }
.nwd h3 { margin: 0; font-size: 18px; }
.nwd .x { flex: none; margin-left: auto; width: 36px; height: 36px; border: 1px solid #fff; border-radius: 50%; background: rgba(255, 255, 255, .8); color: #20265c; font: inherit; font-size: 16px; cursor: pointer; transition: .2s; }
.nwd .x:hover { background: #fff; color: #d64da9; }
.nwd .form { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 18px; background: rgba(255, 255, 255, .6); border: 1px solid #fff; animation: nwd-in .25s ease; }
@keyframes nwd-in { from { opacity: 0; transform: translateY(-8px); } }
.nwd .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.nwd label { display: flex; flex-direction: column; gap: 6px; font-weight: 600; font-size: 14px; }
.nwd label small { font-weight: 400; color: #6c70a8; line-height: 1.35; }
.nwd input, .nwd textarea { font: inherit; font-weight: 500; padding: 11px 14px; border: 1px solid #fff; border-radius: 14px; background: rgba(255, 255, 255, .9); color: #20265c; resize: vertical; transition: border-color .2s; min-width: 0; }
.nwd input:focus, .nwd textarea:focus { outline: none; border-color: #d64da9; }
.nwd .btns { display: flex; gap: 10px; }
.nwd .save { flex: 1; padding: 13px; border: 0; border-radius: 99px; background: linear-gradient(100deg, #e86bc0, #d64da9); color: #fff; font: inherit; font-weight: 700; cursor: pointer; transition: filter .2s; }
.nwd .save.add { flex: none; padding: 8px 18px; font-size: 14px; }
.nwd .save:hover { filter: brightness(1.06); }
.nwd .save:disabled { opacity: .6; cursor: default; }
.nwd .ghost { padding: 13px 22px; border: 1px solid #fff; border-radius: 99px; background: rgba(255, 255, 255, .8); color: #6c70a8; font: inherit; font-weight: 600; cursor: pointer; }
.nwd .ghost:hover { color: #d64da9; }
.nwd .tip { position: relative; display: inline-flex; }
.nwd .q { width: 28px; height: 28px; border: 1px solid #fff; border-radius: 50%; background: rgba(255, 255, 255, .8); color: #8f7cf0; font: inherit; font-size: 14px; font-weight: 700; cursor: help; transition: .2s; }
.nwd .q:hover, .nwd .q:focus-visible { background: #fff; color: #d64da9; outline: none; }
.nwd .tipbox { position: absolute; top: calc(100% + 8px); left: 50%; z-index: 2; width: 260px; padding: 10px 12px; border-radius: 14px; background: #fff; color: #20265c; font-size: 13px; font-weight: 500; line-height: 1.4; box-shadow: 0 10px 30px rgba(100, 87, 170, .25); opacity: 0; transform: translate(-50%, -4px); pointer-events: none; transition: opacity .2s, transform .2s; }
.nwd .tip:hover .tipbox, .nwd .tipbox.show { opacity: 1; transform: translate(-50%, 0); }
.nwd .tokbtn { padding: 8px 16px; font-size: 14px; }
.nwd .tokbox { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; border-radius: 18px; background: rgba(255, 255, 255, .75); border: 1px dashed #d64da9; animation: nwd-in .25s ease; }
.nwd .tokbox small { font-weight: 400; color: #6c70a8; margin-left: 6px; }
.nwd .tokbox code { display: block; padding: 10px 12px; border-radius: 12px; background: #fff; font-size: 13px; word-break: break-all; user-select: all; }
.nwd .tokbox p { margin: 0; font-size: 13px; color: #6c70a8; }
.nwd .acc { border-radius: 18px; background: rgba(255, 255, 255, .6); border: 1px solid #fff; }
.nwd .acc-head { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border: 0; background: none; color: #20265c; font: inherit; font-size: 18px; font-weight: 700; cursor: pointer; }
.nwd .acc-head small { margin-left: 6px; font-size: 14px; color: #8f7cf0; }
.nwd .acc-head i { font-style: normal; color: #d64da9; transition: transform .25s; }
.nwd .acc.open .acc-head i { transform: rotate(180deg); }
.nwd .acc-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s ease; }
.nwd .acc.open .acc-body { grid-template-rows: 1fr; }
.nwd .acc-in { overflow: hidden; min-height: 0; padding: 0 14px; }
.nwd .acc.open .acc-in { padding-bottom: 14px; }
.nwd .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.nwd .list li { padding: 12px 14px; border-radius: 14px; background: rgba(255, 255, 255, .7); border: 1px solid transparent; }
.nwd .list li.cur { border-color: #d64da9; }
.nwd .ln { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.nwd .ln b { font-size: 18px; }
.nwd .rd { color: #6c70a8; }
.nwd .acts { margin-left: auto; display: flex; gap: 10px; }
.nwd .acts button { border: 0; background: none; color: #d64da9; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: underline dotted; }
.nwd .ex { margin: 6px 0 0; color: #6c70a8; }
.nwd .nt { margin: 8px 0 0; padding: 8px 12px; border-left: 3px solid #d64da9; border-radius: 0 10px 10px 0; background: rgba(255, 255, 255, .6); white-space: pre-wrap; font-size: 14px; }
.nwd .empty { margin: 0; color: #6c70a8; }
.nwd-enter-active, .nwd-leave-active { transition: opacity .25s; }
.nwd-enter-active .nwd, .nwd-leave-active .nwd { transition: transform .3s ease; }
.nwd-enter-from, .nwd-leave-to { opacity: 0; }
.nwd-enter-from .nwd, .nwd-leave-to .nwd { transform: translateX(100%); }
@media (max-width: 700px) { .nwd .two { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .nwd .acc-body, .nwd .acc-head i, .nwd-enter-active, .nwd-leave-active, .nwd-enter-active .nwd, .nwd-leave-active .nwd, .nwd .form { transition: none; animation: none; } }
</style>

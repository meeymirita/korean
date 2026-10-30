<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Avatar from '@/components/Avatar.vue'
import GuestAccess from '@/components/cabinet/GuestAccess.vue'
import TwoFaBlock from '@/components/cabinet/TwoFaBlock.vue'
import { GOAL_OPTIONS } from '@/data/levels'
import { CATN } from '@/data/korean/words'
import { askConfirm, askTokenDo } from '@/composables/useConfirm'
import { usePublicCard } from '@/composables/usePublicCard'
import { useToastStore } from '@/stores/toast'
import { useImagesStore } from '@/stores/images'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const profile = computed(() => progress.data.profile)
const settings = computed(() => progress.data.settings)
const message = ref('')
const toast = useToastStore()
/** Любое сообщение настроек дублируется плашкой; ошибки (нужна, не получилось, не файл) показываются красным. */
watch(message, m => (/^(Нужна|Не получилось|Не удалось)|не файл|слишком|не хватает|неверный|нет доступа|ошибка/.test(m) ? toast.error(m) : m && toast.ok(m)))

/* ---------- профиль ---------- */
/** Своя картинка: обрезаем по центру до 96×96, чтобы она занимала несколько КБ. */
async function upload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
    message.value = 'Нужна картинка размером до 8 МБ.'
    return
  }
  try {
    const bmp = await createImageBitmap(file)
    const size = Math.min(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 96
    canvas.getContext('2d')!.drawImage(bmp, (bmp.width - size) / 2, (bmp.height - size) / 2, size, size, 0, 0, 96, 96)
    progress.setProfile({ avatar: canvas.toDataURL('image/jpeg', 0.85) })
    message.value = 'Картинка сохранена.'
  } catch {
    message.value = 'Не получилось открыть картинку.'
  }
}

const DEFAULT_AVATAR = '🌸'
const hasPhoto = computed(() => profile.value.avatar.startsWith('data:image/'))
const images = useImagesStore()
const coverBusy = ref(false)
/** Обложка кабинета: картинка загружается в раздел «Картинки» (там её видно и можно удалить), в профиле хранится её id. */
async function uploadCover(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || coverBusy.value) return
  coverBusy.value = true
  try {
    if (!images.loaded) await images.load()
    const problem = images.check(file)
    if (problem) {
      message.value = problem
      return
    }
    const item = await images.upload(file, 'Обложка кабинета', 'cover')
    progress.setProfile({ cover: item.id })
    message.value = 'Обложка сохранена.'
  } catch (err) {
    message.value = (err as Error).message
  } finally {
    coverBusy.value = false
  }
}

/* ---------- темы ---------- */
const topicOn = (id: string) => settings.value.cats.length === 0 || settings.value.cats.includes(id)
function toggleTopic(id: string) {
  const all = Object.keys(CATN)
  const cur = settings.value.cats.length ? [...settings.value.cats] : [...all]
  const next = cur.includes(id) ? cur.filter(c => c !== id) : [...cur, id]
  if (!next.length) return
  progress.setSettings({ cats: next.length === all.length ? [] : next })
}

const GAME_GROUPS: [string, string][] = [
  ['v', 'Глаголы'], ['a', 'Прилагательные'], ['q', 'Вопросительные'], ['p', 'Местоимения'],
  ['d', 'Наречия и время'], ['n', 'Числа и счёт'], ['l', 'Над / под / рядом'], ['s', 'Существительные'],
]
const GAME_DEFAULT: Record<string, number> = { v: 1, a: 1, q: 1, p: 1, d: 1, n: 1, l: 1, s: 0 }
const gameCats = computed(() => ({ ...GAME_DEFAULT, ...(settings.value.gameCats ?? {}) }))
function toggleGame(id: string) {
  const next = { ...gameCats.value, [id]: gameCats.value[id] ? 0 : 1 }
  if (!Object.values(next).some(Boolean)) return
  progress.setSettings({ gameCats: next })
}

/* ---------- сервер, копия, сброс ---------- */
const tokenInput = ref('')
const syncText = computed(
  () => ({ off: 'не подключён', idle: 'ожидание', syncing: 'синхронизация…', ok: 'подключён', error: 'ошибка' })[progress.sync],
)

function download() {
  const blob = new Blob([progress.exportJson()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `progress-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
async function restore(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const text = await file.text()
  // загрузка копии заменяет все данные: на сервере нужен повторный ввод токена (ошибка показывается в окне)
  if (progress.needsConfirm()) {
    let ok = false
    const done = await askTokenDo(
      { title: 'Загрузить копию?', text: 'Весь прогресс заменится данными из файла. Введите токен, чтобы подтвердить.', ok: 'Загрузить' },
      async token => {
        ok = await progress.importJson(text, token)
      },
    )
    if (done) message.value = ok ? 'Копия загружена.' : 'Не получилось: это не файл прогресса.'
    return
  }
  message.value = (await progress.importJson(text)) ? 'Копия загружена.' : 'Не получилось: это не файл прогресса.'
}
async function reset() {
  const text = 'Уровень, очки, серия дней, выученные слова, время занятий и история обнулятся. Профиль и настройки останутся. Это нельзя отменить.'
  if (progress.needsConfirm()) {
    // с сервером сброс защищён: токен вводится ещё раз, проверяет его сам сервер, ошибка остаётся в окне
    const done = await askTokenDo({ title: 'Сбросить весь прогресс?', text: text + ' Введите токен, чтобы подтвердить.', ok: 'Сбросить' }, token => progress.reset(token))
    if (done) message.value = 'Прогресс сброшен.'
    return
  }
  if (!(await askConfirm({ title: 'Сбросить весь прогресс?', text, ok: 'Сбросить', danger: true }))) return
  await progress.reset()
  message.value = 'Прогресс сброшен.'
}
async function reconnect() {
  if (tokenInput.value.trim()) {
    await progress.connect(tokenInput.value)
    tokenInput.value = ''
  }
}

/* ---------- публичная визитка ---------- */
const pub = usePublicCard()
const pubCover = ref(false)
onMounted(async () => {
  if (!progress.unlocked || progress.isGuest) return
  try {
    await pub.load()
    pubCover.value = !!pub.settings.value?.cover
    if (pub.settings.value?.enabled) await pub.save(true, pubCover.value) // данные визитки обновляются при заходе в настройки
  } catch {
    /* сервер недоступен: блок останется неактивным */
  }
})
async function togglePublic() {
  const on = !pub.settings.value?.enabled
  try {
    await pub.save(on, pubCover.value)
    toast.ok(on ? 'Визитка включена: /me открыта всем' : 'Визитка выключена: /me закрыта')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
async function refreshPublic() {
  try {
    await pub.save(true, pubCover.value)
    toast.ok('Данные визитки обновлены')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
</script>

<template>
  <div class="cb-body">
    <div class="st-block">
      <h3>Профиль</h3>
      <div class="st-cols" :class="{ one: progress.isGuest }">
        <div class="st-col">
          <p>Имя и картинка показываются на главной и в боковом меню.</p>
          <div class="st-name">
            <Avatar :avatar="profile.avatar" :size="56" />
            <input :value="profile.name" maxlength="24" placeholder="Как тебя называть?" aria-label="Имя" @input="progress.setProfile({ name: ($event.target as HTMLInputElement).value })" />
          </div>
          <div class="st-avatars">
            <label class="st-up">⬆ Своя картинка<input type="file" accept="image/*" @change="upload" /></label>
            <button v-if="hasPhoto" class="st-up" type="button" @click="progress.setProfile({ avatar: DEFAULT_AVATAR })">Убрать картинку</button>
          </div>
        </div>
        <div v-if="!progress.isGuest" class="st-col">
          <p>Обложка в шапке кабинета.</p>
          <div class="st-avatars">
            <label class="st-up">{{ coverBusy ? 'Загружаю…' : '🖼 Загрузить обложку' }}<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" :disabled="coverBusy" @change="uploadCover" /></label>
            <button v-if="profile.cover" class="st-up" type="button" @click="progress.setProfile({ cover: '' })">Убрать обложку</button>
          </div>
        </div>
      </div>
    </div>

    <div class="st-block">
      <h3>Цель дня</h3>
      <p>Сколько верных ответов в день считать выполненной целью.</p>
      <div class="st-goals">
        <button v-for="g in GOAL_OPTIONS" :key="g" class="chip" :class="{ on: settings.goal === g }" @click="(progress.setSettings({ goal: g }), toast.ok(`Цель дня: ${g}`))">{{ g }}</button>
      </div>
    </div>

    <div class="st-block">
      <h3>Темы слов в «Сегодня»</h3>
      <p>Слова дня и задания берутся только из выбранных тем. Выбраны все: значит, без ограничений.</p>
      <div class="st-chips">
        <button v-for="(name, id) in CATN" :key="id" class="chip" :class="{ on: topicOn(id) }" @click="toggleTopic(id)">{{ name }}</button>
      </div>
    </div>

    <div class="st-block">
      <h3>Группы слов в игре</h3>
      <p>Из каких групп игра «Хлебушек» задаёт вопросы. Изменения применятся при следующем открытии игры.</p>
      <div class="st-chips">
        <button v-for="[id, name] in GAME_GROUPS" :key="id" class="chip" :class="{ on: gameCats[id] }" @click="toggleGame(id)">{{ name }}</button>
      </div>
    </div>

    <div v-if="!progress.isGuest" class="st-block">
      <h3>Где хранится прогресс</h3>
      <p>Прогресс хранится в браузере и сохраняется на сервере сайта. Токен нужен на каждом устройстве один раз.</p>
      <div class="pg-status" :class="progress.sync" style="margin-top: 12px">
        Сервер: <b>{{ syncText }}</b><span v-if="progress.syncMessage"> · {{ progress.syncMessage }}</span>
      </div>
      <div class="pg-btns">
        <button @click="progress.push()">Сохранить сейчас</button>
        <button class="plain" @click="progress.disconnect()">Выйти (закрыть кабинет на этом устройстве)</button>
      </div>
      <form class="pg-form" @submit.prevent="reconnect">
        <input v-model="tokenInput" type="password" placeholder="сменить токен" autocomplete="off" />
        <button type="submit">Подключить</button>
      </form>
      <div class="pg-btns">
        <button class="plain" @click="download">⬇ Скачать копию</button>
        <label class="pg-file plain">⬆ Загрузить копию<input type="file" accept="application/json,.json" @change="restore" /></label>
        <button class="plain danger" @click="reset">Сбросить прогресс</button>
      </div>
    </div>
    <div v-if="progress.unlocked && !progress.isGuest" class="st-block">
      <h3>Публичная визитка</h3>
      <p>Страница <b>/me</b> со счётчиком дней, серией, выученными словами и уровнем. По умолчанию закрыта: ссылка работает, только пока включено.</p>
      <div class="pg-btns">
        <button :disabled="pub.busy.value || !pub.settings.value" @click="togglePublic">{{ pub.settings.value?.enabled ? 'Выключить визитку' : 'Включить визитку' }}</button>
        <template v-if="pub.settings.value?.enabled">
          <button class="plain" :disabled="pub.busy.value" @click="refreshPublic">↻ Обновить данные</button>
          <a class="plain pub-link" href="/me" target="_blank" rel="noopener">Открыть /me ↗</a>
        </template>
      </div>
      <label v-if="profile.cover" class="pub-opt"><input v-model="pubCover" type="checkbox" :disabled="pub.busy.value" @change="pub.settings.value?.enabled && refreshPublic()" /> показывать обложку кабинета (она станет доступна всем по ссылке, остальные картинки остаются закрытыми)</label>
      <p class="st-sub">Наружу уходит только: имя, значок, уровень, серия, число выученных слов, ответов и дней в пути. Данные обновляются кнопкой.</p>
    </div>
    <TwoFaBlock v-if="progress.unlocked && !progress.isGuest" />
    <GuestAccess v-if="progress.unlocked && !progress.isGuest" />
    <div v-if="progress.isGuest" class="st-block">
      <h3>Гостевой режим</h3>
      <p>Вы вошли по временному токену: всё работает, но прогресс нигде не сохраняется и пропадёт, когда вы закроете страницу.</p>
    </div>
    <p v-if="message" class="pg-note">{{ message }}</p>
  </div>
</template>

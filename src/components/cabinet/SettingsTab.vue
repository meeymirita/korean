<script setup lang="ts">
import { computed, ref } from 'vue'
import Avatar from '@/components/Avatar.vue'
import { GOAL_OPTIONS } from '@/data/levels'
import { CATN } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const profile = computed(() => progress.data.profile)
const settings = computed(() => progress.data.settings)
const message = ref('')

/* ---------- профиль ---------- */
const AVATARS = ['🌸', '✨', '🔮', '📖', '🌙', '⭐', '🍞', '🧝', '🦊', '🐉', '🌿', '☕']

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
  message.value = progress.importJson(await file.text()) ? 'Копия загружена.' : 'Не получилось: это не файл прогресса.'
}
function reset() {
  if (confirm('Сбросить уровень, очки, серию дней, выученные слова и историю? Профиль и настройки останутся. Это нельзя отменить.')) {
    progress.reset()
    message.value = 'Прогресс сброшен.'
  }
}
async function reconnect() {
  if (tokenInput.value.trim()) {
    await progress.connect(tokenInput.value)
    tokenInput.value = ''
  }
}
</script>

<template>
  <div class="cb-body">
    <div class="st-block">
      <h3>Профиль</h3>
      <p>Имя и картинка показываются на главной и в боковом меню.</p>
      <div class="st-name">
        <Avatar :avatar="profile.avatar" :size="56" />
        <input :value="profile.name" maxlength="24" placeholder="Как тебя называть?" aria-label="Имя" @input="progress.setProfile({ name: ($event.target as HTMLInputElement).value })" />
      </div>
      <div class="st-avatars">
        <button v-for="a in AVATARS" :key="a" class="st-av" :class="{ on: profile.avatar === a }" :aria-label="`Картинка ${a}`" @click="progress.setProfile({ avatar: a })">
          <Avatar :avatar="a" :size="40" />
        </button>
        <label class="st-up">⬆ Своя картинка<input type="file" accept="image/*" @change="upload" /></label>
      </div>
    </div>

    <div class="st-block">
      <h3>Цель дня</h3>
      <p>Сколько верных ответов в день считать выполненной целью.</p>
      <div class="st-goals">
        <button v-for="g in GOAL_OPTIONS" :key="g" class="chip" :class="{ on: settings.goal === g }" @click="progress.setSettings({ goal: g })">{{ g }}</button>
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

    <div class="st-block">
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
    <p v-if="message" class="pg-note">{{ message }}</p>
  </div>
</template>

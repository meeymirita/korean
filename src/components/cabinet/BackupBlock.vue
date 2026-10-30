<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

interface ArchiveLast {
  ok: boolean
  time: number
  sizeKb: number
  disk: 'ok' | 'off' | 'fail'
  mail: 'ok' | 'off' | 'fail' | 'big'
  parts: number
  message: string
}
interface Archive {
  steps: string[]
  job: { running: boolean; step: number; percent: number }
  last: ArchiveLast | null
  targets: { disk: boolean; mail: boolean; passphrase: boolean }
  problems: string[]
}
interface Status {
  archive?: Archive
  configured: boolean
  ok?: boolean
  time?: number
  sizeKb?: number
  offsite?: boolean
  message?: string
}

const progress = useProgressStore()
const toast = useToastStore()
const status = ref<Status | null>(null)
const failed = ref(false)
const starting = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  const was = status.value?.archive?.job.running
  try {
    const res = await fetchT('/api/backup/status', { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(String(res.status))
    status.value = (await res.json()) as Status
  } catch {
    failed.value = true
    return
  }
  const a = status.value.archive
  if (a?.job.running && !timer) timer = setInterval(load, 1000)
  if (!a?.job.running && timer) {
    clearInterval(timer)
    timer = undefined
    if (was && a?.last) announce(a.last)
  }
}
onMounted(load)
onBeforeUnmount(() => clearInterval(timer))

/** Итог плашкой: куда ушёл архив или что пошло не так. */
function announce(l: ArchiveLast) {
  const where = [l.disk === 'ok' ? 'на Яндекс Диск' : '', l.mail === 'ok' ? (l.parts > 1 ? `на почту (${l.parts} письма)` : 'на почту') : ''].filter(Boolean).join(' и ')
  if (l.ok) toast.ok(`Архив ${(l.sizeKb / 1024).toFixed(1)} МБ отправлен ${where}.${l.message ? ' ' + l.message : ''}`)
  else toast.error(l.message || 'Архив не удалось отправить.')
}

async function run() {
  starting.value = true
  try {
    const res = await fetchT('/api/backup/run', { method: 'POST', headers: { Authorization: `Bearer ${progress.bearer}` } })
    const r = (await res.json().catch(() => ({}))) as { started?: boolean; message?: string }
    if (!res.ok) throw new Error(`сервер ответил ${res.status}`)
    if (!r.started && r.message) toast.error(r.message)
    await load()
  } catch (e) {
    toast.error('Не получилось запустить архив: ' + (e as Error).message)
  } finally {
    starting.value = false
  }
}
const checking = ref(false)
/** Проверка каналов: на Диск ложится «проверка.txt», на почту идёт короткое письмо. */
async function check() {
  checking.value = true
  try {
    const res = await fetchT('/api/backup/test', { method: 'POST', headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`сервер ответил ${res.status}`)
    const r = (await res.json()) as { disk: string; mail: string; message: string }
    const ok = [r.disk === 'ok' ? 'Яндекс Диск (файл «проверка.txt» в папке)' : '', r.mail === 'ok' ? 'почта (проверьте ящик)' : ''].filter(Boolean)
    if (ok.length && !r.message) toast.ok('Отправлено: ' + ok.join(' и ') + '.')
    else if (ok.length) toast.error(`Отправлено: ${ok.join(' и ')}. Но: ${r.message}`)
    else toast.error(r.message || 'Не получилось отправить.')
  } catch (e) {
    toast.error('Не получилось проверить: ' + (e as Error).message)
  } finally {
    checking.value = false
  }
}
const job = computed(() => status.value?.archive?.job)
const lastArc = computed(() => status.value?.archive?.last ?? null)
const arcWhen = computed(() => (lastArc.value ? new Date(lastArc.value.time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''))

/** Копия старше 30 часов считается просроченной: скрипт должен запускаться раз в сутки. */
const STALE = 30 * 3600_000
const age = computed(() => (status.value?.time ? Date.now() - status.value.time : Infinity))
const state = computed<'none' | 'ok' | 'stale' | 'bad'>(() => {
  const s = status.value
  if (!s?.configured) return 'none'
  if (!s.ok) return 'bad'
  return age.value > STALE ? 'stale' : 'ok'
})
const when = computed(() => (status.value?.time ? new Date(status.value.time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''))
const ago = computed(() => {
  const h = Math.floor(age.value / 3600_000)
  return h < 1 ? 'меньше часа назад' : h < 48 ? `${h} ч назад` : `${Math.floor(h / 24)} дн. назад`
})
const size = computed(() => ((status.value?.sizeKb ?? 0) / 1024).toFixed(1))
</script>

<template>
  <div v-if="!failed && status" class="st-block">
    <h3>Резервные копии</h3>
    <div v-if="status.archive" class="bk-arc">
      <p class="st-sub">Полный архив (база, картинки, файлы календаря, настройки) шифруется вашим паролем и отправляется
        {{ [status.archive.targets.disk ? 'на Яндекс Диск' : '', status.archive.targets.mail ? 'на почту' : ''].filter(Boolean).join(' и ') || 'никуда (не настроено)' }}.
        Сам раз в неделю, а здесь можно запустить в любой день.</p>
      <ul v-if="status.archive.problems.length" class="bk-prob"><li v-for="p in status.archive.problems" :key="p">⚠ {{ p }}</li></ul>
      <button type="button" class="plain" :disabled="starting || job?.running || !!status.archive.problems.length" @click="run">{{ job?.running ? 'Идёт…' : 'Сделать архив и отправить' }}</button>
      <button type="button" class="plain" :disabled="checking || job?.running" @click="check">{{ checking ? 'Проверяю…' : 'Проверить отправку' }}</button>
      <div v-if="job?.running" class="bk-prog" role="progressbar" :aria-valuenow="job.percent" aria-valuemin="0" aria-valuemax="100">
        <div class="bk-bar"><i :style="{ width: job.percent + '%' }"></i></div>
        <ol class="bk-steps">
          <li v-for="(t, i) in status.archive.steps" :key="t" :class="{ done: i < job.step, now: i === job.step }">{{ t }}</li>
        </ol>
        <small>{{ job.percent }}%</small>
      </div>
      <p v-else-if="lastArc?.ok" class="bk-ok">✓ Последний архив: {{ arcWhen }}, {{ (lastArc.sizeKb / 1024).toFixed(1) }} МБ.
        {{ lastArc.disk === 'ok' ? 'Диск ✓' : lastArc.disk === 'fail' ? 'Диск ✗' : '' }}
        {{ lastArc.mail === 'ok' ? `Почта ✓${lastArc.parts > 1 ? ' (' + lastArc.parts + ' письма)' : ''}` : lastArc.mail === 'fail' ? 'Почта ✗' : lastArc.mail === 'big' ? 'Почта: архив слишком большой, письмо без вложения' : '' }}
        <span v-if="lastArc.message" class="bk-warn"> {{ lastArc.message }}</span></p>
      <p v-else-if="lastArc" class="bk-bad">✗ Последний архив {{ arcWhen }} не удался: {{ lastArc.message }}</p>
    </div>
    <h4 class="bk-sub">Ночная копия на сервере</h4>
    <p v-if="state === 'ok'" class="bk-ok">✓ Последняя копия: {{ when }} ({{ ago }}), {{ size }} МБ. {{ status.offsite ? 'Копия ушла и за пределы сервера.' : 'Копия лежит только на этом сервере.' }}</p>
    <p v-else-if="state === 'stale'" class="bk-warn">⚠ Последняя копия сделана {{ when }} ({{ ago }}). Скрипт должен запускаться раз в сутки: проверьте расписание на сервере.</p>
    <p v-else-if="state === 'bad'" class="bk-bad">✗ Последняя копия не удалась{{ status.message ? ': ' + status.message : '' }}. Посмотрите вывод скрипта на сервере (docs/backup.md).</p>
    <p v-else class="bk-warn">⚠ Копии пока не настроены: скрипт scripts/backup.sh на сервере ещё ни разу не запускался. Инструкция в docs/backup.md.</p>
    <p v-if="state === 'ok' && !status.offsite" class="st-sub">Если сервер или диск пропадут, копия пропадёт вместе с ними. Настройте отправку за пределы сервера (OFFSITE_RSYNC или OFFSITE_RCLONE, см. docs/backup.md).</p>
    <p class="st-sub">Кроме того, сервер сам раз в сутки делает копию базы в server/data/backups (последние 30).</p>
  </div>
</template>

<style>
.study .bk-arc button { justify-self: start; }
.study .bk-arc { display: grid; gap: 10px; justify-items: start; margin-bottom: 14px; }
.study .bk-sub { margin: 4px 0 0; font-size: 14px; }
.study .bk-prob { margin: 0; padding-left: 18px; color: #b27300; font-weight: 600; }
.study .bk-prog { width: min(420px, 100%); display: grid; gap: 6px; }
.study .bk-bar { height: 8px; overflow: hidden; background: rgba(111, 105, 190, .15); border-radius: 99px; }
.study .bk-bar i { display: block; height: 100%; background: linear-gradient(90deg, #8f7cf0, #d64da9); border-radius: 99px; transition: width .4s; }
.study .bk-steps { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; padding: 0; list-style: none; font-size: 13px; color: var(--muted, #6c70a8); }
.study .bk-steps .done { color: var(--ok, #3d8b5f); }
.study .bk-steps .done::before { content: '✓ '; }
.study .bk-steps .now { font-weight: 700; color: inherit; }
.study .bk-ok { color: var(--ok, #3d8b5f); font-weight: 600; }
.study .bk-warn { color: #b27300; font-weight: 600; }
.study .bk-bad { color: #b44634; font-weight: 600; }
</style>

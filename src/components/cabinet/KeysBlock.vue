<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { SHORTCUT_ITEMS } from '@/data/shortcuts'
import { RESERVED_KEYS, comboFromEvent, comboLabel, isMac } from '@/lib/shortcuts'
import { askConfirm } from '@/composables/useConfirm'
import { useShortcutsStore } from '@/stores/shortcuts'
import { useToastStore } from '@/stores/toast'

const store = useShortcutsStore()
const toast = useToastStore()
const mac = isMac()
const groups = [
  { title: 'Меню', items: SHORTCUT_ITEMS.filter(i => i.group === 'menu') },
  { title: 'Вкладки кабинета', items: SHORTCUT_ITEMS.filter(i => i.group === 'cabinet') },
]
const label = (id: string) => (store.bindings[id] ? comboLabel(store.bindings[id]!, mac) : '')

/** Пункт, которому сейчас записывается сочетание. */
const recording = ref<string | null>(null)
const hint = ref('')

function onKey(e: KeyboardEvent) {
  const id = recording.value
  if (!id) return
  // запись перехватывает всё: поиск, меню и браузерные действия не должны сработать
  e.preventDefault()
  e.stopImmediatePropagation()
  if (e.key === 'Escape') return stop()
  const combo = comboFromEvent(e)
  if (!combo) {
    if (!/^(Control|Meta|Alt|Shift)$/.test(e.key)) hint.value = 'Нужно ⌘/Ctrl и ещё одна клавиша.'
    return
  }
  const err = store.set(id, combo)
  if (err) {
    hint.value = err
    toast.error(err)
    return
  }
  toast.ok(`Назначено: ${comboLabel(combo, mac)}`)
  stop()
}
function start(id: string) {
  stop()
  recording.value = id
  hint.value = ''
  store.capturing = true
  window.addEventListener('keydown', onKey, true)
}
function stop() {
  recording.value = null
  store.capturing = false
  window.removeEventListener('keydown', onKey, true)
}
onBeforeUnmount(stop)

async function resetAll() {
  if (!(await askConfirm({ title: 'Сбросить все сочетания?', text: 'Сочетания пунктов меню и вкладок кабинета будут убраны.', ok: 'Сбросить', danger: true }))) return
  store.reset()
  toast.ok('Сочетания сброшены')
}
</script>

<template>
  <div class="st-block kb-block">
    <h3>Клавиши</h3>
    <p>
      Назначь сочетание ⌘/Ctrl + клавиша на любой пункт меню или вкладку кабинета: оно откроет её откуда угодно в разделе, а рядом с пунктом появится подсказка.
      Сочетания хранятся на этом устройстве.
    </p>

    <div v-for="g in groups" :key="g.title" class="kb-group">
      <h4>{{ g.title }}</h4>
      <ul class="kb-list">
        <li v-for="it in g.items" :key="it.id" :class="{ rec: recording === it.id }">
          <span class="kb-name">{{ it.label }}</span>
          <kbd v-if="label(it.id) && recording !== it.id" class="kb-combo">{{ label(it.id) }}</kbd>
          <span v-else-if="recording === it.id" class="kb-wait">Нажми сочетание… <small>Esc — отмена</small></span>
          <span v-else class="kb-none">не назначено</span>
          <span class="kb-acts">
            <button type="button" class="plain" @click="recording === it.id ? stop() : start(it.id)">{{ recording === it.id ? 'Отмена' : label(it.id) ? 'Изменить' : 'Назначить' }}</button>
            <button v-if="label(it.id) && recording !== it.id" type="button" class="plain" @click="store.clear(it.id)">Убрать</button>
          </span>
        </li>
      </ul>
    </div>
    <p v-if="hint" class="kb-hint" role="status">{{ hint }}</p>

    <div class="kb-group">
      <h4>🔒 Занято сайтом (не менять)</h4>
      <ul class="kb-list locked">
        <li v-for="r in RESERVED_KEYS" :key="r.keys">
          <span class="kb-name">{{ r.what }}</span>
          <kbd class="kb-combo">{{ r.keys }}</kbd>
        </li>
      </ul>
    </div>

    <div class="kb-foot">
      <button type="button" class="plain" @click="resetAll">Сбросить все</button>
    </div>
  </div>
</template>

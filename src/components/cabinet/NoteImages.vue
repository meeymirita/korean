<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useImagesStore } from '@/stores/images'

const props = defineProps<{ ids: string[]; removable?: boolean; big?: boolean }>()
const emit = defineEmits<{ remove: [id: string] }>()

const store = useImagesStore()
const urls = ref<Record<string, string>>({})
const viewer = ref('')

/** Миниатюры подгружаются с токеном; пока не пришли, стоит заглушка. */
async function show(id: string) {
  if (urls.value[id]) return
  try {
    urls.value[id] = await store.blobUrl(id, 'thumb')
  } catch {
    urls.value[id] = ''
  }
}
watch(() => props.ids, ids => ids.forEach(show), { immediate: true, deep: true })

async function open(id: string) {
  try {
    viewer.value = await store.blobUrl(id, 'file')
  } catch {
    viewer.value = ''
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && viewer.value) {
    viewer.value = ''
    e.stopPropagation()
  }
}
document.addEventListener('keydown', onKey, true)
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))
</script>

<template>
  <ul v-if="ids.length" class="ni" :class="{ big }">
    <li v-for="id in ids" :key="id">
      <button type="button" class="ni-open" aria-label="Открыть картинку" @click.stop="open(id)">
        <img v-if="urls[id]" :src="urls[id]" alt="" loading="lazy" />
        <span v-else class="ni-wait">…</span>
      </button>
      <button v-if="removable" type="button" class="ni-x" aria-label="Убрать из заметки" @click.stop="emit('remove', id)">✕</button>
    </li>
  </ul>
  <Teleport to="body">
    <div v-if="viewer" class="ni-view" @click.stop="viewer = ''"><img :src="viewer" alt="" /></div>
  </Teleport>
</template>

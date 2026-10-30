<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import NoteImages from '@/components/cabinet/NoteImages.vue'
import type { Note } from '@/stores/notes'

defineProps<{ note: Note; images: boolean }>()
const emit = defineEmits<{ close: []; edit: []; remove: [] }>()

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- вынесено в body: внутри карточки с transform окно «прилипало» бы к карточке и дёргалось при наведении -->
  <Teleport to="body">
    <div class="nm" @click.self="emit('close')">
      <article class="nm-box" role="dialog" aria-modal="true" :aria-label="note.title">
        <button class="nm-x" aria-label="Закрыть" @click="emit('close')">✕</button>
        <h2>{{ note.title }}</h2>
        <time>{{ when(note.created) }}<span v-if="note.updated - note.created > 60_000"> · изменена {{ when(note.updated) }}</span></time>
        <ul v-if="note.tags.length" class="nm-tags"><li v-for="t in note.tags" :key="t">#{{ t }}</li></ul>
        <p v-if="note.text" class="nm-text">{{ note.text }}</p>
        <NoteImages v-if="images && note.images.length" :ids="note.images" big />
        <div class="nm-acts">
          <button class="plain" @click="emit('edit')">Изменить</button>
          <button class="plain danger" @click="emit('remove')">Удалить</button>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style>
.nm { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; overflow-y: auto; background: rgba(32, 38, 92, .5);
  backdrop-filter: blur(6px); font-family: 'Archivo', 'Noto Sans KR', sans-serif; color: #20265c; }
.nm-box { position: relative; width: min(720px, 100%); max-height: calc(100vh - 48px); overflow-y: auto; padding: 28px 30px; background: #f6f1ff; border: 1px solid #fff;
  border-radius: 24px; box-shadow: 0 40px 80px -30px rgba(32, 38, 92, .5); }
.nm-box h2 { margin: 0 40px 4px 0; font-size: 26px; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
.nm-box time { display: block; font-size: 12.5px; color: #6c70a8; }
.nm-text { margin: 16px 0 0; font-size: 15.5px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.nm-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.nm-tags li { padding: 2px 10px; font-size: 13px; font-weight: 600; color: #8f7cf0; background: #fff; border-radius: 99px; }
.nm-x { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; padding: 0; font: inherit; font-size: 15px; color: #20265c; background: #fff; border: 0; border-radius: 50%; cursor: pointer; }
.nm-x:hover { color: #d64da9; }
.nm-acts { display: flex; gap: 8px; margin-top: 20px; }
.nm-acts button { padding: 9px 20px; font: inherit; font-size: 14px; font-weight: 600; color: #20265c; background: transparent; border: 1px solid rgba(111, 105, 190, .3); border-radius: 10px; cursor: pointer; }
.nm-acts button:hover { border-color: #8f7cf0; }
.nm-acts .danger:hover { border-color: #b44634; color: #b44634; }
</style>

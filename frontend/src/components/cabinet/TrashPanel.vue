<script setup lang="ts">
import { daysLeftLabel, trashDaysLeft, TRASH_DAYS } from '@/lib/notesMeta'

/** Корзина заметок и картинок (один вид на оба раздела): что удалено, сколько осталось, «Восстановить» и «Удалить навсегда». Действия делает родитель. */
defineProps<{ items: { id: string; title: string; sub?: string; deletedAt: number }[]; loading: boolean; error: string; noun: string }>()
const emit = defineEmits<{ restore: [id: string]; purge: [id: string] }>()
</script>

<template>
  <section class="tr" aria-label="Корзина">
    <p class="tr-hint">{{ noun }} лежат в корзине {{ TRASH_DAYS }} дней, потом удаляются сами. Гостю корзина недоступна.</p>
    <p v-if="error" class="nt-err">{{ error }}</p>
    <p v-else-if="loading" class="cb-empty">Загружаю…</p>
    <p v-else-if="!items.length" class="cb-empty">В корзине пусто.</p>
    <ul v-else class="tr-list">
      <li v-for="it in items" :key="it.id" class="tr-item">
        <slot name="thumb" :item="it" />
        <div class="tr-meta">
          <b>{{ it.title }}</b>
          <small v-if="it.sub">{{ it.sub }}</small>
          <small>{{ daysLeftLabel(trashDaysLeft(it.deletedAt)) }}</small>
        </div>
        <div class="tr-acts">
          <button type="button" @click="emit('restore', it.id)">Восстановить</button>
          <button type="button" class="plain danger" @click="emit('purge', it.id)">Удалить навсегда</button>
        </div>
      </li>
    </ul>
  </section>
</template>

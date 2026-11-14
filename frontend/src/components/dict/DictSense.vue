<script setup lang="ts">
// Одно значение слова большого словаря: перевод, пояснение, определение и пример (карточка в поиске и страница слова).
type Sense = { ru: { t: string; d: string }[]; ko: string; sent: string[] }
const props = defineProps<{ sense: Sense }>()
const ruList = computed(() => props.sense.ru.map(r => r.t).filter(Boolean).join('; '))
const defOf = computed(() => (ruList.value ? props.sense.ru[0]?.d ?? '' : props.sense.ru.map(r => r.d).filter(Boolean).join(' ')))
</script>

<template>
  <dl class="kv">
    <template v-if="ruList"><dt>Перевод</dt><dd class="ru">{{ ruList }}</dd></template>
    <template v-if="defOf"><dt>Значение</dt><dd>{{ defOf }}</dd></template>
    <template v-if="sense.ko"><dt>Определение</dt><dd lang="ko">{{ sense.ko }}</dd></template>
    <template v-if="sense.sent[0]"><dt>Пример</dt><dd class="exv"><span lang="ko">{{ sense.sent[0] }}</span></dd></template>
  </dl>
</template>

<style scoped>
.kv { margin: 0; min-width: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 16px; }
.kv dt { padding-top: 3px; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.kv dd { margin: 0; color: #14173a; font-size: 15px; line-height: 1.55; }
.kv dd.ru { font-size: 18px; font-weight: 700; color: #43308c; line-height: 1.4; }
.exv { display: flex; flex-direction: column; gap: 4px; }
</style>

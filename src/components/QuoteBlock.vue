<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuotesStore } from "@/stores/quotes.ts";
import IconArrow from "@/components/icons/IconArrow.vue";
import QuoteDots from "@/components/QuoteDots.vue";

const AUTOPLAY = true;
const INTERVAL = 5;

const quotes = useQuotesStore().quotes;
const i = ref(0);
const current = computed(() => quotes[i.value] ?? ['', '']);
let timer: ReturnType<typeof setInterval> | undefined;

function show(n: number) {
  i.value = (n + quotes.length) % quotes.length;
}
function restart() {
  clearInterval(timer);
  if (AUTOPLAY) timer = setInterval(() => show(i.value + 1), INTERVAL * 1000);
}
function go(n: number) {
  show(n);
  restart();
}

onMounted(restart);
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="quote">
    <div class="counter">ЦИТАТА <span>{{ i + 1 }}</span> / <span>{{ quotes.length }}</span></div>
    <span id="q">{{ current[0] }}</span>
    <span id="c">{{ current[1] }}</span>
    <div class="controls">
      <button class="arrow" aria-label="Назад" @click="go(i - 1)">
        <icon-arrow direction="prev"/>
      </button>
      <button class="arrow" aria-label="Вперёд" @click="go(i + 1)">
        <icon-arrow direction="next"/>
      </button>
      <quote-dots :count="quotes.length" :active="i" @select="go"/>
    </div>
  </div>
</template>

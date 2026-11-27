<script setup lang="ts">
/**
 * Окно «Книжная полка» поверх игры: те же книги, что на странице грамматики (`?view=shelf`), чтобы заглянуть в правило, не уходя из игры.
 * Показываются пройденные карточки вкладки «Мои карточки» (как на странице грамматики по умолчанию). Книга открывается и листается внутри полки.
 */
import { computed } from 'vue'
import GrammarShelf from '@/components/korean/GrammarShelf.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G, tabOf } from '@/data/korean/grammar'
import { bookKey } from '@/lib/grammarView'

const open = defineModel<boolean>({ default: false })
const { open: openCard } = useGrammarModal()
/** Урочные карточки с собственной двойняшкой не дублируются (как `OWN_TWIN` на странице грамматики). */
const OWN_TWIN = new Set(['past', 'past_i'])
const cards = computed(() =>
  G.filter(g => g.st === 'ok' && (tabOf(g) === 0 || (tabOf(g) === 1 && !OWN_TWIN.has(g.id)))).sort((a, b) => bookKey(a) - bookKey(b)),
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="gsw study sky" role="dialog" aria-modal="true" aria-label="Книжная полка" @click.self="open = false">
      <div class="gsw-box">
        <button type="button" class="gsw-x" aria-label="Закрыть" @click="open = false">✕</button>
        <h2>Книжная полка</h2>
        <GrammarShelf :cards="cards" no-book-label="Мои карточки · Книга 1A" @open="id => openCard(id, true)" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gsw { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: rgba(30, 35, 80, .35); backdrop-filter: blur(6px); }
.gsw-box { position: relative; width: min(1100px, 100%); max-height: 92vh; overflow: auto; padding: 22px 22px 26px; border-radius: 26px; background: rgba(251, 248, 255, .96); color: #1e2350; box-shadow: 0 30px 80px rgba(60, 50, 140, .35); }
.gsw-box h2 { margin: 0; font-size: 24px; }
.gsw-x { position: absolute; top: 14px; right: 14px; width: 38px; height: 38px; border: 0; border-radius: 50%; background: rgba(120, 110, 200, .12); color: inherit; font-size: 15px; cursor: pointer; }
.gsw-x:hover { background: #1e2350; color: #fff; }
</style>

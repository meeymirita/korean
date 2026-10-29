<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { quickLinks, slides } from '@/data/guide'

const open = ref(false)
const index = ref(0)
const closeBtn = ref<HTMLButtonElement>()
let touchX = 0

const last = slides.length - 1
const go = (n: number) => (index.value = (n + slides.length) % slides.length)
const close = () => (open.value = false)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowRight') go(index.value + 1)
  else if (e.key === 'ArrowLeft') go(index.value - 1)
}

watch(open, async isOpen => {
  document.body.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) {
    document.addEventListener('keydown', onKey)
    await nextTick()
    closeBtn.value?.focus()
  } else document.removeEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

const onTouchEnd = (e: TouchEvent) => {
  const dx = e.changedTouches[0]!.clientX - touchX
  if (Math.abs(dx) > 50) go(index.value + (dx < 0 ? 1 : -1))
}
</script>

<template>
  <div class="guide-card">
    <button class="guide-open" @click="open = true">
      <span class="guide-ico">✦</span>
      <span class="guide-txt"><b>Что здесь есть</b><small>обзор страниц и режимов</small></span>
      <span class="guide-arrow">→</span>
    </button>
    <div class="guide-quick" aria-label="Быстрые переходы">
      <RouterLink v-for="l in quickLinks.slice(0, 3)" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="open" class="guide-overlay" @click.self="close">
      <div class="guide-modal" role="dialog" aria-modal="true" aria-label="Что здесь есть">
        <div class="guide-head">
          <span class="guide-count">{{ index + 1 }} / {{ slides.length }}</span>
          <button ref="closeBtn" class="guide-x" aria-label="Закрыть" @click="close">✕</button>
        </div>

        <div class="guide-view" @touchstart.passive="touchX = $event.touches[0]!.clientX" @touchend.passive="onTouchEnd">
          <div class="guide-track" :style="{ transform: `translateX(-${index * 100}%)` }">
            <section v-for="(s, i) in slides" :key="s.title" class="guide-slide" :aria-hidden="i !== index">
              <div class="guide-icon">{{ s.icon }}</div>
              <h2>{{ s.title }}</h2>
              <p class="guide-lead">{{ s.lead }}</p>
              <ul>
                <li v-for="p in s.points" :key="p">{{ p }}</li>
              </ul>
              <div class="guide-links">
                <RouterLink v-for="l in s.links" :key="l.to" :to="l.to" :tabindex="i === index ? 0 : -1" @click="close">{{ l.label }} →</RouterLink>
              </div>
            </section>
          </div>
        </div>

        <div class="guide-nav">
          <button class="guide-arrowbtn" aria-label="Назад" @click="go(index - 1)">←</button>
          <div class="guide-dots">
            <button v-for="(s, i) in slides" :key="s.title" :class="{ on: i === index }" :aria-label="s.title" @click="go(i)"></button>
          </div>
          <button class="guide-arrowbtn" aria-label="Вперёд" @click="go(index + 1)">→</button>
        </div>

        <div class="guide-foot">
          <span>Быстрые переходы</span>
          <RouterLink v-for="l in quickLinks" :key="l.to" :to="l.to" @click="close">{{ l.label }}</RouterLink>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.guide-card { position:static; margin:0 0 48px 48px; width:min(380px, calc(100% - 96px));
  padding:14px 16px; border-radius:16px; background:rgba(248,247,244,.9);
  box-shadow:0 30px 60px -30px rgba(40,38,34,.45); display:flex; flex-direction:column; gap:10px; }
.guide-open { display:flex; align-items:center; gap:12px; width:100%; padding:0; border:0; background:transparent;
  color:var(--ink); text-align:left; cursor:pointer; font:inherit; }
.guide-ico { display:grid; place-items:center; width:34px; height:34px; flex:none; border-radius:50%;
  border:1px solid var(--gold); color:var(--gold); font-size:14px; transition:background .2s, color .2s; }
.guide-open:hover .guide-ico { background:var(--gold); color:#fff; }
.guide-txt { display:flex; flex-direction:column; }
.guide-txt b { font-family:'Cormorant Garamond',serif; font-size:21px; font-weight:600; line-height:1.1; }
.guide-txt small { font-size:12px; color:var(--muted); }
.guide-arrow { margin-left:auto; color:var(--gold); font-size:18px; transition:transform .2s; }
.guide-open:hover .guide-arrow { transform:translateX(4px); }
.guide-quick { display:flex; flex-wrap:wrap; gap:6px; padding-top:10px; border-top:1px solid rgba(168,130,47,.25); }
.guide-quick a, .guide-foot a { padding:4px 12px; font-size:12.5px; font-weight:600; border:1px solid rgba(168,130,47,.4);
  border-radius:99px; transition:background .2s, color .2s; }
.guide-quick a:hover, .guide-foot a:hover { background:var(--gold); color:#fff; }

.guide-overlay { position:fixed; inset:0; z-index:100; display:grid; place-items:center; padding:20px;
  background:rgba(43,42,39,.55); backdrop-filter:blur(3px); }
.guide-modal { width:min(720px,100%); max-height:92vh; display:flex; flex-direction:column; overflow:hidden;
  background:var(--bg); border:1px solid rgba(168,130,47,.35); border-radius:22px;
  box-shadow:0 40px 80px -30px rgba(40,38,34,.6); color:var(--ink); font-family:'Manrope',sans-serif; }
.guide-head { display:flex; align-items:center; justify-content:space-between; padding:14px 18px 0 24px; }
.guide-count { font-family:'Space Mono',monospace; font-size:11px; letter-spacing:.2em; color:var(--gold); }
.guide-x { width:34px; height:34px; border:0; border-radius:50%; background:transparent; font-size:16px; cursor:pointer;
  color:var(--ink); transition:background .2s, color .2s; }
.guide-x:hover { background:var(--gold); color:#fff; }
.guide-view { overflow:hidden; flex:1; min-height:0; }
.guide-track { display:flex; height:100%; transition:transform .35s ease; }
.guide-slide { flex:0 0 100%; min-width:0; padding:6px 28px 8px; overflow-y:auto; max-height:56vh; }
.guide-icon { font-size:38px; line-height:1; margin-top:6px; }
.guide-slide h2 { margin:8px 0 0; font-family:'Cormorant Garamond',serif; font-size:38px; font-weight:600; line-height:1; }
.guide-lead { margin:10px 0 0; font-size:15px; line-height:1.55; color:var(--muted); }
.guide-slide ul { margin:14px 0 0; padding:0; list-style:none; display:grid; gap:8px; }
.guide-slide li { position:relative; padding-left:22px; font-size:14.5px; line-height:1.5; }
.guide-slide li::before { content:""; position:absolute; left:0; top:.72em; width:12px; height:1px; background:var(--gold); }
.guide-links { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
.guide-links a { padding:9px 18px; font-size:14px; font-weight:600; color:#fff; background:var(--gold); border-radius:12px; transition:opacity .2s; }
.guide-links a:hover { opacity:.88; }
.guide-nav { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 20px; }
.guide-arrowbtn { width:36px; height:36px; flex:none; border:1px solid var(--gold); border-radius:50%; background:transparent;
  color:var(--ink); font-size:16px; cursor:pointer; transition:background .2s, color .2s; }
.guide-arrowbtn:hover { background:var(--gold); color:#fff; }
.guide-dots { display:flex; flex-wrap:wrap; justify-content:center; gap:6px; }
.guide-dots button { width:7px; height:7px; padding:0; border:0; border-radius:4px; cursor:pointer; background:rgba(43,42,39,.25);
  transition:width .25s, background .25s; }
.guide-dots button.on { width:22px; background:var(--gold); }
.guide-foot { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:12px 24px 18px; border-top:1px solid rgba(168,130,47,.25); }
.guide-foot span { margin-right:6px; font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); }

@media (max-width:960px) {
  .guide-card { width:auto; margin:16px 16px 0; }
  .guide-slide { padding:6px 20px 8px; }
  .guide-slide h2 { font-size:32px; }
}
</style>

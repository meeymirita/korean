<script setup lang="ts">
import SectionHead from '@/components/korean/SectionHead.vue'
import { SITE_GROUPS } from '@/data/korean/sites'
</script>

<template>
  <div class="wrap">
    <SectionHead id="sites" :big="SITE_GROUPS.reduce((n, g) => n + g.sites.length, 0)" />
    <p class="intro">Подборка внешних сайтов, где можно практиковаться дальше. Ссылки открываются в новой вкладке.</p>
    <section v-for="g in SITE_GROUPS" :key="g.id" class="grp">
      <h2>{{ g.title }}</h2>
      <div class="list">
        <a v-for="s in g.sites" :key="s.url" class="site" :href="s.url" target="_blank" rel="noopener noreferrer">
          <b>{{ s.name }}</b>
          <span>{{ s.desc }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.grp h2 { margin: 24px 0 10px; font-size: 15px; letter-spacing: .03em; color: var(--muted); }
.list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.site { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.site:hover { transform: translateY(-2px); border-color: var(--gold); }
.site b { font-size: 16px; }
.site span { font-size: 13.5px; line-height: 1.45; color: var(--muted); }
</style>

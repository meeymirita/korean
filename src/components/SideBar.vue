<script setup lang="ts">
import {useMenuStore} from "@/stores/menu.ts";

const menuStore = useMenuStore().menu ?? [];
</script>
<template>
  <div class="side">
    <div>
      <div class="jp">葬送のフリーレン</div>
      <h1>Магия<br>воспоминаний</h1>
    </div>
    <nav id="nav">
      <a
          v-for="(item, index) in menuStore"
          :key="item.title"
          :href="item.href ?? '#'"
          :target="item.href ? '_blank' : undefined"
          :rel="item.href ? 'noopener' : undefined"
      >
        <span class="line"></span>
        <span>{{ item.title }}</span>
        <span class="num">{{ String(index+1).padStart(2,'0') }}</span>
      </a>
    </nav>
  </div>
</template>
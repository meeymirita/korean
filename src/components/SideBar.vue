<script setup lang="ts">
import {RouterLink} from "vue-router";
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
      <component
          :is="item.to ? RouterLink : 'a'"
          v-for="(item, index) in menuStore"
          :key="item.title"
          v-bind="item.to ? { to: item.to } : { href: item.href ?? '#', target: '_blank', rel: 'noopener' }"
      >
        <span class="line"></span>
        <span>{{ item.title }}</span>
        <span class="num">{{ String(index+1).padStart(2,'0') }}</span>
      </component>
    </nav>
  </div>
</template>
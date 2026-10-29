<script setup lang="ts">
import {RouterLink} from "vue-router";
import {useMenuStore} from "@/stores/menu.ts";

const groups = useMenuStore().menuGroups;
</script>

<template>
  <nav class="side-menu" aria-label="Разделы сайта">
    <section v-for="group in groups" :key="group.title" class="menu-group">
      <div class="counter">{{ group.title }}</div>
      <ul>
        <li v-for="item in group.items" :key="item.title">
          <component
              :is="item.to ? RouterLink : 'a'"
              v-bind="item.to ? { to: item.to } : { href: item.href ?? '#', target: '_blank', rel: 'noopener' }"
          >
            <span class="line"></span>
            <span>{{ item.title }}</span>
          </component>
        </li>
      </ul>
    </section>
  </nav>
</template>

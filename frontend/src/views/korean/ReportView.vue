<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ReportTab from '@/components/cabinet/ReportTab.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
</script>

<template>
  <div class="wrap">
    <RouterLink to="/korean/cabinet" class="chip rv-back">← В личный кабинет</RouterLink>
    <SectionHead id="report" />
    <ReportTab />
  </div>
</template>

<style>
.study .rv-back { display: inline-flex; margin-bottom: 14px; text-decoration: none; }
</style>

<script setup lang="ts">
import SectionHead from '@/components/korean/SectionHead.vue'
import ServiceLinks from '@/components/cabinet/ServiceLinks.vue'
import ServicesTab from '@/components/cabinet/ServicesTab.vue'
</script>

<template>
  <div class="wrap services-page">
    <SectionHead id="services" />
    <h2 class="sv-h">Открыть сервис</h2>
    <ServiceLinks />
    <div class="sv-body"><ServicesTab /></div>
  </div>
</template>

<style scoped>
.sv-h { margin: 22px 0 12px; font-size: 18px; }
.sv-body { margin-top: 26px; }
</style>

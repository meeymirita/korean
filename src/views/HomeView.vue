<script setup lang="ts">
import SideBar from "@/components/SideBar.vue";
import QuoteBlock from "@/components/QuoteBlock.vue";
import GuideModal from "@/components/GuideModal.vue";
import ContactBar from "@/components/ContactBar.vue";
</script>

<template>
  <div class="hero">
    <img src="/frieren.webp" alt="">
    <div class="shade"></div>

    <side-bar/>
    <guide-modal/>
    <div class="right-col">
      <quote-block/>
    </div>
  </div>
  <contact-bar/>
</template>

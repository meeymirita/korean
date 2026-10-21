<script setup lang="ts">
import SideBar from "@/components/SideBar.vue";
import QuoteBlock from "@/components/QuoteBlock.vue";
import ContactBar from "@/components/ContactBar.vue";
</script>

<template>
  <div class="hero">
    <img src="/frieren.png" alt="">
    <div class="shade"></div>

    <side-bar/>
    <quote-block/>
  </div>
  <contact-bar/>
</template>

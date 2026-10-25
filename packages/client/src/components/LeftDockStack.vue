<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore } from '../store/match'
import OrdersDock from './OrdersDock.vue'
import ReportDock from './ReportDock.vue'

const store = useMatchStore()
const visible = computed(
  () => !!store.snapshot && !!store.player && (store.showOrdersDock || store.showReportDock),
)
</script>

<template>
  <div v-if="visible" class="left-dock-stack">
    <OrdersDock />
    <ReportDock />
  </div>
</template>

<style>
.left-dock-stack {
  position: absolute;
  left: 0;
  top: 50%;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  transform: translateY(-50%);
  pointer-events: none;
}

.left-dock-stack > * {
  pointer-events: auto;
}
</style>

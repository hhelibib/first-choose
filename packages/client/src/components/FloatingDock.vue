<script setup lang="ts">
import { computed, ref } from 'vue'

const COLLAPSED_W = 28
const EXPANDED_W = 248

defineProps<{
  title: string
}>()

const expanded = ref(false)
const panelW = computed(() => (expanded.value ? EXPANDED_W : COLLAPSED_W))
</script>

<template>
  <aside
    class="float-dock"
    :class="{ expanded }"
    :style="{ width: `${panelW}px` }"
    @mouseenter="expanded = true"
    @mouseleave="expanded = false"
  >
    <div class="dock-head">
      <h2>{{ title }}</h2>
    </div>
    <div v-show="expanded" class="dock-body">
      <slot />
    </div>
  </aside>
</template>

<style>
.float-dock {
  position: relative;
  z-index: 7;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 120px;
  max-height: min(280px, 38vh);
  background: rgb(15 22 30 / 78%);
  border: 1px solid #2c3644;
  border-left: none;
  border-radius: 0 10px 10px 0;
  box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
  overflow: hidden;
  pointer-events: auto;
}

.float-dock:not(.expanded) {
  min-height: 120px;
  max-height: 160px;
}

.float-dock .dock-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 6px;
  min-height: 36px;
}

.float-dock:not(.expanded) .dock-head {
  writing-mode: vertical-rl;
  letter-spacing: 0.14em;
  justify-content: center;
  padding: 12px 6px;
  min-height: 120px;
}

.float-dock h2 {
  margin: 0;
  flex: 1;
  font-size: 14px;
  color: #e8edf2;
}

.float-dock .dock-body {
  min-height: 0;
  padding: 0 8px 8px;
  overflow: hidden;
  display: grid;
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMatchStore } from '../store/match'
import { t } from '../i18n/index'
import FloatingDock from './FloatingDock.vue'

const store = useMatchStore()
const filterSelected = ref(false)
const listEl = ref<HTMLElement | null>(null)

const visibleLog = computed(() => {
  if (!filterSelected.value || !store.selected) {
    return store.logEntries
  }
  const id = store.selected.id
  return store.logEntries.filter((entry) => entry.relatedIds.includes(id))
})

const enemy = computed(() => {
  if (!store.snapshot) {
    return null
  }
  return Object.values(store.snapshot.players).find((player) => player.id !== store.localPlayerId) ?? null
})

watch(
  () => visibleLog.value.length,
  async () => {
    await nextTick()
    const root = listEl.value
    if (root) {
      root.scrollTop = root.scrollHeight
    }
  },
)

function toneClass(tone: string): string {
  return `tone-${tone}`
}
</script>

<template>
  <FloatingDock v-if="store.showReportDock" :title="t('log.report')">
    <div class="report">
      <p v-if="store.player" class="facts">
        {{ t('log.kills', { k: store.player.stats.unitsKilled, l: store.player.stats.unitsLost, g: store.player.stats.resourcesGathered }) }}
        <template v-if="enemy"> · {{ t('log.killsShort', { k: enemy.stats.unitsKilled, l: enemy.stats.unitsLost }) }}</template>
      </p>
      <div class="log-head">
        <button type="button" :class="{ on: !filterSelected }" @click="filterSelected = false">{{ t('log.all') }}</button>
        <button type="button" :disabled="!store.selected" :class="{ on: filterSelected }" @click="filterSelected = true">{{ t('log.selected') }}</button>
      </div>
      <ul ref="listEl" class="entries">
        <li v-for="entry in visibleLog" :key="entry.id" :class="toneClass(entry.tone)">
          <span class="meta">R{{ entry.round }} · {{ entry.tick }}</span>
          {{ entry.text }}
        </li>
        <li v-if="visibleLog.length === 0" class="empty">{{ t('log.empty') }}</li>
      </ul>
    </div>
  </FloatingDock>
</template>

<style>
.report {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 6px;
  min-height: 0;
  height: 100%;
}

.report .facts {
  margin: 0;
  color: #9aabbc;
  font-size: 11px;
  line-height: 1.4;
}

.report .log-head {
  display: flex;
  gap: 6px;
}

.report .log-head button {
  padding: 2px 8px;
  border: 1px solid #3d4b5c;
  background: #1d2632;
  color: #c5d0db;
  font-size: 12px;
}

.report .log-head button.on {
  border-color: #4aa3ff;
  color: #fff;
}

.report .entries {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  min-height: 120px;
  max-height: 300px;
  border: 1px solid #2c3644;
  font-size: 12px;
}

.report .entries li {
  padding: 6px 8px;
  border-bottom: 1px solid #24303c;
  color: #d5dee8;
  line-height: 1.4;
}

.report .entries .meta {
  display: block;
  color: #6f8194;
  font-size: 11px;
}

.report .tone-combat {
  color: #f3c4c4;
}

.report .tone-econ {
  color: #c9e4c4;
}

.report .tone-order {
  color: #d4e4f7;
}

.report .empty {
  color: #7f90a3;
}
</style>

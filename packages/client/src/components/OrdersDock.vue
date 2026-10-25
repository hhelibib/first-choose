<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore } from '../store/match'
import { t } from '../i18n/index'
import { currentOrders } from '../log/match-log'
import FloatingDock from './FloatingDock.vue'

const store = useMatchStore()

const orders = computed(() => {
  if (!store.snapshot || !store.config) {
    return []
  }
  return currentOrders(store.snapshot, store.config, store.localPlayerId)
})

function selectOrder(id: string, kind: 'unit' | 'building') {
  store.selected = { kind, id }
  store.resetInteraction()
}
</script>

<template>
  <FloatingDock v-if="store.showOrdersDock" :title="t('log.orders')">
    <ul class="orders">
      <li
        v-for="row in orders"
        :key="row.id"
        :class="{ mine: row.ownerId === store.localPlayerId, selected: store.selected?.id === row.id }"
        @click="selectOrder(row.id, row.kind)"
      >
        <span>{{ row.title }}</span>
        <span>{{ row.summary }}</span>
      </li>
      <li v-if="orders.length === 0" class="empty">{{ t('log.empty') }}</li>
    </ul>
  </FloatingDock>
</template>

<style>
.orders {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  min-height: 0;
  max-height: 340px;
  border: 1px solid #2c3644;
}

.orders li {
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  font-size: 12px;
  border-bottom: 1px solid #24303c;
  cursor: pointer;
}

.orders li span:last-child {
  color: #9aabbc;
}

.orders li.mine span:first-child {
  color: #8ec5ff;
}

.orders li:not(.mine):not(.empty) span:first-child {
  color: #f0a3a3;
}

.orders li.selected {
  background: #243044;
}

.orders .empty {
  color: #7f90a3;
  cursor: default;
}
</style>

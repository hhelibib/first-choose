<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMatchStore } from '../store/match'
import { currentOrders } from '../log/match-log'

const store = useMatchStore()
const filterSelected = ref(false)
const open = ref(false)
const listEl = ref<HTMLElement | null>(null)

const orders = computed(() => {
  if (!store.snapshot || !store.config) {
    return []
  }
  return currentOrders(store.snapshot, store.config, store.localPlayerId)
})

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

function selectOrder(id: string, kind: 'unit' | 'building', ownerId: string) {
  if (ownerId !== store.localPlayerId) {
    store.selected = { kind, id }
    store.resetInteraction()
    return
  }
  store.selected = { kind, id }
  store.resetInteraction()
}

function toneClass(tone: string): string {
  return `tone-${tone}`
}
</script>

<template>
  <aside v-if="store.snapshot && store.player" class="match-log" :class="{ open }">
    <div v-show="open" class="body">
    <h2>对局</h2>
    <dl class="facts">
      <div>
        <dt>回合</dt>
        <dd>{{ store.snapshot.round }} · {{ store.snapshot.phase === 'OPERATION' ? '操作' : store.snapshot.phase === 'AUTO' ? '自走' : store.snapshot.phase }}</dd>
      </div>
      <div>
        <dt>逻辑步</dt>
        <dd>{{ store.snapshot.tick }}</dd>
      </div>
      <div>
        <dt>我方</dt>
        <dd>击杀 {{ store.player.stats.unitsKilled }} · 损失 {{ store.player.stats.unitsLost }} · 采集 {{ store.player.stats.resourcesGathered }}</dd>
      </div>
      <div v-if="enemy">
        <dt>敌方</dt>
        <dd>击杀 {{ enemy.stats.unitsKilled }} · 损失 {{ enemy.stats.unitsLost }}</dd>
      </div>
    </dl>

    <h2>单位指令</h2>
    <ul class="orders">
      <li
        v-for="row in orders"
        :key="row.id"
        :class="{ mine: row.ownerId === store.localPlayerId, selected: store.selected?.id === row.id }"
        @click="selectOrder(row.id, row.kind, row.ownerId)"
      >
        <span>{{ row.title }}</span>
        <span>{{ row.summary }}</span>
      </li>
    </ul>

    <div class="log-head">
      <h2>战报</h2>
      <button type="button" :class="{ on: !filterSelected }" @click="filterSelected = false">全部</button>
      <button type="button" :disabled="!store.selected" :class="{ on: filterSelected }" @click="filterSelected = true">选中</button>
    </div>
    <ul ref="listEl" class="entries">
      <li v-for="entry in visibleLog" :key="entry.id" :class="toneClass(entry.tone)">
        <span class="meta">R{{ entry.round }} · {{ entry.tick }}</span>
        {{ entry.text }}
      </li>
      <li v-if="visibleLog.length === 0" class="empty">暂无记录</li>
    </ul>
    </div>
    <button type="button" class="dock" @click="open = !open">{{ open ? '收起对局' : '对局' }}</button>
  </aside>
</template>

<style>
.match-log {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  transform: translateY(-50%);
  pointer-events: none;
}

.match-log.open {
  top: 16px;
  bottom: 16px;
  transform: none;
  align-items: stretch;
  max-height: calc(100% - 32px);
}

.match-log.open .dock {
  border-radius: 0 10px 10px 0;
}

.match-log .dock {
  pointer-events: auto;
  align-self: center;
  flex: none;
  writing-mode: vertical-rl;
  letter-spacing: 0.12em;
  padding: 14px 7px;
  border: 1px solid #4aa3ff;
  border-left: none;
  border-radius: 0 10px 10px 0;
  background: rgb(15 22 30 / 62%);
  color: #e8edf2;
}

.match-log .body {
  pointer-events: auto;
  width: 240px;
  padding: 12px;
  background: rgb(15 22 30 / 42%);
  backdrop-filter: blur(8px);
  border: 1px solid #2c3644;
  border-left: none;
  border-radius: 0 10px 10px 0;
  box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
  display: grid;
  grid-template-rows: auto auto auto auto auto 1fr;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.match-log.open {
  left: 0;
}

.match-log h2 {
  margin: 0;
  font-size: 15px;
}

.match-log .facts {
  margin: 0;
  display: grid;
  gap: 4px;
  font-size: 12px;
}

.match-log .facts div {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 8px;
}

.match-log dt {
  color: #7f90a3;
}

.match-log dd {
  margin: 0;
  color: #d5dee8;
}

.match-log .orders,
.match-log .entries {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  min-height: 0;
}

.match-log .orders {
  max-height: 180px;
  border: 1px solid #2c3644;
}

.match-log .orders li {
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  font-size: 12px;
  border-bottom: 1px solid #24303c;
  cursor: pointer;
}

.match-log .orders li span:last-child {
  color: #9aabbc;
}

.match-log .orders li.mine span:first-child {
  color: #8ec5ff;
}

.match-log .orders li:not(.mine) span:first-child {
  color: #f0a3a3;
}

.match-log .orders li.selected {
  background: #243044;
}

.match-log .log-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.match-log .log-head h2 {
  flex: 1;
}

.match-log .log-head button {
  padding: 2px 8px;
  border: 1px solid #3d4b5c;
  background: #1d2632;
  color: #c5d0db;
  font-size: 12px;
}

.match-log .log-head button.on {
  border-color: #4aa3ff;
  color: #fff;
}

.match-log .entries {
  border: 1px solid #2c3644;
  font-size: 12px;
}

.match-log .entries li {
  padding: 6px 8px;
  border-bottom: 1px solid #24303c;
  color: #d5dee8;
  line-height: 1.4;
}

.match-log .entries .meta {
  display: block;
  color: #6f8194;
  font-size: 11px;
}

.match-log .tone-combat {
  color: #f3c4c4;
}

.match-log .tone-econ {
  color: #c9e4c4;
}

.match-log .tone-order {
  color: #d4e4f7;
}

.match-log .empty {
  color: #7f90a3;
}
</style>

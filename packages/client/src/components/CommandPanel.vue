<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Resources } from '@battle/shared'
import { BUILDING_TYPE_IDS, useMatchStore } from '../store/match'
import { canAfford, formatDuration, formatResources } from '../format/resources'
import { t, unitName as localizedUnit } from '../i18n/index'

const HINT_W = 280
const COMMAND_W = 320

const store = useMatchStore()
const panelEl = ref<HTMLElement | null>(null)
const dragging = ref(false)
let dragOffsetX = 0
let dragOffsetY = 0

const floating = computed(() => store.isTargeting || (!!store.selected && !!store.commandAnchor))

function clampHint(x: number, y: number): { x: number; y: number } {
  const parent = panelEl.value?.parentElement
  const viewW = parent?.clientWidth ?? 1280
  const viewH = parent?.clientHeight ?? 720
  const height = panelEl.value?.offsetHeight ?? 120
  return {
    x: Math.min(Math.max(8, x), Math.max(8, viewW - HINT_W - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, viewH - height - 8)),
  }
}

function defaultHintPos(): { x: number; y: number } {
  const parent = panelEl.value?.parentElement
  const viewW = parent?.clientWidth ?? 1280
  return clampHint(Math.max(8, (viewW - HINT_W) / 2), 72)
}

watch(
  () => store.isTargeting,
  async (targeting) => {
    if (targeting && !store.orderHintPos) {
      await nextTick()
      store.orderHintPos = defaultHintPos()
    }
  },
)

const floatStyle = computed(() => {
  if (store.isTargeting) {
    const pos = store.orderHintPos ?? defaultHintPos()
    return {
      left: `${Math.round(pos.x)}px`,
      top: `${Math.round(pos.y)}px`,
      width: `${HINT_W}px`,
    }
  }
  const anchor = store.commandAnchor
  if (!floating.value || !anchor) {
    return {}
  }
  const parent = panelEl.value?.parentElement
  const viewW = parent?.clientWidth ?? 1280
  const viewH = parent?.clientHeight ?? 720
  const panelW = COMMAND_W
  const panelH = Math.min(280, viewH - 24)
  const gap = Math.max(8, Math.round(anchor.w * 0.2))
  let left = anchor.x + anchor.w + gap
  let top = anchor.y
  if (left + panelW > viewW - 8) {
    left = anchor.x - gap - panelW
  }
  if (left < 8) {
    left = 8
  }
  if (top + panelH > viewH - 8) {
    top = Math.max(8, viewH - 8 - panelH)
  }
  if (top < 8) {
    top = 8
  }
  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${panelW}px`,
    maxHeight: `${Math.round(panelH)}px`,
  }
})

function bindDrag(on: boolean): void {
  const method = on ? 'addEventListener' : 'removeEventListener'
  window[method]('pointermove', onDragMove)
  window[method]('pointerup', onDragEnd)
  window[method]('pointercancel', onDragEnd)
}

function onHintDown(event: PointerEvent): void {
  if (event.button !== 0 || !store.isTargeting || !panelEl.value) {
    return
  }
  const host = panelEl.value
  const rect = host.getBoundingClientRect()
  dragging.value = true
  dragOffsetX = event.clientX - rect.left
  dragOffsetY = event.clientY - rect.top
  bindDrag(true)
  event.preventDefault()
}

function onDragMove(event: Event): void {
  if (!dragging.value || !panelEl.value) {
    return
  }
  const mouse = event as PointerEvent
  const parent = panelEl.value.parentElement?.getBoundingClientRect()
  if (!parent) {
    return
  }
  store.orderHintPos = clampHint(mouse.clientX - parent.left - dragOffsetX, mouse.clientY - parent.top - dragOffsetY)
}

function onDragEnd(): void {
  if (!dragging.value) {
    return
  }
  dragging.value = false
  bindDrag(false)
}

onBeforeUnmount(() => {
  bindDrag(false)
})

const commands = computed(() => store.config?.units[store.selectedUnit?.typeId ?? '']?.commands ?? [])
const recipes = computed(() => store.config?.buildings[store.selectedBuilding?.typeId ?? '']?.production ?? [])
const canAct = computed(() => store.isOperation && !!store.selected)

const farm = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.farm] ?? null)
const lumberCamp = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.lumberCamp] ?? null)
const quarry = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.quarry] ?? null)
const oreCamp = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.oreCamp] ?? null)
const goldCamp = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.goldCamp] ?? null)
const barracks = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.barracks] ?? null)
const arrowTower = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.arrowTower] ?? null)
function unitName(typeId: string): string {
  return localizedUnit(typeId, store.config?.units[typeId]?.name)
}

function recipeHint(typeId: string, cost: Resources, timeMs: number): string {
  const pop = store.config?.units[typeId]?.population ?? 0
  const parts = [formatResources(cost), formatDuration(timeMs)]
  if (pop > 0) {
    parts.push(t('order.pop', { n: pop }))
  }
  return parts.join(' · ')
}

function buildHint(cost: Resources, timeMs: number): string {
  return `${formatResources(cost)} · ${formatDuration(timeMs)}`
}

function shortOn(cost: Resources): boolean {
  return !canAfford(store.player?.resources, cost)
}
</script>

<template>
  <aside
    v-if="floating"
    ref="panelEl"
    class="command-panel"
    :class="{ targeting: store.isTargeting, dragging }"
    :style="floatStyle"
  >
    <div v-if="store.isTargeting" class="order-hint">
      <div class="hint-head" @pointerdown="onHintDown">
        <h2>{{ t('order.hintTitle') }}</h2>
        <span class="drag-hint">{{ t('inspect.drag') }}</span>
        <button type="button" class="cancel" @pointerdown.stop @click="store.cancelTargeting()">{{ t('order.cancel') }}</button>
      </div>
    </div>
    <template v-else>
    <div v-if="store.selectedUnit" class="actions">
      <button v-if="commands.includes('BUILD') && farm" type="button" :disabled="!canAct" :class="{ short: shortOn(farm.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.farm)">
        <span>{{ t('building.farm.name') }}</span>
        <small>{{ buildHint(farm.buildCost, farm.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('BUILD') && lumberCamp" type="button" :disabled="!canAct" :class="{ short: shortOn(lumberCamp.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.lumberCamp)">
        <span>{{ t('building.lumber-camp.name') }}</span>
        <small>{{ buildHint(lumberCamp.buildCost, lumberCamp.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('BUILD') && quarry" type="button" :disabled="!canAct" :class="{ short: shortOn(quarry.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.quarry)">
        <span>{{ t('building.quarry.name') }}</span>
        <small>{{ buildHint(quarry.buildCost, quarry.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('BUILD') && oreCamp" type="button" :disabled="!canAct" :class="{ short: shortOn(oreCamp.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.oreCamp)">
        <span>{{ t('building.ore-camp.name') }}</span>
        <small>{{ buildHint(oreCamp.buildCost, oreCamp.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('BUILD') && goldCamp" type="button" :disabled="!canAct" :class="{ short: shortOn(goldCamp.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.goldCamp)">
        <span>{{ t('building.gold-camp.name') }}</span>
        <small>{{ buildHint(goldCamp.buildCost, goldCamp.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('BUILD') && barracks" type="button" :disabled="!canAct" :class="{ short: shortOn(barracks.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.barracks)">
        <span>{{ t('building.barracks.name') }}</span>
        <small>{{ buildHint(barracks.buildCost, barracks.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('BUILD') && arrowTower" type="button" :disabled="!canAct" :class="{ short: shortOn(arrowTower.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.arrowTower)">
        <span>{{ t('building.arrow-tower.name') }}</span>
        <small>{{ buildHint(arrowTower.buildCost, arrowTower.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('PATROL')" type="button" :disabled="!canAct" @click="store.beginPatrol()">{{ t('cmd.PATROL') }}</button>
      <button v-if="commands.includes('REPAIR')" type="button" :disabled="!canAct" @click="store.beginRepair()">{{ t('cmd.REPAIR') }}</button>
      <button type="button" :disabled="!canAct" @click="store.sendClear()">{{ t('order.stop') }}</button>
    </div>
    <div v-else-if="store.selectedBuilding" class="actions">
      <p v-if="recipes.length === 0" class="hint full">{{ t('order.noProd') }}</p>
      <button
        v-for="recipe in recipes"
        :key="recipe.unitTypeId"
        type="button"
        :disabled="!canAct"
        :class="{ short: shortOn(recipe.cost) }"
        @click="store.produce(recipe.unitTypeId)"
      >
        <span>{{ t('order.produce', { name: unitName(recipe.unitTypeId) }) }}</span>
        <small>{{ recipeHint(recipe.unitTypeId, recipe.cost, recipe.timeMs) }}</small>
      </button>
      <button v-if="recipes.length > 0" type="button" :disabled="!canAct" @click="store.sendClear()">{{ t('order.stop') }}</button>
    </div>
    </template>
  </aside>
</template>

<style>
.command-panel {
  position: absolute;
  z-index: 6;
  width: 320px;
  padding: 8px;
  background: rgb(15 22 30 / 82%);
  border: 1px solid #2c3644;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
  pointer-events: auto;
}

.command-panel.targeting {
  z-index: 8;
}

.command-panel.dragging {
  user-select: none;
}

.command-panel .order-hint {
  display: grid;
  gap: 6px;
}

.command-panel .hint-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: grab;
}

.command-panel.dragging .hint-head {
  cursor: grabbing;
}

.command-panel .hint-head h2 {
  margin: 0;
  flex: 1;
  font-size: 14px;
}

.command-panel .hint-head .drag-hint {
  color: #7f90a3;
  font-size: 11px;
}

.command-panel .hint-head .cancel {
  padding: 2px 8px;
  border: 1px solid #3d4b5c;
  background: #1d2632;
  color: #e8edf2;
  font-size: 12px;
  cursor: pointer;
}

.command-panel .order-hint > p:first-child {
  margin: 0;
  color: #f2f6fa;
  font-size: 14px;
  font-weight: 600;
}

.command-panel .hint {
  margin: 0 0 6px;
  color: #b7c2ce;
  font-size: 12px;
}

.command-panel .hint.full {
  grid-column: 1 / -1;
  margin: 0;
}

.command-panel .actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.command-panel .actions button {
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid #3d4b5c;
  background: rgb(29 38 50 / 80%);
  color: #e8edf2;
  text-align: left;
  display: grid;
  gap: 2px;
}

.command-panel .actions button small {
  color: #9aabbc;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-panel .actions button.short small {
  color: #f0a3a3;
}
</style>

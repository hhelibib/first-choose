<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ResourceType, Resources } from '@battle/shared'
import { BUILDING_TYPE_IDS, useMatchStore } from '../store/match'
import { canAfford, formatDuration, formatResources, resourceFull } from '../format/resources'
import { buildingName, t, unitName as localizedUnit } from '../i18n/index'

const store = useMatchStore()
const panelEl = ref<HTMLElement | null>(null)

const floating = computed(() => !!store.selected && !!store.commandAnchor)

const floatStyle = computed(() => {
  const anchor = store.commandAnchor
  if (!floating.value || !anchor) {
    return {}
  }
  const parent = panelEl.value?.parentElement
  const viewW = parent?.clientWidth ?? 1280
  const viewH = parent?.clientHeight ?? 720
  const panelW = 320
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
    maxHeight: `${Math.round(panelH)}px`,
  }
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
const placing = computed(() => (store.mode === 'build' && store.buildTypeId ? store.config?.buildings[store.buildTypeId] : null))
const repair = computed(() => store.config?.repair ?? null)

function unitName(typeId: string): string {
  return localizedUnit(typeId, store.config?.units[typeId]?.name)
}

function harvestName(type: ResourceType): string {
  return resourceFull(type)
}

function recipeHint(typeId: string, cost: Resources, timeMs: number): string {
  const pop = store.config?.units[typeId]?.population ?? 0
  const parts = [formatResources(cost), formatDuration(timeMs)]
  if (pop > 0) {
    parts.push(t('order.pop', { n: pop }))
  }
  return parts.join(' · ')
}

function bName(typeId: string, fallback?: string): string {
  return buildingName(typeId, fallback)
}

function buildHint(cost: Resources, timeMs: number): string {
  return `${formatResources(cost)} · ${formatDuration(timeMs)}`
}

function shortOn(cost: Resources): boolean {
  return !canAfford(store.player?.resources, cost)
}
</script>

<template>
  <aside v-if="floating" ref="panelEl" class="command-panel" :style="floatStyle">
    <div v-if="store.isTargeting" class="order-hint">
      <p>{{ t('order.confirm') }}</p>
      <p v-if="placing" class="hint">
        {{ t('order.place', { name: bName(store.buildTypeId ?? '', placing.name), hint: buildHint(placing.buildCost, placing.buildTimeMs) }) }}
        <template v-if="placing.harvest">{{ t('order.harvest', { res: harvestName(placing.harvest.resource) }) }}</template>
      </p>
      <p v-else-if="store.mode === 'repair' && repair" class="hint">{{ t('order.repair') }}</p>
      <p v-else-if="store.mode === 'patrol'" class="hint">{{ t('order.patrol') }}</p>
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

.command-panel .order-hint {
  display: grid;
  gap: 6px;
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

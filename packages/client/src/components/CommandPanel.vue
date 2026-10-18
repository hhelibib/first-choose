<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ResourceType, Resources } from '@battle/shared'
import { BUILDING_TYPE_IDS, useMatchStore } from '../store/match'
import { canAfford, formatDuration, formatResources, resourceLabel } from '../format/resources'
import EntityCard from './EntityCard.vue'

const store = useMatchStore()
const open = ref(false)

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
  return store.config?.units[typeId]?.name ?? typeId
}

function harvestName(type: ResourceType): string {
  return resourceLabel(type)
}

function recipeHint(typeId: string, cost: Resources, timeMs: number): string {
  const pop = store.config?.units[typeId]?.population ?? 0
  const parts = [formatResources(cost), formatDuration(timeMs)]
  if (pop > 0) {
    parts.push(`人口 ${pop}`)
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
  <aside class="command-panel" :class="{ open }">
    <div v-show="open" class="body">
    <h2>资料</h2>
    <p v-if="!store.selected" class="hint">单击己方单位或建筑。右键地面移动，右键敌人攻击。资源靠对应建筑自动产出。</p>
    <EntityCard />
    <h2 v-if="store.selected">指令</h2>
    <p v-if="placing" class="hint">
      点击空地放置{{ placing.name }}（{{ buildHint(placing.buildCost, placing.buildTimeMs) }}）。资源在工人开始建造时扣除。
      <template v-if="placing.harvest">建成后该工人并入建筑，之后自动产出{{ harvestName(placing.harvest.resource) }}。</template>
    </p>
    <p v-else-if="store.mode === 'repair' && repair" class="hint">点击己方建筑维修：每 {{ formatDuration(repair.intervalMs) }}消耗矿 {{ repair.oreCost }}，回复 {{ repair.heal }} 生命。</p>
    <template v-if="store.selectedUnit">
      <button v-if="commands.includes('BUILD') && farm" type="button" :disabled="!canAct" :class="{ short: shortOn(farm.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.farm)">
        <span>建造粮田</span>
        <small>{{ buildHint(farm.buildCost, farm.buildTimeMs) }} · 消耗工人</small>
      </button>
      <button v-if="commands.includes('BUILD') && lumberCamp" type="button" :disabled="!canAct" :class="{ short: shortOn(lumberCamp.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.lumberCamp)">
        <span>建造伐木场</span>
        <small>{{ buildHint(lumberCamp.buildCost, lumberCamp.buildTimeMs) }} · 消耗工人</small>
      </button>
      <button v-if="commands.includes('BUILD') && quarry" type="button" :disabled="!canAct" :class="{ short: shortOn(quarry.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.quarry)">
        <span>建造采石场</span>
        <small>{{ buildHint(quarry.buildCost, quarry.buildTimeMs) }} · 消耗工人</small>
      </button>
      <button v-if="commands.includes('BUILD') && oreCamp" type="button" :disabled="!canAct" :class="{ short: shortOn(oreCamp.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.oreCamp)">
        <span>建造采矿场</span>
        <small>{{ buildHint(oreCamp.buildCost, oreCamp.buildTimeMs) }} · 消耗工人</small>
      </button>
      <button v-if="commands.includes('BUILD') && goldCamp" type="button" :disabled="!canAct" :class="{ short: shortOn(goldCamp.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.goldCamp)">
        <span>建造金矿</span>
        <small>{{ buildHint(goldCamp.buildCost, goldCamp.buildTimeMs) }} · 消耗工人</small>
      </button>
      <button v-if="commands.includes('BUILD') && barracks" type="button" :disabled="!canAct" :class="{ short: shortOn(barracks.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.barracks)">
        <span>建造兵营</span>
        <small>{{ buildHint(barracks.buildCost, barracks.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('BUILD') && arrowTower" type="button" :disabled="!canAct" :class="{ short: shortOn(arrowTower.buildCost) }" @click="store.beginBuild(BUILDING_TYPE_IDS.arrowTower)">
        <span>建造箭塔</span>
        <small>{{ buildHint(arrowTower.buildCost, arrowTower.buildTimeMs) }}</small>
      </button>
      <button v-if="commands.includes('PATROL')" type="button" :disabled="!canAct" @click="store.beginPatrol()">巡逻（点两格）</button>
      <button v-if="commands.includes('REPAIR')" type="button" :disabled="!canAct" @click="store.beginRepair()">维修建筑</button>
      <button type="button" :disabled="!canAct" @click="store.sendClear()">停止</button>
    </template>
    <template v-else-if="store.selectedBuilding">
      <p v-if="recipes.length === 0" class="hint">这座建筑不生产单位。</p>
      <button
        v-for="recipe in recipes"
        :key="recipe.unitTypeId"
        type="button"
        :disabled="!canAct"
        :class="{ short: shortOn(recipe.cost) }"
        @click="store.produce(recipe.unitTypeId)"
      >
        <span>生产{{ unitName(recipe.unitTypeId) }}</span>
        <small>{{ recipeHint(recipe.unitTypeId, recipe.cost, recipe.timeMs) }}</small>
      </button>
      <button v-if="recipes.length > 0" type="button" :disabled="!canAct" @click="store.sendClear()">停止生产</button>
    </template>
    </div>
    <button type="button" class="dock" @click="open = !open">{{ open ? '收起资料' : '资料' }}</button>
  </aside>
</template>

<style>
.command-panel {
  position: absolute;
  top: 50%;
  right: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  transform: translateY(-50%);
  pointer-events: none;
}

.command-panel.open {
  top: 16px;
  bottom: 16px;
  transform: none;
  align-items: stretch;
  max-height: calc(100% - 32px);
}

.command-panel.open .dock {
  border-radius: 10px 0 0 10px;
}

.command-panel .dock {
  pointer-events: auto;
  align-self: center;
  flex: none;
  writing-mode: vertical-rl;
  letter-spacing: 0.12em;
  padding: 14px 7px;
  border: 1px solid #4aa3ff;
  border-right: none;
  border-radius: 10px 0 0 10px;
  background: rgb(15 22 30 / 62%);
  color: #e8edf2;
}

.command-panel .body {
  pointer-events: auto;
  width: 260px;
  padding: 12px;
  background: rgb(15 22 30 / 42%);
  backdrop-filter: blur(8px);
  border: 1px solid #2c3644;
  border-right: none;
  border-radius: 10px 0 0 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
  display: grid;
  align-content: start;
  gap: 8px;
  overflow: auto;
}

.command-panel h2 {
  margin: 0;
  font-size: 15px;
}

.command-panel .hint,
.command-panel p {
  margin: 0;
  color: #b7c2ce;
  font-size: 13px;
}

.command-panel .body button {
  padding: 8px;
  border: 1px solid #3d4b5c;
  background: rgb(29 38 50 / 72%);
  color: #e8edf2;
  text-align: left;
  display: grid;
  gap: 2px;
}

.command-panel .body button small {
  color: #9aabbc;
  font-size: 12px;
}

.command-panel .body button.short small {
  color: #f0a3a3;
}
</style>

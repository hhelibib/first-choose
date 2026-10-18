<script setup lang="ts">
import { computed } from 'vue'
import { BUILDING_TYPE_IDS, useMatchStore } from '../store/match'
import { canAfford, formatDuration, formatResources } from '../format/resources'
import EntityCard from './EntityCard.vue'

const store = useMatchStore()

const commands = computed(() => store.config?.units[store.selectedUnit?.typeId ?? '']?.commands ?? [])
const recipes = computed(() => store.config?.buildings[store.selectedBuilding?.typeId ?? '']?.production ?? [])
const canAct = computed(() => store.isOperation && !!store.selected)

const barracks = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.barracks] ?? null)
const arrowTower = computed(() => store.config?.buildings[BUILDING_TYPE_IDS.arrowTower] ?? null)
const placing = computed(() => (store.mode === 'build' && store.buildTypeId ? store.config?.buildings[store.buildTypeId] : null))
const repair = computed(() => store.config?.repair ?? null)

function unitName(typeId: string): string {
  return store.config?.units[typeId]?.name ?? typeId
}

function recipeHint(typeId: string, cost: { wood: number; ore: number; gold: number }, timeMs: number): string {
  const pop = store.config?.units[typeId]?.population ?? 0
  const parts = [formatResources(cost), formatDuration(timeMs)]
  if (pop > 0) {
    parts.push(`人口 ${pop}`)
  }
  return parts.join(' · ')
}

function buildHint(cost: { wood: number; ore: number; gold: number }, timeMs: number): string {
  return `${formatResources(cost)} · ${formatDuration(timeMs)}`
}

function shortOn(cost: { wood: number; ore: number; gold: number }): boolean {
  return !canAfford(store.player?.resources, cost)
}
</script>

<template>
  <aside class="command-panel">
    <h2>资料</h2>
    <p v-if="!store.selected" class="hint">单击己方单位或建筑。右键地面移动，右键敌人攻击，右键资源点采集。</p>
    <EntityCard />
    <h2 v-if="store.selected">指令</h2>
    <p v-if="placing" class="hint">点击空地放置{{ placing.name }}（{{ buildHint(placing.buildCost, placing.buildTimeMs) }}）。资源在工人开始建造时扣除。</p>
    <p v-else-if="store.mode === 'repair' && repair" class="hint">点击己方建筑维修：每 {{ formatDuration(repair.intervalMs) }}消耗矿 {{ repair.oreCost }}，回复 {{ repair.heal }} 生命。</p>
    <template v-if="store.selectedUnit">
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
      <p v-if="recipes.length === 0" class="hint">这座建筑不能生产单位。</p>
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
      <button type="button" :disabled="!canAct" @click="store.sendClear()">停止生产</button>
    </template>
  </aside>
</template>

<style>
.command-panel {
  width: 280px;
  padding: 12px;
  background: #151b24;
  border-left: 1px solid #2c3644;
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

.command-panel button {
  padding: 8px;
  border: 1px solid #3d4b5c;
  background: #1d2632;
  color: #e8edf2;
  text-align: left;
  display: grid;
  gap: 2px;
}

.command-panel button small {
  color: #9aabbc;
  font-size: 12px;
}

.command-panel button.short small {
  color: #f0a3a3;
}
</style>

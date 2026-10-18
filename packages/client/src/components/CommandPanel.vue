<script setup lang="ts">
import { computed } from 'vue'
import { BUILDING_TYPE_IDS, UNIT_TYPE_IDS, useMatchStore } from '../store/match'
import EntityCard from './EntityCard.vue'

const store = useMatchStore()

const commands = computed(() => store.config?.units[store.selectedUnit?.typeId ?? '']?.commands ?? [])
const recipes = computed(() => store.config?.buildings[store.selectedBuilding?.typeId ?? '']?.production ?? [])
const canAct = computed(() => store.isOperation && !!store.selected)
</script>

<template>
  <aside class="command-panel">
    <h2>资料</h2>
    <p v-if="!store.selected" class="hint">单击己方单位或建筑。右键地面移动，右键敌人攻击，右键资源点采集。</p>
    <EntityCard />
    <h2 v-if="store.selected">指令</h2>
    <template v-if="store.selectedUnit">
      <button v-if="commands.includes('BUILD')" type="button" :disabled="!canAct" @click="store.beginBuild(BUILDING_TYPE_IDS.barracks)">建造兵营</button>
      <button v-if="commands.includes('BUILD')" type="button" :disabled="!canAct" @click="store.beginBuild(BUILDING_TYPE_IDS.arrowTower)">建造箭塔</button>
      <button v-if="commands.includes('PATROL')" type="button" :disabled="!canAct" @click="store.beginPatrol()">巡逻（点两格）</button>
      <button v-if="commands.includes('REPAIR')" type="button" :disabled="!canAct" @click="store.beginRepair()">维修建筑</button>
      <button type="button" :disabled="!canAct" @click="store.sendClear()">停止</button>
    </template>
    <template v-else-if="store.selectedBuilding">
      <button
        v-for="recipe in recipes"
        :key="recipe.unitTypeId"
        type="button"
        :disabled="!canAct"
        @click="store.produce(recipe.unitTypeId)"
      >
        生产{{ recipe.unitTypeId === UNIT_TYPE_IDS.worker ? '工人' : '战斗单位' }}
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
}
</style>

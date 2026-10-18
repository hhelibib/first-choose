<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore } from '../store/match'
import { formatDuration, formatResources } from '../format/resources'

const store = useMatchStore()

const unitDef = computed(() => store.config?.units[store.selectedUnit?.typeId ?? ''] ?? null)
const buildingDef = computed(() => store.config?.buildings[store.selectedBuilding?.typeId ?? ''] ?? null)
const hasBuildCost = computed(() => {
  const cost = buildingDef.value?.buildCost
  return !!cost && (cost.wood > 0 || cost.ore > 0 || cost.gold > 0)
})

function commandLabel(type: string | undefined): string {
  switch (type) {
    case 'MOVE':
      return '移动'
    case 'ATTACK':
      return '攻击'
    case 'PATROL':
      return '巡逻'
    case 'GATHER':
      return '采集'
    case 'BUILD':
      return '建造'
    case 'REPAIR':
      return '维修'
    case 'PRODUCE':
      return '生产'
    default:
      return '空闲'
  }
}
</script>

<template>
  <section v-if="store.selectedUnit && unitDef" class="entity-card">
    <h3>{{ unitDef.name }}</h3>
    <p class="blurb">{{ unitDef.description }}</p>
    <dl>
      <div>
        <dt>生命</dt>
        <dd>{{ store.selectedUnit.hp }} / {{ store.selectedUnit.maxHp }}</dd>
      </div>
      <div>
        <dt>移动</dt>
        <dd>{{ store.selectedUnit.moveRemaining }} / {{ unitDef.moveRange }} 格</dd>
      </div>
      <div>
        <dt>移速</dt>
        <dd>{{ unitDef.moveMsPerCell }}ms / 格</dd>
      </div>
      <div v-if="unitDef.attack > 0">
        <dt>攻击</dt>
        <dd>{{ unitDef.attack }}</dd>
      </div>
      <div v-if="unitDef.armor > 0 || unitDef.attack > 0">
        <dt>护甲</dt>
        <dd>{{ unitDef.armor }}</dd>
      </div>
      <div v-if="unitDef.attackRange > 0">
        <dt>射程</dt>
        <dd>{{ unitDef.attackRange }}</dd>
      </div>
      <div v-if="unitDef.carryCapacity > 0">
        <dt>携带</dt>
        <dd>
          {{ store.selectedUnit.carry ? `${store.selectedUnit.carry.amount}/${unitDef.carryCapacity}` : `0 / ${unitDef.carryCapacity}` }}
        </dd>
      </div>
      <div>
        <dt>指令</dt>
        <dd>{{ commandLabel(store.selectedUnit.command?.type) }}</dd>
      </div>
    </dl>
  </section>
  <section v-else-if="store.selectedBuilding && buildingDef" class="entity-card">
    <h3>{{ buildingDef.name }}</h3>
    <p class="blurb">{{ buildingDef.description }}</p>
    <dl>
      <div>
        <dt>生命</dt>
        <dd>{{ store.selectedBuilding.hp }} / {{ store.selectedBuilding.maxHp }}</dd>
      </div>
      <div>
        <dt>占地</dt>
        <dd>{{ buildingDef.size.w }} × {{ buildingDef.size.h }}</dd>
      </div>
      <div v-if="buildingDef.attack > 0">
        <dt>攻击</dt>
        <dd>{{ buildingDef.attack }}</dd>
      </div>
      <div v-if="buildingDef.attackRange > 0">
        <dt>射程</dt>
        <dd>{{ buildingDef.attackRange }}</dd>
      </div>
      <div>
        <dt>状态</dt>
        <dd>{{ store.selectedBuilding.state === 'CONSTRUCTING' ? '建造中' : commandLabel(store.selectedBuilding.command?.type) }}</dd>
      </div>
      <div v-if="hasBuildCost">
        <dt>造价</dt>
        <dd>{{ formatResources(buildingDef.buildCost) }} · {{ formatDuration(buildingDef.buildTimeMs) }}</dd>
      </div>
      <div v-if="buildingDef.harvest">
        <dt>产出</dt>
        <dd>
          {{ buildingDef.harvest.resource === 'ore' ? '矿石' : buildingDef.harvest.resource === 'gold' ? '金' : '木材' }}
          {{ buildingDef.harvest.amount }} / {{ formatDuration(buildingDef.harvest.intervalMs) }}
        </dd>
      </div>
      <div v-for="recipe in buildingDef.production" :key="recipe.unitTypeId">
        <dt>生产</dt>
        <dd>
          {{ store.config?.units[recipe.unitTypeId]?.name ?? recipe.unitTypeId }}
          · {{ formatResources(recipe.cost) }}
          · {{ formatDuration(recipe.timeMs) }}
        </dd>
      </div>
    </dl>
  </section>
</template>

<style>
.entity-card {
  padding: 10px;
  border: 1px solid #314051;
  background: #1a222d;
  display: grid;
  gap: 8px;
}

.entity-card h3 {
  margin: 0;
  font-size: 15px;
  color: #f2f6fa;
}

.entity-card .blurb {
  margin: 0;
  color: #9aabbc;
  font-size: 12px;
  line-height: 1.45;
}

.entity-card dl {
  margin: 0;
  display: grid;
  gap: 4px;
}

.entity-card dl div {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 8px;
  font-size: 12px;
}

.entity-card dt {
  color: #7f90a3;
}

.entity-card dd {
  margin: 0;
  color: #e8edf2;
}
</style>

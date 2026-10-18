<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore } from '../store/match'
import { formatDuration, formatResources, resourceFull } from '../format/resources'
import { buildingDesc, buildingName, commandName, t, unitDesc, unitName } from '../i18n/index'

const store = useMatchStore()

const unitDef = computed(() => store.config?.units[store.selectedUnit?.typeId ?? ''] ?? null)
const buildingDef = computed(() => store.config?.buildings[store.selectedBuilding?.typeId ?? ''] ?? null)
const hasBuildCost = computed(() => {
  const cost = buildingDef.value?.buildCost
  return !!cost && (cost.wood > 0 || cost.ore > 0 || cost.gold > 0)
})

function commandLabel(type: string | undefined): string {
  return commandName(type)
}
</script>

<template>
  <section v-if="store.selectedUnit && unitDef" class="entity-card">
    <h3>{{ unitName(store.selectedUnit.typeId, unitDef.name) }}</h3>
    <p class="blurb">{{ unitDesc(store.selectedUnit.typeId, unitDef.description) }}</p>
    <dl>
      <div>
        <dt>{{ t('inspect.hp') }}</dt>
        <dd>{{ store.selectedUnit.hp }} / {{ store.selectedUnit.maxHp || unitDef.hp }}</dd>
      </div>
      <div>
        <dt>{{ t('inspect.move') }}</dt>
        <dd>{{ t('inspect.moveCells', { cur: store.selectedUnit.moveRemaining, max: unitDef.moveRange }) }}</dd>
      </div>
      <div>
        <dt>{{ t('inspect.speed') }}</dt>
        <dd>{{ t('inspect.speedVal', { ms: unitDef.moveMsPerCell }) }}</dd>
      </div>
      <div v-if="unitDef.attack > 0">
        <dt>{{ t('inspect.attack') }}</dt>
        <dd>{{ unitDef.attack }}</dd>
      </div>
      <div v-if="unitDef.armor > 0 || unitDef.attack > 0">
        <dt>{{ t('inspect.armor') }}</dt>
        <dd>{{ unitDef.armor }}</dd>
      </div>
      <div v-if="unitDef.attackRange > 0">
        <dt>{{ t('inspect.range') }}</dt>
        <dd>{{ unitDef.attackRange }}</dd>
      </div>
      <div v-if="unitDef.carryCapacity > 0">
        <dt>{{ t('inspect.carry') }}</dt>
        <dd>
          {{ store.selectedUnit.carry ? `${store.selectedUnit.carry.amount}/${unitDef.carryCapacity}` : `0 / ${unitDef.carryCapacity}` }}
        </dd>
      </div>
      <div>
        <dt>{{ t('inspect.command') }}</dt>
        <dd>{{ commandLabel(store.selectedUnit.command?.type) }}</dd>
      </div>
    </dl>
  </section>
  <section v-else-if="store.selectedBuilding && buildingDef" class="entity-card">
    <h3>{{ buildingName(store.selectedBuilding.typeId, buildingDef.name) }}</h3>
    <p class="blurb">{{ buildingDesc(store.selectedBuilding.typeId, buildingDef.description) }}</p>
    <dl>
      <div>
        <dt>{{ t('inspect.hp') }}</dt>
        <dd>{{ store.selectedBuilding.hp }} / {{ store.selectedBuilding.maxHp }}</dd>
      </div>
      <div>
        <dt>{{ t('inspect.footprint') }}</dt>
        <dd>{{ buildingDef.size.w }} × {{ buildingDef.size.h }}</dd>
      </div>
      <div v-if="buildingDef.attack > 0">
        <dt>{{ t('inspect.attack') }}</dt>
        <dd>{{ buildingDef.attack }}</dd>
      </div>
      <div v-if="buildingDef.attackRange > 0">
        <dt>{{ t('inspect.range') }}</dt>
        <dd>{{ buildingDef.attackRange }}</dd>
      </div>
      <div>
        <dt>{{ t('inspect.state') }}</dt>
        <dd>{{ store.selectedBuilding.state === 'CONSTRUCTING' ? t('inspect.building') : commandLabel(store.selectedBuilding.command?.type) }}</dd>
      </div>
      <div v-if="hasBuildCost">
        <dt>{{ t('inspect.cost') }}</dt>
        <dd>{{ formatResources(buildingDef.buildCost) }} · {{ formatDuration(buildingDef.buildTimeMs) }}</dd>
      </div>
      <div v-if="buildingDef.harvest">
        <dt>{{ t('inspect.output') }}</dt>
        <dd>
          {{ resourceFull(buildingDef.harvest.resource) }}
          {{ buildingDef.harvest.amount }} / {{ formatDuration(buildingDef.harvest.intervalMs) }}
        </dd>
      </div>
      <div v-for="recipe in buildingDef.production" :key="recipe.unitTypeId">
        <dt>{{ t('inspect.produce') }}</dt>
        <dd>
          {{ unitName(recipe.unitTypeId, store.config?.units[recipe.unitTypeId]?.name) }}
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

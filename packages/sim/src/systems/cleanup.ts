/**
 * 收尾：删除死亡单位与摧毁建筑、释放占地、递减 buff。
 * 必须在 tick 开头调用，避免死亡实体继续占格。
 */
import type { GameState } from '@battle/shared'
import { sortedIds } from '../world/grid.js'
import { releaseBuilding, releaseUnit } from '../world/occupancy.js'
import { refund } from '../world/resources.js'
import { refreshPopulation } from '../engine/state.js'
import { cancelOrphanedConstruction } from './build.js'

export function cleanupDead(state: GameState): void {
  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (unit?.state === 'DEAD') {
      releaseUnit(state.occupancy, unit)
      delete state.units[unitId]
    }
  }
  cancelOrphanedConstruction(state)
  for (const buildingId of sortedIds(Object.keys(state.buildings))) {
    const building = state.buildings[buildingId]
    if (building?.state === 'DESTROYED') {
      if (building.builderId) {
        const def = state.config.buildings[building.typeId]
        const player = state.players[building.ownerId]
        if (def && player) {
          refund(player.resources, def.buildCost)
        }
      }
      releaseBuilding(state.occupancy, building)
      delete state.buildings[buildingId]
    }
  }
  refreshPopulation(state)
}

export function tickBuffs(state: GameState): void {
  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (!unit) {
      continue
    }
    unit.buffs = unit.buffs
      .map((buff) => ({ ...buff, remainingTicks: buff.remainingTicks - 1 }))
      .filter((buff) => buff.remainingTicks > 0)
  }
  state.effects = state.effects
    .map((effect) => ({ ...effect, remainingTicks: effect.remainingTicks - 1 }))
    .filter((effect) => {
      if (effect.remainingTicks <= 0) {
        return false
      }
      if (effect.target.kind === 'unit') {
        const unit = state.units[effect.target.id]
        return !!unit && unit.state !== 'DEAD'
      }
      return true
    })
}

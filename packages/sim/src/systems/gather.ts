/**
 * 资源产出。资源建筑完工后按间隔自动加资源，不再使用地图资源点和工人采集。
 */
import { TICK_MS } from '@battle/shared'
import type { DomainEvent, GameState, GridPos, Unit } from '@battle/shared'
import { idleUnit } from '../commands/index.js'
import { resourceGathered } from '../engine/events.js'
import { sortedIds } from '../world/grid.js'

/** 旧 GATHER 指令不再寻路，就地清空。 */
export function gatherMoveDest(_state: GameState, unit: Unit): GridPos | null {
  if (unit.command?.type === 'GATHER') {
    idleUnit(unit)
  }
  return null
}

export function processGather(state: GameState, events: DomainEvent[]): void {
  for (const buildingId of sortedIds(Object.keys(state.buildings))) {
    const building = state.buildings[buildingId]
    if (!building || building.state !== 'ACTIVE') {
      continue
    }
    const harvest = state.config.buildings[building.typeId]?.harvest
    const player = state.players[building.ownerId]
    if (!harvest || !player) {
      continue
    }
    building.harvestProgressMs += TICK_MS
    if (building.harvestProgressMs < harvest.intervalMs) {
      continue
    }
    building.harvestProgressMs -= harvest.intervalMs
    player.resources[harvest.resource] += harvest.amount
    player.stats.resourcesGathered += harvest.amount
    events.push(resourceGathered(player.id, harvest.resource, harvest.amount))
  }
}

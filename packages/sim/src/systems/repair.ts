/**
 * 维修系统。只修己方建筑，矿石不足或满血后停止。工人不修单位。
 */
import { TICK_MS } from '@battle/shared'
import type { GameState, GridPos, Unit } from '@battle/shared'
import { idleUnit } from '../commands/index.js'
import { alreadyAdjacent, approachCell, entityCells } from '../engine/entities.js'
import { sortedIds } from '../world/grid.js'
import { canPay, pay } from '../world/resources.js'

export function repairMoveDest(state: GameState, unit: Unit): GridPos | null {
  if (unit.command?.type !== 'REPAIR') {
    return null
  }
  const building = state.buildings[unit.command.target.id]
  if (!building || building.state === 'DESTROYED' || building.ownerId !== unit.ownerId) {
    idleUnit(unit)
    return null
  }
  if (building.hp >= building.maxHp) {
    idleUnit(unit)
    return null
  }
  const cells = entityCells(state, { kind: 'building', id: building.id })
  if (alreadyAdjacent(unit, cells, state.map.width, state.map.height)) {
    return null
  }
  const dest = approachCell(state, unit, cells)
  if (!dest || (dest.x === unit.pos.x && dest.y === unit.pos.y)) {
    return null
  }
  unit.state = 'MOVING'
  return dest
}

export function processRepair(state: GameState): void {
  const repair = state.config.repair
  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (!unit || unit.state === 'DEAD' || unit.command?.type !== 'REPAIR') {
      continue
    }
    const building = state.buildings[unit.command.target.id]
    const player = state.players[unit.ownerId]
    if (!building || building.state === 'DESTROYED' || building.ownerId !== unit.ownerId || !player) {
      idleUnit(unit)
      continue
    }
    if (building.hp >= building.maxHp) {
      idleUnit(unit)
      continue
    }
    if (!alreadyAdjacent(unit, entityCells(state, { kind: 'building', id: building.id }), state.map.width, state.map.height)) {
      continue
    }
    unit.state = 'REPAIRING'
    unit.repairProgressMs += TICK_MS
    if (unit.repairProgressMs < repair.intervalMs) {
      continue
    }
    unit.repairProgressMs = 0
    const cost = { food: 0, wood: 0, stone: 0, ore: repair.oreCost, gold: 0 }
    if (!canPay(player.resources, cost)) {
      idleUnit(unit)
      continue
    }
    pay(player.resources, cost)
    building.hp = Math.min(building.maxHp, building.hp + repair.heal)
    if (building.hp >= building.maxHp) {
      idleUnit(unit)
    }
  }
}

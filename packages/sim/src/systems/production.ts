/**
 * 生产系统。扣费后计时，出口格按北东南西扫建筑邻格。
 * 停止生产退还已扣资源；人口满或资源不足在提交时拒绝。
 */
import { NEIGHBOR_OFFSETS, TICK_MS } from '@battle/shared'
import type { Building, DomainEvent, GameState, GridPos } from '@battle/shared'
import { productionCompleted } from '../engine/events.js'
import { buildingCells, clonePos, inBounds, sortedIds } from '../world/grid.js'
import { REJECT } from '../commands/index.js'
import { canPay, pay, refund } from '../world/resources.js'
import { refreshPopulation, spawnOwnedUnit } from '../engine/state.js'

function recipeOf(state: GameState, building: Building, unitTypeId: string) {
  return state.config.buildings[building.typeId]?.production.find((recipe) => recipe.unitTypeId === unitTypeId)
}

export function usedPopulation(state: GameState, playerId: string): number {
  let total = 0
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId !== playerId || unit.state === 'DEAD') {
      continue
    }
    total += state.config.units[unit.typeId]?.population ?? 0
  }
  for (const building of Object.values(state.buildings)) {
    if (building.ownerId !== playerId || building.command?.type !== 'PRODUCE' || building.productionRemainingMs <= 0) {
      continue
    }
    total += state.config.units[building.command.unitTypeId]?.population ?? 0
  }
  return total
}

export function cancelProduction(state: GameState, building: Building): void {
  if (building.command?.type !== 'PRODUCE' || building.productionRemainingMs <= 0) {
    building.productionRemainingMs = 0
    return
  }
  const recipe = recipeOf(state, building, building.command.unitTypeId)
  const player = state.players[building.ownerId]
  if (recipe && player) {
    refund(player.resources, recipe.cost)
  }
  building.productionRemainingMs = 0
  refreshPopulation(state)
}

export function findExitCell(state: GameState, building: Building): GridPos | null {
  const occupied = new Set(buildingCells(building.origin, building.size).map((pos) => `${pos.x},${pos.y}`))
  for (const offset of NEIGHBOR_OFFSETS) {
    for (let dy = 0; dy < building.size.h; dy += 1) {
      for (let dx = 0; dx < building.size.w; dx += 1) {
        const pos = { x: building.origin.x + dx + offset.x, y: building.origin.y + dy + offset.y }
        if (occupied.has(`${pos.x},${pos.y}`) || !inBounds(state.map.width, state.map.height, pos)) {
          continue
        }
        const cell = state.occupancy.cells[pos.y]?.[pos.x]
        if (!cell || cell.terrainBlocked || cell.buildingId || cell.unitId) {
          continue
        }
        return pos
      }
    }
  }
  return null
}

export function startProduction(state: GameState, building: Building, unitTypeId: string): { ok: boolean; reason?: string } {
  if (building.state !== 'ACTIVE') {
    return { ok: false, reason: REJECT.BUILDING_NOT_READY }
  }
  const recipe = recipeOf(state, building, unitTypeId)
  const player = state.players[building.ownerId]
  const unitDef = state.config.units[unitTypeId]
  if (!recipe || !player || !unitDef) {
    return { ok: false, reason: REJECT.COMMAND_NOT_ALLOWED }
  }
  if (!canPay(player.resources, recipe.cost)) {
    return { ok: false, reason: REJECT.NOT_ENOUGH_RESOURCES }
  }
  let used = usedPopulation(state, player.id)
  if (building.command?.type === 'PRODUCE' && building.productionRemainingMs > 0) {
    used -= state.config.units[building.command.unitTypeId]?.population ?? 0
  }
  if (used + unitDef.population > player.populationCap) {
    return { ok: false, reason: REJECT.POPULATION_CAP }
  }
  if (building.command?.type === 'PRODUCE') {
    cancelProduction(state, building)
  }
  pay(player.resources, recipe.cost)
  building.command = { type: 'PRODUCE', unitTypeId }
  building.productionRemainingMs = recipe.timeMs
  refreshPopulation(state)
  return { ok: true }
}

export function processProduction(state: GameState, events: DomainEvent[]): void {
  for (const buildingId of sortedIds(Object.keys(state.buildings))) {
    const building = state.buildings[buildingId]
    if (!building || building.state !== 'ACTIVE' || building.command?.type !== 'PRODUCE') {
      continue
    }
    if (building.productionRemainingMs <= 0) {
      continue
    }
    const exit = findExitCell(state, building)
    if (!exit) {
      continue
    }
    building.productionRemainingMs = Math.max(0, building.productionRemainingMs - TICK_MS)
    if (building.productionRemainingMs > 0) {
      continue
    }
    const unitTypeId = building.command.unitTypeId
    const unit = spawnOwnedUnit(state, building.ownerId, unitTypeId, exit)
    if (!unit) {
      building.productionRemainingMs = TICK_MS
      continue
    }
    building.command = null
    building.productionRemainingMs = 0
    refreshPopulation(state)
    events.push(productionCompleted(building.id, unit.id))
  }
}

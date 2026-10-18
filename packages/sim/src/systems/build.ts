/**
 * 建造系统。工人相邻后扣费占地，建造中途换令会退款并释放占地。
 * 建筑 ID 来自 `buildingSeq`，完成后才变为 ACTIVE。
 */
import { TICK_MS } from '@battle/shared'
import type { DomainEvent, GameState, GridPos, Unit } from '@battle/shared'
import { idleUnit } from '../commands/index.js'
import { buildingPlaced } from '../engine/events.js'
import { alreadyAdjacent, approachCell } from '../engine/entities.js'
import { buildingCells, clonePos, sortedIds } from '../world/grid.js'
import { occupyBuilding, plotBlockedByTerrainOrBuilding, plotBlockedByUnit, releaseBuilding, releaseUnit } from '../world/occupancy.js'
import { canPay, pay, refund } from '../world/resources.js'
import { workerConsumed } from '../engine/events.js'
import { refreshPopulation } from '../engine/state.js'

export function cancelConstruction(state: GameState, buildingId: string): void {
  const building = state.buildings[buildingId]
  if (!building || building.state !== 'CONSTRUCTING') {
    return
  }
  const def = state.config.buildings[building.typeId]
  const player = state.players[building.ownerId]
  if (def && player) {
    refund(player.resources, def.buildCost)
  }
  releaseBuilding(state.occupancy, building)
  delete state.buildings[buildingId]
}

export function cancelBuilderConstruction(state: GameState, unitId: string): void {
  for (const buildingId of sortedIds(Object.keys(state.buildings))) {
    const building = state.buildings[buildingId]
    if (building?.builderId === unitId && building.state === 'CONSTRUCTING') {
      cancelConstruction(state, buildingId)
    }
  }
}

export function cancelOrphanedConstruction(state: GameState): void {
  for (const buildingId of sortedIds(Object.keys(state.buildings))) {
    const building = state.buildings[buildingId]
    if (!building || building.state !== 'CONSTRUCTING') {
      continue
    }
    const builder = building.builderId ? state.units[building.builderId] : undefined
    const stillBuilding =
      builder &&
      builder.state !== 'DEAD' &&
      builder.command?.type === 'BUILD' &&
      builder.command.buildingTypeId === building.typeId &&
      builder.command.origin.x === building.origin.x &&
      builder.command.origin.y === building.origin.y
    if (!stillBuilding) {
      cancelConstruction(state, buildingId)
    }
  }
}

function plotCells(state: GameState, unit: Unit): GridPos[] | null {
  if (unit.command?.type !== 'BUILD') {
    return null
  }
  const def = state.config.buildings[unit.command.buildingTypeId]
  if (!def) {
    return null
  }
  return buildingCells(unit.command.origin, def.size)
}

export function buildMoveDest(state: GameState, unit: Unit): GridPos | null {
  const cells = plotCells(state, unit)
  if (!cells) {
    return null
  }
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

function constructingBy(state: GameState, unit: Unit) {
  if (unit.command?.type !== 'BUILD') {
    return undefined
  }
  const origin = unit.command.origin
  const typeId = unit.command.buildingTypeId
  return Object.values(state.buildings).find(
    (building) =>
      building.builderId === unit.id &&
      building.state === 'CONSTRUCTING' &&
      building.typeId === typeId &&
      building.origin.x === origin.x &&
      building.origin.y === origin.y,
  )
}

export function processBuild(state: GameState, events: DomainEvent[]): void {
  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (!unit || unit.state === 'DEAD' || unit.command?.type !== 'BUILD') {
      continue
    }
    const def = state.config.buildings[unit.command.buildingTypeId]
    const player = state.players[unit.ownerId]
    const cells = plotCells(state, unit)
    if (!def || !player || !cells) {
      idleUnit(unit)
      continue
    }
    let building = constructingBy(state, unit)
    if (!building) {
      if (!alreadyAdjacent(unit, cells, state.map.width, state.map.height)) {
        continue
      }
      if (plotBlockedByTerrainOrBuilding(state.occupancy, unit.command.origin, def.size)) {
        idleUnit(unit)
        continue
      }
      if (plotBlockedByUnit(state.occupancy, unit.command.origin, def.size)) {
        unit.state = 'BUILDING'
        continue
      }
      if (!canPay(player.resources, def.buildCost)) {
        idleUnit(unit)
        continue
      }
      pay(player.resources, def.buildCost)
      building = {
        id: `b${state.buildingSeq}`,
        ownerId: unit.ownerId,
        typeId: def.id,
        role: def.role,
        origin: clonePos(unit.command.origin),
        size: { ...def.size },
        hp: def.hp,
        maxHp: def.hp,
        state: 'CONSTRUCTING',
        buildProgressMs: 0,
        command: null,
        cooldownMs: 0,
        builderId: unit.id,
        productionRemainingMs: 0,
        harvestProgressMs: 0,
      }
      if (!occupyBuilding(state.occupancy, building)) {
        refund(player.resources, def.buildCost)
        idleUnit(unit)
        continue
      }
      state.buildingSeq += 1
      state.buildings[building.id] = building
      events.push(buildingPlaced(building.id))
    }
    if (!alreadyAdjacent(unit, cells, state.map.width, state.map.height)) {
      continue
    }
    unit.state = 'BUILDING'
    building.buildProgressMs += TICK_MS
    unit.buildProgressMs = building.buildProgressMs
    if (building.buildProgressMs >= def.buildTimeMs) {
      building.state = 'ACTIVE'
      building.builderId = null
      if (def.harvest) {
        consumeBuilder(state, unit, building.id, events)
      } else {
        idleUnit(unit)
      }
    }
  }
}

function consumeBuilder(state: GameState, unit: Unit, buildingId: string, events: DomainEvent[]): void {
  releaseUnit(state.occupancy, unit)
  unit.state = 'DEAD'
  unit.command = null
  unit.path = []
  events.push(workerConsumed(unit.id, buildingId))
  refreshPopulation(state)
}

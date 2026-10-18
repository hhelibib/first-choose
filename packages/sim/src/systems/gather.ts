/**
 * 采集系统。工人满载或资源点耗尽后送回己方 ACTIVE 主基地。
 * 卸货建筑按曼哈顿距离，平局取建筑 ID 较小者。
 */
import { TICK_MS } from '@battle/shared'
import type { Building, DomainEvent, GameState, GridPos, ResourceNode, Unit } from '@battle/shared'
import { idleUnit } from '../commands/index.js'
import { resourceGathered } from '../engine/events.js'
import { alreadyAdjacent, approachCell, entityCells } from '../engine/entities.js'
import { buildingCells, manhattan, sortedIds } from '../world/grid.js'

function nodeOf(state: GameState, id: string): ResourceNode | undefined {
  return state.map.resourceNodes.find((node) => node.id === id)
}

function carryAmount(unit: Unit): number {
  return unit.carry?.amount ?? 0
}

function carryFull(state: GameState, unit: Unit): boolean {
  const cap = state.config.units[unit.typeId]?.carryCapacity ?? 0
  return cap > 0 && carryAmount(unit) >= cap
}

function nearestDropoff(state: GameState, unit: Unit): Building | null {
  const candidates = sortedIds(Object.keys(state.buildings))
    .map((id) => state.buildings[id])
    .filter((building): building is Building => !!building)
    .filter((building) => building.ownerId === unit.ownerId && building.role === 'MAIN_BASE' && building.state === 'ACTIVE')
  candidates.sort((a, b) => {
    const da = Math.min(...buildingCells(a.origin, a.size).map((cell) => manhattan(unit.pos, cell)))
    const db = Math.min(...buildingCells(b.origin, b.size).map((cell) => manhattan(unit.pos, cell)))
    if (da !== db) {
      return da - db
    }
    return a.id < b.id ? -1 : 1
  })
  return candidates[0] ?? null
}

function shouldReturn(state: GameState, unit: Unit, node: ResourceNode | undefined): boolean {
  if (carryAmount(unit) <= 0) {
    return false
  }
  return carryFull(state, unit) || !node || node.remaining <= 0
}

export function gatherMoveDest(state: GameState, unit: Unit): GridPos | null {
  if (unit.command?.type !== 'GATHER') {
    return null
  }
  const node = nodeOf(state, unit.command.resourceNodeId)
  if (shouldReturn(state, unit, node)) {
    const dropoff = nearestDropoff(state, unit)
    if (!dropoff) {
      unit.state = 'RETURNING'
      return null
    }
    const dest = approachCell(state, unit, entityCells(state, { kind: 'building', id: dropoff.id }))
    if (!dest || (dest.x === unit.pos.x && dest.y === unit.pos.y)) {
      return null
    }
    unit.state = 'RETURNING'
    return dest
  }
  if (!node || node.remaining <= 0) {
    if (carryAmount(unit) <= 0) {
      idleUnit(unit)
    }
    return null
  }
  if (alreadyAdjacent(unit, [node.pos], state.map.width, state.map.height)) {
    return null
  }
  const dest = approachCell(state, unit, [node.pos])
  if (!dest || (dest.x === unit.pos.x && dest.y === unit.pos.y)) {
    return null
  }
  unit.state = 'MOVING'
  return dest
}

/** 相邻资源点采集，相邻主基地卸货。资源点耗尽且无携带则清空指令。 */
export function processGather(state: GameState, events: DomainEvent[]): void {
  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (!unit || unit.state === 'DEAD' || unit.command?.type !== 'GATHER') {
      continue
    }
    const node = nodeOf(state, unit.command.resourceNodeId)
    const dropoff = nearestDropoff(state, unit)
    if (dropoff && carryAmount(unit) > 0 && alreadyAdjacent(unit, entityCells(state, { kind: 'building', id: dropoff.id }), state.map.width, state.map.height)) {
      const player = state.players[unit.ownerId]
      const resource = unit.carry?.resource
      const amount = carryAmount(unit)
      if (player && resource && amount > 0) {
        player.resources[resource] += amount
        player.stats.resourcesGathered += amount
        events.push(resourceGathered(player.id, resource, amount))
      }
      delete unit.carry
      unit.gatherProgressMs = 0
      if (!node || node.remaining <= 0) {
        idleUnit(unit)
      } else {
        unit.state = 'GATHERING'
      }
      continue
    }
    if (shouldReturn(state, unit, node)) {
      unit.state = 'RETURNING'
      continue
    }
    if (!node || node.remaining <= 0) {
      if (carryAmount(unit) <= 0) {
        idleUnit(unit)
      }
      continue
    }
    if (!alreadyAdjacent(unit, [node.pos], state.map.width, state.map.height)) {
      continue
    }
    const def = state.config.units[unit.typeId]
    if (!def) {
      continue
    }
    unit.state = 'GATHERING'
    unit.gatherProgressMs += TICK_MS
    if (unit.gatherProgressMs < def.gatherMs) {
      continue
    }
    unit.gatherProgressMs = 0
    const room = def.carryCapacity - carryAmount(unit)
    const take = Math.min(room, node.remaining)
    if (take <= 0) {
      continue
    }
    node.remaining -= take
    unit.carry = { resource: node.resource, amount: carryAmount(unit) + take }
  }
}

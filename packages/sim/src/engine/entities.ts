/**
 * 实体查询：阵营、射程、邻格接近点。
 * 接近格平局取曼哈顿更近，再按格子坐标字典序。
 */
import { NEIGHBOR_OFFSETS } from '@battle/shared'
import type { Building, EntityRef, GameState, GridPos, Unit } from '@battle/shared'
import { buildingCells, chebyshev, clonePos, inBounds, posKey, samePos } from '../world/grid.js'
import { isStandable } from '../world/occupancy.js'

export function sameRef(a: EntityRef, b: EntityRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

export function unitRef(id: string): EntityRef {
  return { kind: 'unit', id }
}

export function buildingRef(id: string): EntityRef {
  return { kind: 'building', id }
}

export function entityCells(state: GameState, ref: EntityRef): GridPos[] {
  if (ref.kind === 'unit') {
    const unit = state.units[ref.id]
    return unit ? [clonePos(unit.pos)] : []
  }
  const building = state.buildings[ref.id]
  return building ? buildingCells(building.origin, building.size) : []
}

export function rangeBetween(state: GameState, from: EntityRef, to: EntityRef): number {
  const fromCells = entityCells(state, from)
  const toCells = entityCells(state, to)
  let best = Number.POSITIVE_INFINITY
  for (const a of fromCells) {
    for (const b of toCells) {
      best = Math.min(best, chebyshev(a, b))
    }
  }
  return best
}

export function ownerIdOf(state: GameState, ref: EntityRef): string | null {
  if (ref.kind === 'unit') {
    return state.units[ref.id]?.ownerId ?? null
  }
  return state.buildings[ref.id]?.ownerId ?? null
}

export function isEnemy(state: GameState, attacker: EntityRef, target: EntityRef): boolean {
  const left = ownerIdOf(state, attacker)
  const right = ownerIdOf(state, target)
  if (!left || !right || left === right) {
    return false
  }
  const leftTeam = state.players[left]?.teamId
  const rightTeam = state.players[right]?.teamId
  return leftTeam !== rightTeam
}

export function isTargetAlive(state: GameState, ref: EntityRef): boolean {
  if (ref.kind === 'unit') {
    const unit = state.units[ref.id]
    return !!unit && unit.state !== 'DEAD'
  }
  const building = state.buildings[ref.id]
  return !!building && building.state !== 'DESTROYED'
}

export function adjacentCells(width: number, height: number, cells: GridPos[]): GridPos[] {
  const occupied = new Set(cells.map(posKey))
  const result: GridPos[] = []
  const seen = new Set<string>()
  for (const cell of cells) {
    for (const offset of NEIGHBOR_OFFSETS) {
      const pos = { x: cell.x + offset.x, y: cell.y + offset.y }
      const key = posKey(pos)
      if (!inBounds(width, height, pos) || occupied.has(key) || seen.has(key)) {
        continue
      }
      seen.add(key)
      result.push(pos)
    }
  }
  return result
}

export function alreadyAdjacent(unit: Unit, targetCells: GridPos[], width: number, height: number): boolean {
  return adjacentCells(width, height, targetCells).some((pos) => samePos(pos, unit.pos))
}

export function approachCell(state: GameState, unit: Unit, targetCells: GridPos[]): GridPos | null {
  const options = adjacentCells(state.map.width, state.map.height, targetCells).filter(
    (pos) =>
      samePos(pos, unit.pos) ||
      isStandable(state.occupancy, pos, { ignoreUnitId: unit.id, allowUnitAtDest: true, dest: pos }),
  )
  if (options.length === 0) {
    return null
  }
  if (options.some((pos) => samePos(pos, unit.pos))) {
    return clonePos(unit.pos)
  }
  options.sort((a, b) => {
    const da = Math.abs(a.x - unit.pos.x) + Math.abs(a.y - unit.pos.y)
    const db = Math.abs(b.x - unit.pos.x) + Math.abs(b.y - unit.pos.y)
    if (da !== db) {
      return da - db
    }
    return posKey(a) < posKey(b) ? -1 : 1
  })
  return options[0] ? clonePos(options[0]) : null
}

export function livingUnit(state: GameState, id: string): Unit | null {
  const unit = state.units[id]
  if (!unit || unit.state === 'DEAD') {
    return null
  }
  return unit
}

export function activeBuilding(state: GameState, id: string): Building | null {
  const building = state.buildings[id]
  if (!building || building.state === 'DESTROYED') {
    return null
  }
  return building
}

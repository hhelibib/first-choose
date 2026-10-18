/**
 * 占位网格。单位移动分两段：先全部离开旧格，再按单位 ID 升序进入新格。
 * 同一格竞争时 ID 较小者进入；互换可以同时成功。
 */
import type { Building, GameMap, GridPos, OccupancyGrid, Unit, UnitId } from '@battle/shared'
import { buildingCells, cellAt, clonePos, posKey } from './grid.js'

export function createOccupancy(map: GameMap): OccupancyGrid {
  return {
    cells: map.terrain.map((row) =>
      row.map((terrain) => ({
        terrainBlocked: terrain === 'BLOCKED',
      })),
    ),
  }
}

export function plotBlockedByTerrainOrBuilding(
  grid: OccupancyGrid,
  origin: GridPos,
  size: { w: number; h: number },
): boolean {
  for (const pos of buildingCells(origin, size)) {
    const cell = cellAt(grid, pos)
    if (!cell || cell.terrainBlocked || cell.buildingId) {
      return true
    }
  }
  return false
}

export function plotBlockedByUnit(
  grid: OccupancyGrid,
  origin: GridPos,
  size: { w: number; h: number },
): boolean {
  return buildingCells(origin, size).some((pos) => !!cellAt(grid, pos)?.unitId)
}

export function occupyBuilding(grid: OccupancyGrid, building: Building): boolean {
  const cells = buildingCells(building.origin, building.size)
  for (const pos of cells) {
    const cell = cellAt(grid, pos)
    if (!cell || cell.terrainBlocked || cell.buildingId || cell.unitId) {
      return false
    }
  }
  for (const pos of cells) {
    const cell = cellAt(grid, pos)
    if (cell) {
      cell.buildingId = building.id
    }
  }
  return true
}

export function occupyUnit(grid: OccupancyGrid, unit: Unit): boolean {
  const cell = cellAt(grid, unit.pos)
  if (!cell || cell.terrainBlocked || cell.buildingId || cell.unitId) {
    return false
  }
  cell.unitId = unit.id
  return true
}

export function releaseUnit(grid: OccupancyGrid, unit: Unit): void {
  const cell = cellAt(grid, unit.pos)
  if (cell?.unitId === unit.id) {
    delete cell.unitId
  }
}

export function releaseBuilding(grid: OccupancyGrid, building: Building): void {
  for (const pos of buildingCells(building.origin, building.size)) {
    const cell = cellAt(grid, pos)
    if (cell?.buildingId === building.id) {
      delete cell.buildingId
    }
  }
}

export function isStandable(
  grid: OccupancyGrid,
  pos: { x: number; y: number },
  options: { ignoreUnitId?: UnitId; allowUnitAtDest?: boolean; dest?: { x: number; y: number } } = {},
): boolean {
  const cell = cellAt(grid, pos)
  if (!cell || cell.terrainBlocked || cell.buildingId) {
    return false
  }
  if (!cell.unitId) {
    return true
  }
  if (cell.unitId === options.ignoreUnitId) {
    return true
  }
  if (options.allowUnitAtDest && options.dest && posKey(pos) === posKey(options.dest)) {
    return true
  }
  return false
}

export interface MoveIntent {
  unitId: UnitId
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/**
 * 同时移动：互换可以双方都成功；同一格多名竞争时 ID 较小者进入。
 * 失败者本 tick 不离开原格。
 */
export function resolveMoveIntents(grid: OccupancyGrid, intents: MoveIntent[]): MoveIntent[] {
  const intentOf = new Map(intents.map((intent) => [intent.unitId, intent]))
  const candidates = new Set(intents.map((intent) => intent.unitId))

  let changed = true
  while (changed) {
    changed = false
    const destWinner = new Map<string, string>()
    for (const unitId of [...candidates].sort()) {
      const intent = intentOf.get(unitId)
      if (!intent) {
        continue
      }
      const key = posKey(intent.to)
      if (!destWinner.has(key)) {
        destWinner.set(key, unitId)
      }
    }
    for (const unitId of [...candidates]) {
      const intent = intentOf.get(unitId)
      if (!intent || !canEnter(grid, intent, unitId, candidates, destWinner)) {
        candidates.delete(unitId)
        changed = true
      }
    }
  }

  return intents.filter((intent) => candidates.has(intent.unitId))
}

function canEnter(
  grid: OccupancyGrid,
  intent: MoveIntent,
  unitId: string,
  candidates: Set<string>,
  destWinner: Map<string, string>,
): boolean {
  const cell = cellAt(grid, intent.to)
  if (!cell || cell.terrainBlocked || cell.buildingId) {
    return false
  }
  if (destWinner.get(posKey(intent.to)) !== unitId) {
    return false
  }
  if (cell.unitId && cell.unitId !== unitId && !candidates.has(cell.unitId)) {
    return false
  }
  return true
}

export function applyUnitMove(grid: OccupancyGrid, unit: Unit, to: { x: number; y: number }): void {
  releaseUnit(grid, unit)
  unit.pos = clonePos(to)
  occupyUnit(grid, unit)
}

/**
 * 操作阶段预览：路径、射程、建造占地。只读快照，不写 sim。
 */
import type { Building, GameSnapshot, GridPos, MatchConfig, OccupancyGrid, Unit } from '@battle/shared'
import { findPath, findReachable } from '@battle/sim'

export function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export function buildingCells(origin: GridPos, size: { w: number; h: number }): GridPos[] {
  const cells: GridPos[] = []
  for (let dy = 0; dy < size.h; dy += 1) {
    for (let dx = 0; dx < size.w; dx += 1) {
      cells.push({ x: origin.x + dx, y: origin.y + dy })
    }
  }
  return cells
}

export function entityCells(snapshot: GameSnapshot, unit?: Unit, building?: Building): GridPos[] {
  if (unit) {
    return [{ x: unit.pos.x, y: unit.pos.y }]
  }
  if (building) {
    return buildingCells(building.origin, building.size)
  }
  return []
}

export function previewMovePath(snapshot: GameSnapshot, unit: Unit, dest: GridPos): GridPos[] {
  return findPath(snapshot.occupancy, snapshot.map.width, snapshot.map.height, unit.pos, dest, unit.id)
}

export function previewReachable(snapshot: GameSnapshot, unit: Unit): GridPos[] {
  return findReachable(
    snapshot.occupancy,
    snapshot.map.width,
    snapshot.map.height,
    unit.pos,
    unit.id,
    unit.moveRemaining,
  )
}

export function rangeCells(snapshot: GameSnapshot, fromCells: GridPos[], range: number): GridPos[] {
  const cells: GridPos[] = []
  for (let y = 0; y < snapshot.map.height; y += 1) {
    for (let x = 0; x < snapshot.map.width; x += 1) {
      const pos = { x, y }
      if (fromCells.some((cell) => chebyshev(cell, pos) <= range)) {
        cells.push(pos)
      }
    }
  }
  return cells
}

export function plotValid(occupancy: OccupancyGrid, origin: GridPos, size: { w: number; h: number }, width: number, height: number): boolean {
  const cells = buildingCells(origin, size)
  return cells.every((pos) => {
    if (pos.x < 0 || pos.y < 0 || pos.x >= width || pos.y >= height) {
      return false
    }
    const cell = occupancy.cells[pos.y]?.[pos.x]
    return !!cell && !cell.terrainBlocked && !cell.buildingId
  })
}

export function attackRangeOf(config: MatchConfig, unit: Unit): number {
  return config.units[unit.typeId]?.attackRange ?? 0
}

export function buildingAttackRange(config: MatchConfig, building: Building): number {
  return config.buildings[building.typeId]?.attackRange ?? 0
}

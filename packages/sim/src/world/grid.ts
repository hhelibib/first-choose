/**
 * 格子几何：坐标、边界、曼哈顿/切比雪夫距离、建筑占地展开。
 * 不含占位与寻路策略。
 */
import type { GridPos, OccupancyGrid } from '@battle/shared'

export function clonePos(pos: GridPos): GridPos {
  return { x: pos.x, y: pos.y }
}

export function samePos(a: GridPos, b: GridPos): boolean {
  return a.x === b.x && a.y === b.y
}

export function posKey(pos: GridPos): string {
  return `${pos.x},${pos.y}`
}

export function pathKey(path: GridPos[]): string {
  return path.map(posKey).join(';')
}

export function inBounds(width: number, height: number, pos: GridPos): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < width && pos.y < height
}

export function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

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

export function cellAt(grid: OccupancyGrid, pos: GridPos) {
  return grid.cells[pos.y]?.[pos.x]
}

export function sortedIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

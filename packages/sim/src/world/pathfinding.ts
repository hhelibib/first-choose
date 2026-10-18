/**
 * 确定性 A*。邻居顺序北、东、南、西；同 f/h 时取路径字典序更小者。
 */
import { NEIGHBOR_OFFSETS } from '@battle/shared'
import type { GridPos, OccupancyGrid } from '@battle/shared'
import { clonePos, inBounds, manhattan, pathKey, posKey, samePos } from './grid.js'
import { isStandable } from './occupancy.js'

interface SearchNode {
  pos: GridPos
  g: number
  h: number
  f: number
  path: GridPos[]
}

function better(a: SearchNode, b: SearchNode): boolean {
  if (a.f !== b.f) {
    return a.f < b.f
  }
  if (a.h !== b.h) {
    return a.h < b.h
  }
  return pathKey(a.path) < pathKey(b.path)
}

/** A*，邻居北东南西。同 f/h 时取路径字典序更小的。 */
export function findPath(
  grid: OccupancyGrid,
  width: number,
  height: number,
  from: GridPos,
  to: GridPos,
  moverId: string,
): GridPos[] {
  if (samePos(from, to)) {
    return []
  }
  if (!inBounds(width, height, to) || !isStandable(grid, to, { ignoreUnitId: moverId, allowUnitAtDest: true, dest: to })) {
    return []
  }

  const start: SearchNode = {
    pos: clonePos(from),
    g: 0,
    h: manhattan(from, to),
    f: manhattan(from, to),
    path: [],
  }
  const open = new Map<string, SearchNode>([[posKey(from), start]])
  const closed = new Set<string>()

  while (open.size > 0) {
    let current: SearchNode | undefined
    for (const node of open.values()) {
      if (!current || better(node, current)) {
        current = node
      }
    }
    if (!current) {
      break
    }
    const currentKey = posKey(current.pos)
    open.delete(currentKey)
    if (samePos(current.pos, to)) {
      return current.path.map(clonePos)
    }
    closed.add(currentKey)

    for (const offset of NEIGHBOR_OFFSETS) {
      const next = { x: current.pos.x + offset.x, y: current.pos.y + offset.y }
      if (!inBounds(width, height, next)) {
        continue
      }
      const nextKey = posKey(next)
      if (closed.has(nextKey)) {
        continue
      }
      if (!isStandable(grid, next, { ignoreUnitId: moverId, allowUnitAtDest: true, dest: to })) {
        continue
      }
      const path = [...current.path, clonePos(next)]
      const g = current.g + 1
      const h = manhattan(next, to)
      const candidate: SearchNode = { pos: next, g, h, f: g + h, path }
      const existing = open.get(nextKey)
      if (!existing || better(candidate, existing) || (candidate.f === existing.f && candidate.g < existing.g)) {
        open.set(nextKey, candidate)
      }
    }
  }

  return []
}

/** 本回合还能走到的格子。邻居北东南西，不含起点。 */
export function findReachable(
  grid: OccupancyGrid,
  width: number,
  height: number,
  from: GridPos,
  moverId: string,
  maxSteps: number,
): GridPos[] {
  if (maxSteps <= 0) {
    return []
  }
  const reached: GridPos[] = []
  const seen = new Set<string>([posKey(from)])
  let frontier: GridPos[] = [clonePos(from)]
  for (let step = 0; step < maxSteps; step += 1) {
    const nextFrontier: GridPos[] = []
    for (const pos of frontier) {
      for (const offset of NEIGHBOR_OFFSETS) {
        const next = { x: pos.x + offset.x, y: pos.y + offset.y }
        const key = posKey(next)
        if (seen.has(key) || !inBounds(width, height, next)) {
          continue
        }
        if (!isStandable(grid, next, { ignoreUnitId: moverId })) {
          continue
        }
        seen.add(key)
        const cell = clonePos(next)
        reached.push(cell)
        nextFrontier.push(cell)
      }
    }
    frontier = nextFrontier
  }
  return reached
}

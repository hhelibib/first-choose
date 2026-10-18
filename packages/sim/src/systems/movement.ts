/**
 * 移动系统。按单位 ID 升序收集意图，提交时先离开再进入。
 * 成功走一格消耗 `moveRemaining`；为 0 时本回合不再移动。
 * MOVE 中的单位不在这里索敌；巡逻遇敌时本系统让出移动。
 */
import { TICK_MS } from '@battle/shared'
import type { DomainEvent, GameState, GridPos, Unit } from '@battle/shared'
import { unitMoved } from '../engine/events.js'
import { clonePos, samePos, sortedIds } from '../world/grid.js'
import { occupyUnit, releaseUnit, resolveMoveIntents, type MoveIntent } from '../world/occupancy.js'
import { findPath } from '../world/pathfinding.js'
import { idleUnit } from '../commands/index.js'
import { buildMoveDest } from './build.js'
import { attackMoveDest, hasInRangeAutoTarget } from './combat.js'
import { gatherMoveDest } from './gather.js'
import { repairMoveDest } from './repair.js'

function moveMs(state: GameState, unit: Unit): number {
  return state.config.units[unit.typeId]?.moveMsPerCell ?? 500
}

function destination(state: GameState, unit: Unit): GridPos | null {
  if (unit.command?.type === 'MOVE') {
    return unit.command.to
  }
  if (unit.command?.type === 'ATTACK') {
    return attackMoveDest(state, unit)
  }
  if (unit.command?.type === 'GATHER') {
    return gatherMoveDest(state, unit)
  }
  if (unit.command?.type === 'BUILD') {
    return buildMoveDest(state, unit)
  }
  if (unit.command?.type === 'REPAIR') {
    return repairMoveDest(state, unit)
  }
  if (unit.command?.type === 'PATROL') {
    if (hasInRangeAutoTarget(state, unit)) {
      return null
    }
    return unit.command.points[unit.patrolIndex] ?? unit.command.points[0] ?? null
  }
  return null
}

function completeArrival(unit: Unit): void {
  if (unit.command?.type === 'MOVE') {
    idleUnit(unit)
    return
  }
  if (unit.command?.type === 'PATROL') {
    const points = unit.command.points
    if (points.length === 0) {
      return
    }
    unit.patrolIndex = (unit.patrolIndex + 1) % points.length
    unit.path = []
    unit.state = 'PATROLLING'
  }
}

function ensurePath(state: GameState, unit: Unit, dest: GridPos): void {
  const next = unit.path[0]
  if (next && !samePos(unit.pos, next)) {
    return
  }
  unit.path = findPath(state.occupancy, state.map.width, state.map.height, unit.pos, dest, unit.id)
}

/** 按单位 ID 升序收集本 tick 要进入的下一格；未攒够移动时间则只累加进度。 */
export function collectMoveIntents(state: GameState): MoveIntent[] {
  const intents: MoveIntent[] = []
  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (!unit || unit.state === 'DEAD') {
      continue
    }
    const dest = destination(state, unit)
    if (!dest) {
      continue
    }
    if (samePos(unit.pos, dest)) {
      completeArrival(unit)
      continue
    }
    if (unit.command?.type === 'PATROL') {
      unit.state = 'PATROLLING'
    } else if (unit.command?.type === 'GATHER') {
      unit.state = unit.state === 'RETURNING' ? 'RETURNING' : 'MOVING'
    } else if (unit.command?.type === 'ATTACK') {
      unit.state = 'ATTACKING'
    } else if (unit.command?.type === 'BUILD') {
      unit.state = 'BUILDING'
    } else if (unit.command?.type === 'REPAIR') {
      unit.state = 'REPAIRING'
    } else {
      unit.state = 'MOVING'
    }
    if (unit.moveRemaining <= 0) {
      continue
    }
    ensurePath(state, unit, dest)
    const next = unit.path[0]
    if (!next) {
      continue
    }
    unit.moveProgressMs += TICK_MS
    if (unit.moveProgressMs >= moveMs(state, unit)) {
      intents.push({ unitId: unit.id, from: clonePos(unit.pos), to: clonePos(next) })
    }
  }
  return intents
}

export function commitMoves(state: GameState, intents: MoveIntent[]): DomainEvent[] {
  const events: DomainEvent[] = []
  const successful = resolveMoveIntents(state.occupancy, intents)
  const movingIds = new Set(successful.map((intent) => intent.unitId))

  for (const intent of intents) {
    const unit = state.units[intent.unitId]
    if (unit && !movingIds.has(intent.unitId)) {
      unit.path = []
    }
  }

  for (const intent of successful) {
    const unit = state.units[intent.unitId]
    if (unit) {
      releaseUnit(state.occupancy, unit)
    }
  }
  for (const intent of successful) {
    const unit = state.units[intent.unitId]
    if (!unit) {
      continue
    }
    unit.pos = clonePos(intent.to)
    occupyUnit(state.occupancy, unit)
    unit.path = unit.path.filter((_, index) => index > 0)
    unit.moveProgressMs -= moveMs(state, unit)
    unit.moveRemaining = Math.max(0, unit.moveRemaining - 1)
    events.push(unitMoved(unit.id, intent.from, clonePos(unit.pos)))
    if (samePos(unit.pos, destination(state, unit) ?? unit.pos)) {
      completeArrival(unit)
    }
  }
  return events
}

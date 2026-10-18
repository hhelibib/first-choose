/**
 * 操作阶段指令校验与写入。
 * 非法指令返回原因且不改状态；新指令覆盖旧指令。
 */
import type {
  Building,
  Command,
  EntityRef,
  GameState,
  GridPos,
  Unit,
  UnitCommandType,
} from '@battle/shared'
import { buildingCells, clonePos, inBounds, samePos } from '../world/grid.js'
import { isStandable, plotBlockedByTerrainOrBuilding } from '../world/occupancy.js'

export const REJECT = {
  WRONG_PHASE: '当前阶段不能下达指令',
  WRONG_OWNER: '对象不属于该玩家',
  UNIT_DEAD: '单位已死亡',
  BUILDING_DESTROYED: '建筑已摧毁',
  NOT_FOUND: '目标不存在',
  COMMAND_NOT_ALLOWED: '对象不能执行该指令',
  TARGET_KIND: '指令作用对象类型不正确',
  CELL_INVALID: '格子不可走',
  PATROL_POINTS: '巡逻至少需要两个格子',
  TARGET_INVALID: '目标不合法',
  NOT_ENOUGH_RESOURCES: '资源不足',
  POPULATION_CAP: '人口已满',
  BUILDING_NOT_READY: '建筑尚未完工',
  ENERGY: '能量不足',
  CARD_NOT_IN_HAND: '卡牌不在手牌中',
  CARD_NOT_READY: '卡牌结算将在后续里程碑实现',
} as const

export interface CommandCheck {
  accepted: boolean
  reason?: string
}

export function cloneCommand(command: Command): Command {
  switch (command.type) {
    case 'MOVE':
      return { type: 'MOVE', to: clonePos(command.to) }
    case 'ATTACK':
      return { type: 'ATTACK', target: { ...command.target } }
    case 'PATROL':
      return { type: 'PATROL', points: command.points.map(clonePos) }
    case 'GATHER':
      return { type: 'GATHER', resourceNodeId: command.resourceNodeId }
    case 'BUILD':
      return { type: 'BUILD', buildingTypeId: command.buildingTypeId, origin: clonePos(command.origin) }
    case 'REPAIR':
      return { type: 'REPAIR', target: { ...command.target } }
    case 'PRODUCE':
      return { type: 'PRODUCE', unitTypeId: command.unitTypeId }
    case 'STOP':
      return { type: 'STOP' }
  }
}

export function requiredKind(command: Command): EntityRef['kind'] | 'any' {
  if (command.type === 'PRODUCE') {
    return 'building'
  }
  if (command.type === 'STOP') {
    return 'any'
  }
  return 'unit'
}

function standableCell(state: GameState, pos: GridPos, moverId: string): boolean {
  return (
    inBounds(state.map.width, state.map.height, pos) &&
    isStandable(state.occupancy, pos, { ignoreUnitId: moverId, allowUnitAtDest: true, dest: pos })
  )
}

/** 校验单位指令。格子、目标、资源点在提交时检查，不预演整条路径。 */
export function validateUnitCommand(state: GameState, unit: Unit, command: Command): CommandCheck {
  const def = state.config.units[unit.typeId]
  if (!def) {
    return { accepted: false, reason: REJECT.NOT_FOUND }
  }
  if (command.type === 'PRODUCE') {
    return { accepted: false, reason: REJECT.TARGET_KIND }
  }
  if (command.type !== 'STOP' && !def.commands.includes(command.type as UnitCommandType)) {
    return { accepted: false, reason: REJECT.COMMAND_NOT_ALLOWED }
  }
  if (command.type === 'MOVE' && !standableCell(state, command.to, unit.id)) {
    return { accepted: false, reason: REJECT.CELL_INVALID }
  }
  if (command.type === 'PATROL') {
    if (command.points.length < 2) {
      return { accepted: false, reason: REJECT.PATROL_POINTS }
    }
    if (command.points.some((pos) => !standableCell(state, pos, unit.id))) {
      return { accepted: false, reason: REJECT.CELL_INVALID }
    }
  }
  if (command.type === 'ATTACK') {
    const target = resolveAttackTarget(state, command.target)
    if (!target) {
      return { accepted: false, reason: REJECT.TARGET_INVALID }
    }
    if (target.ownerId === unit.ownerId) {
      return { accepted: false, reason: REJECT.TARGET_INVALID }
    }
  }
  if (command.type === 'GATHER') {
    if (!state.map.resourceNodes.some((node) => node.id === command.resourceNodeId)) {
      return { accepted: false, reason: REJECT.TARGET_INVALID }
    }
  }
  if (command.type === 'BUILD') {
    const def = state.config.buildings[command.buildingTypeId]
    if (!def) {
      return { accepted: false, reason: REJECT.NOT_FOUND }
    }
    const cells = buildingCells(command.origin, def.size)
    if (cells.some((pos) => !inBounds(state.map.width, state.map.height, pos))) {
      return { accepted: false, reason: REJECT.CELL_INVALID }
    }
    if (plotBlockedByTerrainOrBuilding(state.occupancy, command.origin, def.size)) {
      return { accepted: false, reason: REJECT.CELL_INVALID }
    }
  }
  if (command.type === 'REPAIR') {
    const building = state.buildings[command.target.id]
    if (!building || building.state === 'DESTROYED' || building.ownerId !== unit.ownerId) {
      return { accepted: false, reason: REJECT.TARGET_INVALID }
    }
  }
  return { accepted: true }
}

function resolveAttackTarget(state: GameState, target: EntityRef) {
  if (target.kind === 'unit') {
    const found = state.units[target.id]
    if (!found || found.state === 'DEAD') {
      return null
    }
    return found
  }
  const found = state.buildings[target.id]
  if (!found || found.state === 'DESTROYED') {
    return null
  }
  return found
}

export function validateBuildingCommand(state: GameState, building: Building, command: Command): CommandCheck {
  if (command.type !== 'PRODUCE' && command.type !== 'STOP') {
    return { accepted: false, reason: REJECT.TARGET_KIND }
  }
  if (building.state === 'DESTROYED') {
    return { accepted: false, reason: REJECT.BUILDING_DESTROYED }
  }
  if (command.type === 'PRODUCE') {
    if (building.state !== 'ACTIVE') {
      return { accepted: false, reason: REJECT.BUILDING_NOT_READY }
    }
    const recipe = state.config.buildings[building.typeId]?.production.find(
      (item) => item.unitTypeId === command.unitTypeId,
    )
    if (!recipe) {
      return { accepted: false, reason: REJECT.COMMAND_NOT_ALLOWED }
    }
  }
  return { accepted: true }
}

export function idleUnit(unit: Unit): void {
  unit.command = null
  unit.path = []
  unit.state = 'IDLE'
  unit.moveProgressMs = 0
  unit.gatherProgressMs = 0
  unit.buildProgressMs = 0
  unit.repairProgressMs = 0
  unit.attackTarget = null
}

/** 写入指令并重置进度。已在 MOVE 目标格则立即完成。 */
export function applyUnitCommand(unit: Unit, command: Command): void {
  if (command.type === 'STOP') {
    idleUnit(unit)
    return
  }
  unit.command = cloneCommand(command)
  unit.path = []
  unit.moveProgressMs = 0
  unit.gatherProgressMs = 0
  unit.buildProgressMs = 0
  unit.repairProgressMs = 0
  unit.patrolIndex = 0
  unit.attackTarget = command.type === 'ATTACK' ? { ...command.target } : null
  if (command.type === 'MOVE') {
    unit.state = samePos(unit.pos, command.to) ? 'IDLE' : 'MOVING'
    if (unit.state === 'IDLE') {
      unit.command = null
    }
  } else if (command.type === 'PATROL') {
    unit.state = 'PATROLLING'
  } else if (command.type === 'ATTACK') {
    unit.state = 'ATTACKING'
  } else if (command.type === 'GATHER') {
    unit.state = 'GATHERING'
  } else if (command.type === 'BUILD') {
    unit.state = 'BUILDING'
  } else if (command.type === 'REPAIR') {
    unit.state = 'REPAIRING'
  } else {
    unit.state = 'IDLE'
  }
}

export function applyBuildingCommand(building: Building, command: Command): void {
  building.command = command.type === 'STOP' ? null : cloneCommand(command)
}

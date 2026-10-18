/**
 * 战斗系统。工人与 MOVE/GATHER/BUILD/REPAIR 不自动攻击。
 * IDLE/PATROL 按射程索敌；ATTACK 锁定目标。结算按攻击者 ID 升序。
 */
import { TICK_MS } from '@battle/shared'
import type { DomainEvent, EntityRef, GameState, GridPos, Unit } from '@battle/shared'
import { idleUnit } from '../commands/index.js'
import { attackStarted, damageApplied, unitDied } from '../engine/events.js'
import {
  approachCell,
  buildingRef,
  entityCells,
  isEnemy,
  isTargetAlive,
  rangeBetween,
  sameRef,
  unitRef,
} from '../engine/entities.js'
import { sortedIds } from '../world/grid.js'

export interface AttackIntent {
  attacker: EntityRef
  target: EntityRef
  amount: number
}

function exclusiveWork(unit: Unit): boolean {
  const type = unit.command?.type
  return type === 'MOVE' || type === 'GATHER' || type === 'BUILD' || type === 'REPAIR'
}

function attackBonus(unit: Unit): number {
  return unit.buffs.reduce((sum, buff) => sum + buff.attackBonus, 0)
}

function attackPower(state: GameState, attacker: EntityRef): number {
  if (attacker.kind === 'unit') {
    const unit = state.units[attacker.id]
    const def = unit ? state.config.units[unit.typeId] : undefined
    return (def?.attack ?? 0) + (unit ? attackBonus(unit) : 0)
  }
  const building = state.buildings[attacker.id]
  return building ? (state.config.buildings[building.typeId]?.attack ?? 0) : 0
}

function attackRange(state: GameState, attacker: EntityRef): number {
  if (attacker.kind === 'unit') {
    const unit = state.units[attacker.id]
    return unit ? (state.config.units[unit.typeId]?.attackRange ?? 0) : 0
  }
  const building = state.buildings[attacker.id]
  return building ? (state.config.buildings[building.typeId]?.attackRange ?? 0) : 0
}

function attackInterval(state: GameState, attacker: EntityRef): number {
  if (attacker.kind === 'unit') {
    const unit = state.units[attacker.id]
    return unit ? (state.config.units[unit.typeId]?.attackIntervalMs ?? 0) : 0
  }
  const building = state.buildings[attacker.id]
  return building ? (state.config.buildings[building.typeId]?.attackIntervalMs ?? 0) : 0
}

function targetArmor(state: GameState, target: EntityRef): number {
  if (target.kind === 'unit') {
    const unit = state.units[target.id]
    return unit ? (state.config.units[unit.typeId]?.armor ?? 0) : 0
  }
  const building = state.buildings[target.id]
  return building ? (state.config.buildings[building.typeId]?.armor ?? 0) : 0
}

export function damageAmount(state: GameState, attacker: EntityRef, target: EntityRef): number {
  return Math.max(1, attackPower(state, attacker) - targetArmor(state, target))
}

function hpOf(state: GameState, target: EntityRef): number {
  if (target.kind === 'unit') {
    return state.units[target.id]?.hp ?? Number.POSITIVE_INFINITY
  }
  return state.buildings[target.id]?.hp ?? Number.POSITIVE_INFINITY
}

function isAttacking(state: GameState, attackerId: string, me: EntityRef): boolean {
  const unit = state.units[attackerId]
  if (!unit || unit.state === 'DEAD') {
    return false
  }
  if (unit.command?.type === 'ATTACK' && sameRef(unit.command.target, me)) {
    return true
  }
  return !!unit.attackTarget && sameRef(unit.attackTarget, me)
}

function pickAutoTarget(
  state: GameState,
  attacker: EntityRef,
  allowBuildings: boolean,
): EntityRef | null {
  const range = attackRange(state, attacker)
  if (range <= 0 || attackPower(state, attacker) <= 0) {
    return null
  }
  const candidates: EntityRef[] = []
  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (!unit || unit.state === 'DEAD') {
      continue
    }
    const target = unitRef(unitId)
    if (!isEnemy(state, attacker, target)) {
      continue
    }
    if (rangeBetween(state, attacker, target) <= range) {
      candidates.push(target)
    }
  }
  if (allowBuildings) {
    for (const buildingId of sortedIds(Object.keys(state.buildings))) {
      const building = state.buildings[buildingId]
      if (!building || building.state === 'DESTROYED') {
        continue
      }
      const target = buildingRef(buildingId)
      if (!isEnemy(state, attacker, target)) {
        continue
      }
      if (rangeBetween(state, attacker, target) <= range) {
        candidates.push(target)
      }
    }
  }
  candidates.sort((a, b) => {
    const aHit = isAttacking(state, a.kind === 'unit' ? a.id : '', attacker) ? 0 : 1
    const bHit = isAttacking(state, b.kind === 'unit' ? b.id : '', attacker) ? 0 : 1
    if (aHit !== bHit) {
      return aHit - bHit
    }
    const da = rangeBetween(state, attacker, a)
    const db = rangeBetween(state, attacker, b)
    if (da !== db) {
      return da - db
    }
    const ha = hpOf(state, a)
    const hb = hpOf(state, b)
    if (ha !== hb) {
      return ha - hb
    }
    const kindRank = (ref: EntityRef) => (ref.kind === 'unit' ? 0 : 1)
    if (kindRank(a) !== kindRank(b)) {
      return kindRank(a) - kindRank(b)
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return candidates[0] ?? null
}

export function hasInRangeAutoTarget(state: GameState, unit: Unit): boolean {
  const def = state.config.units[unit.typeId]
  if (!def?.autoAttack || exclusiveWork(unit) || unit.command?.type === 'ATTACK') {
    return false
  }
  if (unit.command && unit.command.type !== 'PATROL' && unit.command.type !== 'STOP') {
    return false
  }
  return pickAutoTarget(state, unitRef(unit.id), true) !== null
}

export function attackMoveDest(state: GameState, unit: Unit): GridPos | null {
  if (unit.command?.type !== 'ATTACK' || !unit.command.target) {
    return null
  }
  const target = unit.command.target
  if (!isTargetAlive(state, target) || !isEnemy(state, unitRef(unit.id), target)) {
    idleUnit(unit)
    return null
  }
  const range = attackRange(state, unitRef(unit.id))
  if (rangeBetween(state, unitRef(unit.id), target) <= range) {
    unit.path = []
    return null
  }
  const approach = approachCell(state, unit, entityCells(state, target))
  if (!approach || (approach.x === unit.pos.x && approach.y === unit.pos.y)) {
    return null
  }
  return approach
}

/** 先降冷却并选择目标，射程内才产生伤害意图。防御建筑只打敌方单位。 */
export function collectAttackIntents(state: GameState): { intents: AttackIntent[]; events: DomainEvent[] } {
  const intents: AttackIntent[] = []
  const events: DomainEvent[] = []

  for (const unitId of sortedIds(Object.keys(state.units))) {
    const unit = state.units[unitId]
    if (!unit || unit.state === 'DEAD') {
      continue
    }
    if (unit.cooldownMs > 0) {
      unit.cooldownMs = Math.max(0, unit.cooldownMs - TICK_MS)
    }
    const attacker = unitRef(unit.id)
    let target: EntityRef | null = null
    if (unit.command?.type === 'ATTACK') {
      if (isTargetAlive(state, unit.command.target) && isEnemy(state, attacker, unit.command.target)) {
        target = unit.command.target
      } else {
        idleUnit(unit)
      }
    } else if (!exclusiveWork(unit) && (unit.command === null || unit.command.type === 'PATROL')) {
      const def = state.config.units[unit.typeId]
      if (def?.autoAttack) {
        target = pickAutoTarget(state, attacker, true)
      }
    }
    const previous = unit.attackTarget
    unit.attackTarget = target
    if (!target) {
      if (unit.command?.type === 'PATROL') {
        unit.state = 'PATROLLING'
      }
      continue
    }
    if (!previous || !sameRef(previous, target)) {
      events.push(attackStarted(unit.id, target.id))
    }
    const range = attackRange(state, attacker)
    if (rangeBetween(state, attacker, target) > range) {
      unit.state = 'ATTACKING'
      continue
    }
    unit.path = []
    unit.state = 'ATTACKING'
    if (unit.cooldownMs > 0 || attackPower(state, attacker) <= 0) {
      continue
    }
    intents.push({ attacker, target, amount: damageAmount(state, attacker, target) })
    unit.cooldownMs = attackInterval(state, attacker)
  }

  for (const buildingId of sortedIds(Object.keys(state.buildings))) {
    const building = state.buildings[buildingId]
    if (!building || building.state !== 'ACTIVE') {
      continue
    }
    const def = state.config.buildings[building.typeId]
    if (!def || def.role !== 'DEFENSE' || def.attack <= 0) {
      continue
    }
    if (building.cooldownMs > 0) {
      building.cooldownMs = Math.max(0, building.cooldownMs - TICK_MS)
    }
    const attacker = buildingRef(building.id)
    const target = pickAutoTarget(state, attacker, false)
    if (!target) {
      continue
    }
    if (building.cooldownMs > 0) {
      continue
    }
    events.push(attackStarted(building.id, target.id))
    intents.push({ attacker, target, amount: damageAmount(state, attacker, target) })
    building.cooldownMs = def.attackIntervalMs
  }

  return { intents, events }
}

export function applyAttackIntents(state: GameState, intents: AttackIntent[]): DomainEvent[] {
  const events: DomainEvent[] = []
  const ordered = [...intents].sort((a, b) => {
    if (a.attacker.id < b.attacker.id) {
      return -1
    }
    if (a.attacker.id > b.attacker.id) {
      return 1
    }
    return 0
  })
  for (const intent of ordered) {
    if (!isTargetAlive(state, intent.target)) {
      continue
    }
    events.push(damageApplied(intent.target.id, intent.amount, intent.attacker.id))
    if (intent.target.kind === 'unit') {
      const unit = state.units[intent.target.id]
      if (!unit) {
        continue
      }
      unit.hp = Math.max(0, unit.hp - intent.amount)
      if (unit.hp === 0) {
        unit.state = 'DEAD'
        unit.command = null
        unit.attackTarget = null
        events.push(unitDied(unit.id))
        const owner = state.players[unit.ownerId]
        const killer = ownerIdOfAttacker(state, intent.attacker)
        if (owner) {
          owner.stats.unitsLost += 1
        }
        const killerPlayer = killer ? state.players[killer] : undefined
        if (killerPlayer) {
          killerPlayer.stats.unitsKilled += 1
        }
      }
    } else {
      const building = state.buildings[intent.target.id]
      if (!building) {
        continue
      }
      building.hp = Math.max(0, building.hp - intent.amount)
      if (building.hp === 0) {
        building.state = 'DESTROYED'
        building.command = null
      }
    }
  }
  for (const unit of Object.values(state.units)) {
    if (unit.command?.type === 'ATTACK' && !isTargetAlive(state, unit.command.target)) {
      idleUnit(unit)
    }
  }
  return events
}

function ownerIdOfAttacker(state: GameState, attacker: EntityRef): string | undefined {
  if (attacker.kind === 'unit') {
    return state.units[attacker.id]?.ownerId
  }
  return state.buildings[attacker.id]?.ownerId
}

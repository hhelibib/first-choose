/**
 * 卡牌结算，只在操作阶段立即生效。
 * 紧急修缮 +40 生命，火力覆盖切比雪夫 ≤1 造成 15 伤害，战地鼓舞攻击 +3/200 tick。
 */
import { CARD_IDS } from '@battle/shared'
import type { CardInstance, CardTarget, DomainEvent, GameState, PlayerId } from '@battle/shared'
import { REJECT } from '../commands/index.js'
import { cardPlayed, damageApplied, unitDied } from '../engine/events.js'
import { chebyshev, inBounds, sortedIds } from '../world/grid.js'

export interface CardPlayResult {
  accepted: boolean
  reason?: string
  events: DomainEvent[]
}

function expectedTarget(cardId: string): CardTarget['type'] {
  if (cardId === CARD_IDS.emergencyRepair) {
    return 'BUILDING'
  }
  if (cardId === CARD_IDS.artilleryBarrage) {
    return 'CELL'
  }
  if (cardId === CARD_IDS.battleInspiration) {
    return 'UNIT'
  }
  return 'NONE'
}

function takeFromHand(player: { hand: CardInstance[] }, instanceId: string): CardInstance | undefined {
  const index = player.hand.findIndex((card) => card.instanceId === instanceId)
  if (index < 0) {
    return undefined
  }
  return player.hand.splice(index, 1)[0]
}

/** 校验能量、手牌与目标后立即结算。成功才扣能量并进弃牌。 */
export function playCardEffect(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
  target: CardTarget = { type: 'NONE' },
): CardPlayResult {
  const events: DomainEvent[] = []
  const player = state.players[playerId]
  if (!player) {
    return { accepted: false, reason: REJECT.NOT_FOUND, events }
  }
  const instance = player.hand.find((card) => card.instanceId === instanceId)
  if (!instance) {
    return { accepted: false, reason: REJECT.CARD_NOT_IN_HAND, events }
  }
  const def = state.config.cards[instance.cardId]
  if (!def) {
    return { accepted: false, reason: REJECT.NOT_FOUND, events }
  }
  if (player.energy < def.cost) {
    return { accepted: false, reason: REJECT.ENERGY, events }
  }
  if (target.type !== expectedTarget(instance.cardId)) {
    return { accepted: false, reason: REJECT.TARGET_INVALID, events }
  }

  if (instance.cardId === CARD_IDS.emergencyRepair && target.type === 'BUILDING') {
    const building = state.buildings[target.id]
    if (!building || building.state === 'DESTROYED' || building.ownerId !== playerId) {
      return { accepted: false, reason: REJECT.TARGET_INVALID, events }
    }
    building.hp = Math.min(building.maxHp, building.hp + 40)
  } else if (instance.cardId === CARD_IDS.artilleryBarrage && target.type === 'CELL') {
    if (!inBounds(state.map.width, state.map.height, target.pos)) {
      return { accepted: false, reason: REJECT.TARGET_INVALID, events }
    }
    for (const unitId of sortedIds(Object.keys(state.units))) {
      const unit = state.units[unitId]
      if (!unit || unit.state === 'DEAD' || unit.ownerId === playerId) {
        continue
      }
      if (chebyshev(unit.pos, target.pos) > 1) {
        continue
      }
      unit.hp = Math.max(0, unit.hp - 15)
      events.push(damageApplied(unit.id, 15, instance.cardId))
      if (unit.hp === 0) {
        unit.state = 'DEAD'
        unit.command = null
        unit.attackTarget = null
        events.push(unitDied(unit.id))
        const owner = state.players[unit.ownerId]
        if (owner) {
          owner.stats.unitsLost += 1
        }
        player.stats.unitsKilled += 1
      }
    }
  } else if (instance.cardId === CARD_IDS.battleInspiration && target.type === 'UNIT') {
    const unit = state.units[target.id]
    const unitDef = unit ? state.config.units[unit.typeId] : undefined
    if (!unit || unit.state === 'DEAD' || unit.ownerId !== playerId || unitDef?.role !== 'COMBAT') {
      return { accepted: false, reason: REJECT.TARGET_INVALID, events }
    }
    const buffId = `buff-${instance.instanceId}`
    unit.buffs.push({ id: buffId, attackBonus: 3, remainingTicks: 200 })
    state.effects.push({
      id: buffId,
      remainingTicks: 200,
      kind: 'BUFF',
      target: { kind: 'unit', id: unit.id },
      attackBonus: 3,
    })
  } else {
    return { accepted: false, reason: REJECT.TARGET_INVALID, events }
  }

  const spent = takeFromHand(player, instanceId)
  if (spent) {
    player.discard.push(spent)
  }
  player.energy -= def.cost
  events.push(cardPlayed(playerId, instance.cardId))
  return { accepted: true, events }
}

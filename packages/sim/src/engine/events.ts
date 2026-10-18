import type { DomainEvent, GridPos, PlayerId, ResourceType } from '@battle/shared'

/**
 * 领域事件工厂。
 * 系统只组装这些无墙钟的事件；`eventSeq` 只计数量，不把墙钟或渲染坐标写入事件。
 */
export function unitMoved(unitId: string, from: GridPos, to: GridPos): DomainEvent {
  return { type: 'UNIT_MOVED', unitId, from, to }
}

export function attackStarted(attackerId: string, targetId: string): DomainEvent {
  return { type: 'ATTACK_STARTED', attackerId, targetId }
}

export function damageApplied(targetId: string, amount: number, sourceId?: string): DomainEvent {
  return { type: 'DAMAGE_APPLIED', targetId, amount, sourceId }
}

export function unitDied(unitId: string): DomainEvent {
  return { type: 'UNIT_DIED', unitId }
}

export function resourceGathered(playerId: PlayerId, resource: ResourceType, amount: number): DomainEvent {
  return { type: 'RESOURCE_GATHERED', playerId, resource, amount }
}

export function buildingPlaced(buildingId: string): DomainEvent {
  return { type: 'BUILDING_PLACED', buildingId }
}

export function productionCompleted(buildingId: string, unitId: string): DomainEvent {
  return { type: 'PRODUCTION_COMPLETED', buildingId, unitId }
}

export function cardPlayed(playerId: PlayerId, cardId: string): DomainEvent {
  return { type: 'CARD_PLAYED', playerId, cardId }
}

export function victory(winnerId: string | null, condition: string): DomainEvent {
  return { type: 'VICTORY', winnerId, condition }
}

/**
 * 对局日志文案。只读快照与领域事件，不写 sim。
 */
import type { Command, DomainEvent, GameSnapshot, MatchConfig } from '@battle/shared'
import { resourceFull } from '../format/resources.js'
import { buildingName, cardName, commandName, t, unitName } from '../i18n/index.js'

export type LogTone = 'order' | 'combat' | 'econ' | 'system'

export interface MatchLogEntry {
  id: number
  round: number
  tick: number
  text: string
  relatedIds: string[]
  tone: LogTone
}

export interface CurrentOrder {
  id: string
  kind: 'unit' | 'building'
  ownerId: string
  title: string
  summary: string
}

export function formatCommand(command: Command | null, config: MatchConfig): string {
  if (!command) {
    return t('cmd.idle')
  }
  switch (command.type) {
    case 'MOVE':
      return t('cmd.moveTo', { x: command.to.x, y: command.to.y })
    case 'ATTACK':
      return t('cmd.attackId', { id: command.target.id })
    case 'PATROL':
      return commandName('PATROL')
    case 'GATHER':
      return commandName('GATHER')
    case 'BUILD':
      return t('cmd.build', {
        name: buildingName(command.buildingTypeId, config.buildings[command.buildingTypeId]?.name),
      })
    case 'REPAIR':
      return t('cmd.repairId', { id: command.target.id })
    case 'PRODUCE':
      return t('cmd.produce', { name: unitName(command.unitTypeId, config.units[command.unitTypeId]?.name) })
    case 'STOP':
      return commandName('STOP')
  }
}

export function entityLabel(snapshot: GameSnapshot, config: MatchConfig, id: string, localPlayerId: string): string {
  const unit = snapshot.units[id]
  if (unit) {
    const name = unitName(unit.typeId, config.units[unit.typeId]?.name)
    return `${side(unit.ownerId, localPlayerId)}${name}`
  }
  const building = snapshot.buildings[id]
  if (building) {
    const name = buildingName(building.typeId, config.buildings[building.typeId]?.name)
    return `${side(building.ownerId, localPlayerId)}${name}`
  }
  const card = config.cards[id]
  if (card) {
    return cardName(id, card.name)
  }
  return id
}

export function currentOrders(snapshot: GameSnapshot, config: MatchConfig, localPlayerId: string): CurrentOrder[] {
  const rows: CurrentOrder[] = []
  const unitIds = Object.keys(snapshot.units).sort()
  for (const id of unitIds) {
    const unit = snapshot.units[id]
    if (!unit || unit.state === 'DEAD') {
      continue
    }
    const name = unitName(unit.typeId, config.units[unit.typeId]?.name)
    rows.push({
      id,
      kind: 'unit',
      ownerId: unit.ownerId,
      title: `${side(unit.ownerId, localPlayerId)}${name}`,
      summary: formatCommand(unit.command, config),
    })
  }
  const buildingIds = Object.keys(snapshot.buildings).sort()
  for (const id of buildingIds) {
    const building = snapshot.buildings[id]
    if (!building || building.state === 'DESTROYED') {
      continue
    }
    const name = buildingName(building.typeId, config.buildings[building.typeId]?.name)
    rows.push({
      id,
      kind: 'building',
      ownerId: building.ownerId,
      title: `${side(building.ownerId, localPlayerId)}${name}`,
      summary: formatCommand(building.command, config),
    })
  }
  return rows
}

export function linesFromEvents(
  events: DomainEvent[],
  snapshot: GameSnapshot,
  config: MatchConfig,
  localPlayerId: string,
): Array<Omit<MatchLogEntry, 'id'>> {
  const lines: Array<Omit<MatchLogEntry, 'id'>> = []
  for (const event of events) {
    if (event.type === 'UNIT_MOVED') {
      continue
    }
    const base = { round: snapshot.round, tick: snapshot.tick }
    if (event.type === 'ATTACK_STARTED') {
      const attacker = entityLabel(snapshot, config, event.attackerId, localPlayerId)
      const target = entityLabel(snapshot, config, event.targetId, localPlayerId)
      lines.push({
        ...base,
        text: t('log.attack', { a: attacker, b: target }),
        relatedIds: [event.attackerId, event.targetId],
        tone: 'combat',
      })
      continue
    }
    if (event.type === 'DAMAGE_APPLIED') {
      const target = entityLabel(snapshot, config, event.targetId, localPlayerId)
      const source = event.sourceId ? entityLabel(snapshot, config, event.sourceId, localPlayerId) : ''
      lines.push({
        ...base,
        text: source
          ? t('log.damage', { src: source, tgt: target, n: event.amount })
          : t('log.hurt', { tgt: target, n: event.amount }),
        relatedIds: [event.targetId, event.sourceId].filter((id): id is string => !!id),
        tone: 'combat',
      })
      continue
    }
    if (event.type === 'UNIT_DIED') {
      lines.push({
        ...base,
        text: t('log.died', { name: entityLabel(snapshot, config, event.unitId, localPlayerId) }),
        relatedIds: [event.unitId],
        tone: 'combat',
      })
      continue
    }
    if (event.type === 'RESOURCE_GATHERED') {
      const who = event.playerId === localPlayerId ? t('side.mine').trim() : t('side.enemy').trim()
      lines.push({
        ...base,
        text: t('log.gain', { who, res: resourceFull(event.resource), n: event.amount }),
        relatedIds: [],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'BUILDING_PLACED') {
      lines.push({
        ...base,
        text: t('log.built', { name: entityLabel(snapshot, config, event.buildingId, localPlayerId) }),
        relatedIds: [event.buildingId],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'PRODUCTION_COMPLETED') {
      lines.push({
        ...base,
        text: t('log.spawned', {
          b: entityLabel(snapshot, config, event.buildingId, localPlayerId),
          u: entityLabel(snapshot, config, event.unitId, localPlayerId),
        }),
        relatedIds: [event.buildingId, event.unitId],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'WORKER_CONSUMED') {
      lines.push({
        ...base,
        text: t('log.join', {
          u: entityLabel(snapshot, config, event.unitId, localPlayerId),
          b: entityLabel(snapshot, config, event.buildingId, localPlayerId),
        }),
        relatedIds: [event.unitId, event.buildingId],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'CARD_PLAYED') {
      const who = event.playerId === localPlayerId ? t('side.mine').trim() : t('side.enemy').trim()
      const card = cardName(event.cardId, config.cards[event.cardId]?.name)
      lines.push({
        ...base,
        text: t('log.card', { who, card }),
        relatedIds: [],
        tone: 'system',
      })
      continue
    }
    if (event.type === 'VICTORY') {
      const text =
        event.condition === 'MUTUAL_DESTRUCTION'
          ? t('log.victoryDraw')
          : event.winnerId === localPlayerId
            ? t('log.victoryWin')
            : t('log.victoryLose')
      lines.push({ ...base, text, relatedIds: [], tone: 'system' })
    }
  }
  return lines
}

export function linesFromCommandDiff(
  prev: GameSnapshot | null,
  next: GameSnapshot,
  config: MatchConfig,
  localPlayerId: string,
  events: DomainEvent[],
): Array<Omit<MatchLogEntry, 'id'>> {
  const died = new Set(events.filter((event) => event.type === 'UNIT_DIED').map((event) => event.unitId))
  const produced = new Set(
    events.filter((event) => event.type === 'PRODUCTION_COMPLETED').map((event) => event.buildingId),
  )
  const lines: Array<Omit<MatchLogEntry, 'id'>> = []
  const base = { round: next.round, tick: next.tick }

  for (const id of Object.keys(next.units).sort()) {
    const unit = next.units[id]
    if (!unit || died.has(id)) {
      continue
    }
    const before = prev?.units[id]
    const was = commandKey(before?.command ?? null)
    const now = commandKey(unit.command)
    if (was === now) {
      continue
    }
    const who = entityLabel(next, config, id, localPlayerId)
    if (!unit.command) {
      lines.push({
        ...base,
        text: t('log.complete', { who, verb: completeVerb(before?.command ?? null) }),
        relatedIds: [id],
        tone: 'order',
      })
    } else {
      lines.push({
        ...base,
        text: t('log.ordered', { who, cmd: formatCommand(unit.command, config) }),
        relatedIds: [id, ...commandIds(unit.command)],
        tone: 'order',
      })
    }
  }

  for (const id of Object.keys(next.buildings).sort()) {
    const building = next.buildings[id]
    if (!building) {
      continue
    }
    const before = prev?.buildings[id]
    if (before && before.state !== 'DESTROYED' && building.state === 'DESTROYED') {
      lines.push({
        ...base,
        text: t('log.destroyed', { name: entityLabel(next, config, id, localPlayerId) }),
        relatedIds: [id],
        tone: 'combat',
      })
      continue
    }
    const was = commandKey(before?.command ?? null)
    const now = commandKey(building.command)
    if (was === now) {
      continue
    }
    const who = entityLabel(next, config, id, localPlayerId)
    if (!building.command) {
      if (produced.has(id)) {
        continue
      }
      lines.push({
        ...base,
        text: t('log.stopProd', { who }),
        relatedIds: [id],
        tone: 'order',
      })
    } else {
      lines.push({
        ...base,
        text: t('log.ordered', { who, cmd: formatCommand(building.command, config) }),
        relatedIds: [id],
        tone: 'order',
      })
    }
  }
  return lines
}

function side(ownerId: string, localPlayerId: string): string {
  return ownerId === localPlayerId ? t('side.mine') : t('side.enemy')
}

function commandKey(command: Command | null): string {
  return command ? JSON.stringify(command) : ''
}

function commandIds(command: Command): string[] {
  if (command.type === 'ATTACK') {
    return [command.target.id]
  }
  if (command.type === 'REPAIR') {
    return [command.target.id]
  }
  return []
}

function completeVerb(command: Command | null): string {
  if (command?.type === 'MOVE') {
    return t('log.doneMove')
  }
  if (command?.type === 'ATTACK') {
    return t('log.stopAtk')
  }
  if (command?.type === 'GATHER') {
    return t('log.endGather')
  }
  if (command?.type === 'BUILD') {
    return t('log.endBuild')
  }
  if (command?.type === 'REPAIR') {
    return t('log.endRepair')
  }
  return t('log.stop')
}

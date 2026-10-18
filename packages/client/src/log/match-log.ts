/**
 * 对局日志文案。只读快照与领域事件，不写 sim。
 */
import type { Command, DomainEvent, GameSnapshot, MatchConfig } from '@battle/shared'

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
    return '空闲'
  }
  switch (command.type) {
    case 'MOVE':
      return `移动 (${command.to.x},${command.to.y})`
    case 'ATTACK':
      return `攻击 ${command.target.id}`
    case 'PATROL':
      return '巡逻'
    case 'GATHER':
      return '采集'
    case 'BUILD':
      return `建造${config.buildings[command.buildingTypeId]?.name ?? command.buildingTypeId}`
    case 'REPAIR':
      return `维修 ${command.target.id}`
    case 'PRODUCE':
      return `生产${config.units[command.unitTypeId]?.name ?? command.unitTypeId}`
    case 'STOP':
      return '停止'
  }
}

export function entityLabel(snapshot: GameSnapshot, config: MatchConfig, id: string, localPlayerId: string): string {
  const unit = snapshot.units[id]
  if (unit) {
    const name = config.units[unit.typeId]?.name ?? unit.typeId
    return `${side(unit.ownerId, localPlayerId)}${name}`
  }
  const building = snapshot.buildings[id]
  if (building) {
    const name = config.buildings[building.typeId]?.name ?? building.typeId
    return `${side(building.ownerId, localPlayerId)}${name}`
  }
  const card = config.cards[id]
  if (card) {
    return card.name
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
    const name = config.units[unit.typeId]?.name ?? unit.typeId
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
    const name = config.buildings[building.typeId]?.name ?? building.typeId
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
        text: `${attacker} 攻击 ${target}`,
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
        text: source ? `${source} 对 ${target} 造成 ${event.amount} 伤害` : `${target} 受到 ${event.amount} 伤害`,
        relatedIds: [event.targetId, event.sourceId].filter((id): id is string => !!id),
        tone: 'combat',
      })
      continue
    }
    if (event.type === 'UNIT_DIED') {
      lines.push({
        ...base,
        text: `${entityLabel(snapshot, config, event.unitId, localPlayerId)} 阵亡`,
        relatedIds: [event.unitId],
        tone: 'combat',
      })
      continue
    }
    if (event.type === 'RESOURCE_GATHERED') {
      const who = event.playerId === localPlayerId ? '我方' : '敌方'
      const name = event.resource === 'ore' ? '矿石' : event.resource === 'gold' ? '金' : '木材'
      lines.push({
        ...base,
        text: `${who} 获得 ${name} ${event.amount}`,
        relatedIds: [],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'BUILDING_PLACED') {
      lines.push({
        ...base,
        text: `${entityLabel(snapshot, config, event.buildingId, localPlayerId)} 建成`,
        relatedIds: [event.buildingId],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'PRODUCTION_COMPLETED') {
      lines.push({
        ...base,
        text: `${entityLabel(snapshot, config, event.buildingId, localPlayerId)} 生产出 ${entityLabel(snapshot, config, event.unitId, localPlayerId)}`,
        relatedIds: [event.buildingId, event.unitId],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'WORKER_CONSUMED') {
      lines.push({
        ...base,
        text: `${entityLabel(snapshot, config, event.unitId, localPlayerId)} 并入 ${entityLabel(snapshot, config, event.buildingId, localPlayerId)}`,
        relatedIds: [event.unitId, event.buildingId],
        tone: 'econ',
      })
      continue
    }
    if (event.type === 'CARD_PLAYED') {
      const who = event.playerId === localPlayerId ? '我方' : '敌方'
      const card = config.cards[event.cardId]?.name ?? event.cardId
      lines.push({
        ...base,
        text: `${who} 打出 ${card}`,
        relatedIds: [],
        tone: 'system',
      })
      continue
    }
    if (event.type === 'VICTORY') {
      const text =
        event.condition === 'MUTUAL_DESTRUCTION'
          ? '双方主基地同时被摧毁'
          : event.winnerId === localPlayerId
            ? '我方摧毁敌方主基地，获胜'
            : '敌方摧毁我方主基地'
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
        text: `${who} ${completeVerb(before?.command ?? null)}`,
        relatedIds: [id],
        tone: 'order',
      })
    } else {
      lines.push({
        ...base,
        text: `${who} 下令 ${formatCommand(unit.command, config)}`,
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
        text: `${entityLabel(next, config, id, localPlayerId)} 被摧毁`,
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
        text: `${who} 停止生产`,
        relatedIds: [id],
        tone: 'order',
      })
    } else {
      lines.push({
        ...base,
        text: `${who} 下令 ${formatCommand(building.command, config)}`,
        relatedIds: [id],
        tone: 'order',
      })
    }
  }
  return lines
}

function side(ownerId: string, localPlayerId: string): string {
  return ownerId === localPlayerId ? '我方' : '敌方'
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
    return '完成移动'
  }
  if (command?.type === 'ATTACK') {
    return '停止攻击'
  }
  if (command?.type === 'GATHER') {
    return '结束采集'
  }
  if (command?.type === 'BUILD') {
    return '结束建造'
  }
  if (command?.type === 'REPAIR') {
    return '结束维修'
  }
  return '停止'
}

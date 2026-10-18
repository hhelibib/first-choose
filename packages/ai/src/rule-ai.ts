/**
 * 规则 AI。读快照、走命令接口，不直接改 GameState。
 * 决策顺序：工人（维修/资源建筑/兵营）→ 生产 → 战斗单位攻击或巡逻 → 出牌。
 */
import { CARD_IDS } from '@battle/shared'
import type { Building, GameState, GridPos, Unit } from '@battle/shared'
import { BUILDING_TYPE_IDS, UNIT_TYPE_IDS, type Simulator } from '@battle/sim'

export interface RuleAIOptions {
  commandLimit?: number
  reserve?: { wood: number; ore: number }
}

function sorted<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function ownUnits(state: GameState, playerId: string): Unit[] {
  return sorted(Object.values(state.units).filter((unit) => unit.ownerId === playerId && unit.state !== 'DEAD'))
}

function ownBuildings(state: GameState, playerId: string): Building[] {
  return sorted(
    Object.values(state.buildings).filter((building) => building.ownerId === playerId && building.state !== 'DESTROYED'),
  )
}

function mainBase(state: GameState, playerId: string): Building | undefined {
  return ownBuildings(state, playerId).find((building) => building.role === 'MAIN_BASE')
}

function canPay(state: GameState, playerId: string, wood: number, ore: number): boolean {
  const player = state.players[playerId]
  return !!player && player.resources.wood >= wood && player.resources.ore >= ore
}

function findPlot(state: GameState, size: { w: number; h: number }, near: GridPos): GridPos | null {
  const options: GridPos[] = []
  for (let y = 0; y <= state.map.height - size.h; y += 1) {
    for (let x = 0; x <= state.map.width - size.w; x += 1) {
      let blocked = false
      for (let dy = 0; dy < size.h && !blocked; dy += 1) {
        for (let dx = 0; dx < size.w && !blocked; dx += 1) {
          const cell = state.occupancy.cells[y + dy]?.[x + dx]
          if (!cell || cell.terrainBlocked || cell.buildingId || cell.unitId) {
            blocked = true
          }
        }
      }
      if (!blocked) {
        options.push({ x, y })
      }
    }
  }
  options.sort((a, b) => {
    const da = manhattan(a, near)
    const db = manhattan(b, near)
    if (da !== db) {
      return da - db
    }
    return a.x === b.x ? a.y - b.y : a.x - b.x
  })
  return options[0] ?? null
}

function issued(limit: { left: number }): boolean {
  if (limit.left <= 0) {
    return false
  }
  limit.left -= 1
  return true
}

/** 规则 AI 只通过命令接口行动，不改 GameState。 */
export function planOperation(sim: Simulator, playerId: string, options: RuleAIOptions = {}): void {
  const state = sim.getState()
  if (state.phase !== 'OPERATION') {
    return
  }
  const limit = { left: options.commandLimit ?? Number.POSITIVE_INFINITY }
  const reserve = options.reserve ?? { wood: 0, ore: 0 }
  const player = state.players[playerId]
  if (!player) {
    return
  }
  const base = mainBase(state, playerId)

  // 工人：优先修主基地，然后补伐木场/采矿场，再兵营/箭塔。
  for (const worker of ownUnits(state, playerId).filter((unit) => state.config.units[unit.typeId]?.role === 'WORKER')) {
    if (limit.left <= 0) {
      break
    }
    if (base && base.hp < base.maxHp && canPay(state, playerId, 0, state.config.repair.oreCost)) {
      if (sim.submitCommand(playerId, { kind: 'unit', id: worker.id }, { type: 'REPAIR', target: { kind: 'building', id: base.id } }).accepted) {
        issued(limit)
      }
      continue
    }
    const lumberDef = state.config.buildings[BUILDING_TYPE_IDS.lumberCamp]
    const oreDef = state.config.buildings[BUILDING_TYPE_IDS.oreCamp]
    const barracksDef = state.config.buildings[BUILDING_TYPE_IDS.barracks]
    const towerDef = state.config.buildings[BUILDING_TYPE_IDS.arrowTower]
    const hasLumber = ownBuildings(state, playerId).some((building) => building.typeId === BUILDING_TYPE_IDS.lumberCamp)
    const hasOre = ownBuildings(state, playerId).some((building) => building.typeId === BUILDING_TYPE_IDS.oreCamp)
    const hasBarracks = ownBuildings(state, playerId).some((building) => building.typeId === BUILDING_TYPE_IDS.barracks)
    const needResource = !hasLumber || !hasOre || player.resources.wood <= reserve.wood || player.resources.ore <= reserve.ore
    if (needResource && lumberDef && !hasLumber && canPay(state, playerId, lumberDef.buildCost.wood, lumberDef.buildCost.ore)) {
      const origin = findPlot(state, lumberDef.size, base?.origin ?? worker.pos)
      if (origin && sim.submitCommand(playerId, { kind: 'unit', id: worker.id }, { type: 'BUILD', buildingTypeId: lumberDef.id, origin }).accepted) {
        issued(limit)
        continue
      }
    }
    if (needResource && oreDef && !hasOre && canPay(state, playerId, oreDef.buildCost.wood, oreDef.buildCost.ore)) {
      const origin = findPlot(state, oreDef.size, base?.origin ?? worker.pos)
      if (origin && sim.submitCommand(playerId, { kind: 'unit', id: worker.id }, { type: 'BUILD', buildingTypeId: oreDef.id, origin }).accepted) {
        issued(limit)
        continue
      }
    }
    if (!hasBarracks && barracksDef && canPay(state, playerId, barracksDef.buildCost.wood, barracksDef.buildCost.ore)) {
      const origin = findPlot(state, barracksDef.size, base?.origin ?? worker.pos)
      if (origin && sim.submitCommand(playerId, { kind: 'unit', id: worker.id }, { type: 'BUILD', buildingTypeId: barracksDef.id, origin }).accepted) {
        issued(limit)
      }
    } else if (towerDef && canPay(state, playerId, towerDef.buildCost.wood, towerDef.buildCost.ore)) {
      const origin = findPlot(state, towerDef.size, base?.origin ?? worker.pos)
      if (origin && sim.submitCommand(playerId, { kind: 'unit', id: worker.id }, { type: 'BUILD', buildingTypeId: towerDef.id, origin }).accepted) {
        issued(limit)
      }
    }
  }

  // 生产：主基地造工人，兵营造战斗单位。
  for (const building of ownBuildings(state, playerId)) {
    if (limit.left <= 0 || building.state !== 'ACTIVE') {
      continue
    }
    if (player.population >= player.populationCap) {
      break
    }
    const workerRecipe = building.typeId === BUILDING_TYPE_IDS.mainBase
    const fighterRecipe = building.typeId === BUILDING_TYPE_IDS.barracks
    const unitTypeId = workerRecipe ? UNIT_TYPE_IDS.worker : fighterRecipe ? UNIT_TYPE_IDS.fighter : null
    if (!unitTypeId) {
      continue
    }
    if (sim.submitCommand(playerId, { kind: 'building', id: building.id }, { type: 'PRODUCE', unitTypeId }).accepted) {
      issued(limit)
    }
  }

  // 战斗单位：有敌人则锁定最近目标，否则在基地附近巡逻。
  const enemies = sorted(
    Object.values(state.units).filter((unit) => unit.ownerId !== playerId && unit.state !== 'DEAD'),
  )
  for (const fighter of ownUnits(state, playerId).filter((unit) => state.config.units[unit.typeId]?.role === 'COMBAT')) {
    if (limit.left <= 0) {
      break
    }
    const target = [...enemies].sort((a, b) => {
      const da = chebyshev(fighter.pos, a.pos)
      const db = chebyshev(fighter.pos, b.pos)
      if (da !== db) {
        return da - db
      }
      return a.id < b.id ? -1 : 1
    })[0]
    if (target) {
      if (sim.submitCommand(playerId, { kind: 'unit', id: fighter.id }, { type: 'ATTACK', target: { kind: 'unit', id: target.id } }).accepted) {
        issued(limit)
      }
    } else if (base) {
      const points: GridPos[] = [base.origin, { x: Math.min(state.map.width - 1, base.origin.x + 2), y: base.origin.y }]
      if (points[0] && points[1] && (points[0].x !== points[1].x || points[0].y !== points[1].y)) {
        if (sim.submitCommand(playerId, { kind: 'unit', id: fighter.id }, { type: 'PATROL', points }).accepted) {
          issued(limit)
        }
      }
    }
  }

  // 卡牌：基地残血修缮，否则火力覆盖敌群，再给战斗单位鼓舞。
  const repairCard = player.hand.find((card) => card.cardId === CARD_IDS.emergencyRepair)
  const barrageCard = player.hand.find((card) => card.cardId === CARD_IDS.artilleryBarrage)
  const inspireCard = player.hand.find((card) => card.cardId === CARD_IDS.battleInspiration)
  if (repairCard && base && base.hp * 2 < base.maxHp && player.energy >= 3 && limit.left > 0) {
    if (sim.playCard(playerId, repairCard.instanceId, { type: 'BUILDING', id: base.id }).accepted) {
      issued(limit)
    }
  } else if (barrageCard && player.energy >= 4 && limit.left > 0) {
    const cluster = findClusterCell(state, playerId)
    if (cluster && sim.playCard(playerId, barrageCard.instanceId, { type: 'CELL', pos: cluster }).accepted) {
      issued(limit)
    }
  } else if (inspireCard && player.energy >= 2 && limit.left > 0) {
    const fighter = ownUnits(state, playerId).find((unit) => state.config.units[unit.typeId]?.role === 'COMBAT')
    if (fighter && sim.playCard(playerId, inspireCard.instanceId, { type: 'UNIT', id: fighter.id }).accepted) {
      issued(limit)
    }
  }
}

function findClusterCell(state: GameState, playerId: string): GridPos | null {
  let best: { pos: GridPos; count: number } | null = null
  const enemies = Object.values(state.units).filter((unit) => unit.ownerId !== playerId && unit.state !== 'DEAD')
  for (const unit of enemies) {
    const count = enemies.filter((other) => chebyshev(other.pos, unit.pos) <= 1).length
    if (count >= 2 && (!best || count > best.count || (count === best.count && unit.id < `${best.pos.x},${best.pos.y}`))) {
      best = { pos: { ...unit.pos }, count }
    }
  }
  return best?.pos ?? null
}

/**
 * 权威 GameState 的创建、回合开始与快照。
 * 标识只用状态内计数器，牌组回收按实例 ID 排序。
 */
import type {
  Building,
  CardInstance,
  GameSnapshot,
  GameState,
  GridPos,
  MatchConfig,
  PlayerId,
  PlayerState,
  Unit,
} from '@battle/shared'
import { createOccupancy, occupyBuilding, occupyUnit } from '../world/occupancy.js'
import { clonePos } from '../world/grid.js'

export interface PlayerSetup {
  id: PlayerId
  name: string
  isAI: boolean
}

function nextId(prefix: string, seq: number): string {
  return `${prefix}${seq}`
}

function createDeck(state: GameState, ownerId: PlayerId): CardInstance[] {
  return state.config.deckCardIds.map((cardId) => {
    const instanceId = nextId('c', state.cardSeq)
    state.cardSeq += 1
    return { instanceId, cardId, ownerId }
  })
}

function refillHand(state: GameState, player: PlayerState): void {
  while (player.hand.length < state.config.handLimit) {
    if (player.deck.length === 0) {
      if (player.discard.length === 0) {
        break
      }
      player.deck = [...player.discard].sort((a, b) =>
        a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0,
      )
      player.discard = []
    }
    const card = player.deck.shift()
    if (!card) {
      break
    }
    player.hand.push(card)
  }
}

/** 按地图起点放置单位和建筑，生成牌组，人口计入单位。 */
export function createInitialState(options: {
  config: MatchConfig
  matchId: string
  rngSeed: number
  players: PlayerSetup[]
}): GameState {
  const { config } = options
  if (options.players.length !== config.map.players.length) {
    throw new Error('玩家数量必须与地图起点数量一致')
  }

  const map = {
    id: config.map.id,
    width: config.map.width,
    height: config.map.height,
    terrain: config.map.terrain.map((row) => [...row]),
    resourceNodes: config.map.resourceNodes.map((node) => ({ ...node, remaining: node.amount })),
    startPositions: config.map.players,
  }

  const state: GameState = {
    matchId: options.matchId,
    phase: 'LOBBY',
    round: 0,
    tick: 0,
    phaseTicksRemaining: 0,
    rngSeed: options.rngSeed,
    unitSeq: 0,
    buildingSeq: 0,
    cardSeq: 0,
    eventSeq: 0,
    map,
    players: {},
    units: {},
    buildings: {},
    occupancy: createOccupancy(map),
    effects: [],
    victoryRule: config.victory,
    config,
  }

  options.players.forEach((setup, index) => {
    const start = config.map.players[index]
    if (!start) {
      throw new Error('缺少玩家起点')
    }
    state.players[setup.id] = {
      id: setup.id,
      name: setup.name,
      teamId: start.teamId,
      resources: { ...config.startingResources },
      hand: [],
      deck: [],
      discard: [],
      energy: config.maxEnergy,
      maxEnergy: config.maxEnergy,
      isAI: setup.isAI,
      eliminated: false,
      population: 0,
      populationCap: config.populationCap,
      stats: { unitsLost: 0, unitsKilled: 0, resourcesGathered: 0 },
    }
  })

  for (const player of Object.values(state.players)) {
    player.deck = createDeck(state, player.id)
  }

  options.players.forEach((setup, index) => {
    const start = config.map.players[index]
    if (!start) {
      return
    }
    for (const placed of start.buildings) {
      const def = config.buildings[placed.typeId]
      if (!def) {
        throw new Error(`未知建筑 ${placed.typeId}`)
      }
      const building: Building = {
        id: nextId('b', state.buildingSeq),
        ownerId: setup.id,
        typeId: def.id,
        role: def.role,
        origin: clonePos(placed.origin),
        size: { ...def.size },
        hp: def.hp,
        maxHp: def.hp,
        state: 'ACTIVE',
        buildProgressMs: 0,
        command: null,
        cooldownMs: 0,
        builderId: null,
        productionRemainingMs: 0,
      }
      state.buildingSeq += 1
      if (!occupyBuilding(state.occupancy, building)) {
        throw new Error(`建筑 ${building.id} 占位失败`)
      }
      state.buildings[building.id] = building
    }
    for (const placed of start.units) {
      const unit = spawnOwnedUnit(state, setup.id, placed.typeId, placed.pos)
      if (!unit) {
        throw new Error(`单位 ${placed.typeId} 占位失败`)
      }
    }
  })

  refreshPopulation(state)
  return state
}

export function refreshPopulation(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.population = 0
  }
  for (const unit of Object.values(state.units)) {
    if (unit.state === 'DEAD') {
      continue
    }
    const def = state.config.units[unit.typeId]
    const player = state.players[unit.ownerId]
    if (def && player) {
      player.population += def.population
    }
  }
  for (const building of Object.values(state.buildings)) {
    if (building.command?.type !== 'PRODUCE' || building.productionRemainingMs <= 0) {
      continue
    }
    const def = state.config.units[building.command.unitTypeId]
    const player = state.players[building.ownerId]
    if (def && player) {
      player.population += def.population
    }
  }
}

/** 进入操作阶段：第二轮起能量 +3（不超过上限），并补到手牌上限。 */
export function beginRound(state: GameState): void {
  if (state.round === 0) {
    state.round = 1
  } else {
    state.round += 1
    for (const player of Object.values(state.players)) {
      player.energy = Math.min(player.maxEnergy, player.energy + state.config.energyPerRound)
    }
  }
  for (const player of Object.values(state.players)) {
    refillHand(state, player)
  }
  refillMoveBudgets(state)
  state.phase = 'OPERATION'
  state.phaseTicksRemaining = 0
}

/** 按兵种固有 `moveRange` 恢复本回合可走格数。 */
export function refillMoveBudgets(state: GameState): void {
  for (const unit of Object.values(state.units)) {
    if (unit.state === 'DEAD') {
      continue
    }
    unit.moveRemaining = state.config.units[unit.typeId]?.moveRange ?? 0
  }
}

/** 在指定格生成单位。占位失败时不消耗序号。 */
export function spawnOwnedUnit(state: GameState, ownerId: PlayerId, typeId: string, pos: GridPos): Unit | null {
  const def = state.config.units[typeId]
  if (!def) {
    return null
  }
  const unit: Unit = {
    id: nextId('u', state.unitSeq),
    ownerId,
    typeId: def.id,
    pos: clonePos(pos),
    hp: def.hp,
    maxHp: def.hp,
    state: 'IDLE',
    command: null,
    path: [],
    moveProgressMs: 0,
    moveRemaining: def.moveRange,
    cooldownMs: 0,
    gatherProgressMs: 0,
    buildProgressMs: 0,
    repairProgressMs: 0,
    patrolIndex: 0,
    buffs: [],
    attackTarget: null,
  }
  if (!occupyUnit(state.occupancy, unit)) {
    return null
  }
  state.unitSeq += 1
  state.units[unit.id] = unit
  return unit
}

export function toSnapshot(state: GameState): GameSnapshot {
  return {
    matchId: state.matchId,
    phase: state.phase,
    round: state.round,
    tick: state.tick,
    phaseTicksRemaining: state.phaseTicksRemaining,
    map: state.map,
    players: state.players,
    units: state.units,
    buildings: state.buildings,
    occupancy: state.occupancy,
    effects: state.effects,
    victoryRule: state.victoryRule,
    winnerId: state.winnerId,
    winnerCondition: state.winnerCondition,
  }
}

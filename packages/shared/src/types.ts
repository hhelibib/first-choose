/**
 * 一期领域类型。权威状态、指令、卡牌、胜利条件都在这里定义。
 * 不包含墙钟和渲染插值坐标。
 */
export type PlayerId = string
export type UnitId = string
export type BuildingId = string

export type GamePhase =
  | 'LOBBY'
  | 'ROUND_START'
  | 'OPERATION'
  | 'AUTO'
  | 'ROUND_END'
  | 'GAME_OVER'

export interface GridPos {
  x: number
  y: number
}

export type ResourceType = 'wood' | 'ore' | 'gold'
export type TerrainType = 'PASSABLE' | 'BLOCKED'

export interface Resources {
  wood: number
  ore: number
  gold: number
}

export type EntityRef =
  | { kind: 'unit'; id: UnitId }
  | { kind: 'building'; id: BuildingId }

export type UnitCommandType =
  | 'MOVE'
  | 'ATTACK'
  | 'PATROL'
  | 'GATHER'
  | 'BUILD'
  | 'REPAIR'
  | 'STOP'

/** 每个单位或建筑同时只有一条指令。PRODUCE 作用于建筑，其余一期指令作用于单位。 */
export type Command =
  | { type: 'MOVE'; to: GridPos }
  | { type: 'ATTACK'; target: EntityRef }
  | { type: 'PATROL'; points: GridPos[] }
  | { type: 'GATHER'; resourceNodeId: string }
  | { type: 'BUILD'; buildingTypeId: string; origin: GridPos }
  | { type: 'REPAIR'; target: { kind: 'building'; id: BuildingId } }
  | { type: 'PRODUCE'; unitTypeId: string }
  | { type: 'STOP' }

export type CardCategory = 'ENGINEERING' | 'ATTACK' | 'SUPPORT'
export type CardTargetType = 'NONE' | 'UNIT' | 'BUILDING' | 'CELL' | 'AREA'

export type CardTarget =
  | { type: 'NONE' }
  | { type: 'UNIT'; id: UnitId }
  | { type: 'BUILDING'; id: BuildingId }
  | { type: 'CELL'; pos: GridPos }

export type CardEffect =
  | { type: 'HEAL_BUILDING'; amount: number }
  | { type: 'DAMAGE_AREA'; radius: number; amount: number; metric: 'CHEBYSHEV' }
  | { type: 'ATTACK_BUFF'; amount: number; durationTicks: number }

export interface CardDefinition {
  id: string
  name: string
  category: CardCategory
  cost: number
  targetType: CardTargetType
  effects: CardEffect[]
}

export interface CardInstance {
  instanceId: string
  cardId: string
  ownerId: PlayerId
}

export interface Buff {
  id: string
  attackBonus: number
  remainingTicks: number
}

export interface TimedEffect {
  id: string
  remainingTicks: number
  kind: 'BUFF'
  target: EntityRef
  attackBonus: number
}

export type UnitState =
  | 'IDLE'
  | 'MOVING'
  | 'ATTACKING'
  | 'GATHERING'
  | 'RETURNING'
  | 'BUILDING'
  | 'REPAIRING'
  | 'PATROLLING'
  | 'DEAD'

export interface Unit {
  id: UnitId
  ownerId: PlayerId
  typeId: string
  pos: GridPos
  hp: number
  maxHp: number
  state: UnitState
  command: Command | null
  path: GridPos[]
  moveProgressMs: number
  /** 本回合剩余可走格数，进入下一轮操作时恢复为兵种 `moveRange`。 */
  moveRemaining: number
  cooldownMs: number
  carry?: { resource: ResourceType; amount: number }
  gatherProgressMs: number
  buildProgressMs: number
  repairProgressMs: number
  patrolIndex: number
  buffs: Buff[]
  attackTarget: EntityRef | null
}

export type BuildingRole = 'MAIN_BASE' | 'PRODUCTION' | 'DEFENSE' | 'WAREHOUSE' | 'RESOURCE'
export type BuildingState = 'CONSTRUCTING' | 'ACTIVE' | 'DESTROYED'

export interface Building {
  id: BuildingId
  ownerId: PlayerId
  typeId: string
  role: BuildingRole
  origin: GridPos
  size: { w: number; h: number }
  hp: number
  maxHp: number
  state: BuildingState
  buildProgressMs: number
  command: Command | null
  cooldownMs: number
  builderId: UnitId | null
  productionRemainingMs: number
  harvestProgressMs: number
}

export interface ResourceNodeConfig {
  id: string
  resource: ResourceType
  pos: GridPos
  amount: number
}

export interface ResourceNode extends ResourceNodeConfig {
  remaining: number
}

export interface PlayerStart {
  start: GridPos
  teamId: number
  buildings: Array<{ typeId: string; origin: GridPos }>
  units: Array<{ typeId: string; pos: GridPos }>
}

export interface GameMap {
  id: string
  width: number
  height: number
  terrain: TerrainType[][]
  resourceNodes: ResourceNode[]
  startPositions: PlayerStart[]
}

export interface OccupancyCell {
  terrainBlocked: boolean
  buildingId?: BuildingId
  unitId?: UnitId
}

export interface OccupancyGrid {
  cells: OccupancyCell[][]
}

export interface PlayerStats {
  unitsLost: number
  unitsKilled: number
  resourcesGathered: number
}

export interface PlayerState {
  id: PlayerId
  name: string
  teamId: number
  resources: Resources
  hand: CardInstance[]
  deck: CardInstance[]
  discard: CardInstance[]
  energy: number
  maxEnergy: number
  isAI: boolean
  eliminated: boolean
  population: number
  populationCap: number
  stats: PlayerStats
}

export type VictoryCondition =
  | { type: 'DESTROY_MAIN_BASE'; enabled: boolean }
  | { type: 'CAPTURE_POINTS'; enabled: boolean; target: number }
  | { type: 'RESOURCE_SCORE'; enabled: boolean; target: number }
  | { type: 'SURVIVE_ROUNDS'; enabled: boolean; rounds: number }

export interface VictoryRule {
  mode: 'ANY' | 'ALL'
  conditions: VictoryCondition[]
}

export type UnitRole = 'WORKER' | 'COMBAT'

export interface UnitDefinition {
  id: string
  name: string
  /** 兵种简介，给选中资料卡使用。 */
  description: string
  role: UnitRole
  hp: number
  attack: number
  armor: number
  attackIntervalMs: number
  attackRange: number
  moveMsPerCell: number
  /** 每回合最多走的格数，是兵种固有属性。 */
  moveRange: number
  carryCapacity: number
  gatherMs: number
  population: number
  autoAttack: boolean
  commands: UnitCommandType[]
}

export interface ProductionRecipe {
  unitTypeId: string
  cost: Resources
  timeMs: number
}

export interface BuildingDefinition {
  id: string
  name: string
  /** 建筑简介，给选中资料卡使用。 */
  description: string
  role: BuildingRole
  hp: number
  armor: number
  size: { w: number; h: number }
  attack: number
  attackIntervalMs: number
  attackRange: number
  buildCost: Resources
  buildTimeMs: number
  production: ProductionRecipe[]
  /** 资源建筑完工后自动产出；建造完成会消耗工人。 */
  harvest?: { resource: ResourceType; amount: number; intervalMs: number }
}

export interface RepairConfig {
  intervalMs: number
  oreCost: number
  heal: number
}

export interface MapConfig {
  id: string
  width: number
  height: number
  terrain: TerrainType[][]
  resourceNodes: ResourceNodeConfig[]
  players: PlayerStart[]
}

export interface MatchConfig {
  id: string
  map: MapConfig
  units: Record<string, UnitDefinition>
  buildings: Record<string, BuildingDefinition>
  cards: Record<string, CardDefinition>
  victory: VictoryRule
  repair: RepairConfig
  populationCap: number
  startingResources: Resources
  maxEnergy: number
  energyPerRound: number
  handLimit: number
  deckCardIds: string[]
}

/** 权威对局状态。`tick` 为逻辑计数，`phaseTicksRemaining` 只用于自走阶段。 */
export interface GameState {
  matchId: string
  phase: GamePhase
  round: number
  tick: number
  phaseTicksRemaining: number
  rngSeed: number
  unitSeq: number
  buildingSeq: number
  cardSeq: number
  eventSeq: number
  map: GameMap
  players: Record<PlayerId, PlayerState>
  units: Record<UnitId, Unit>
  buildings: Record<BuildingId, Building>
  occupancy: OccupancyGrid
  effects: TimedEffect[]
  victoryRule: VictoryRule
  winnerId?: PlayerId
  winnerCondition?: string
  config: MatchConfig
}

export type GameSnapshot = Pick<
  GameState,
  | 'matchId'
  | 'phase'
  | 'round'
  | 'tick'
  | 'phaseTicksRemaining'
  | 'map'
  | 'players'
  | 'units'
  | 'buildings'
  | 'occupancy'
  | 'effects'
  | 'victoryRule'
  | 'winnerId'
  | 'winnerCondition'
>

/** tick 或出牌产生的领域事件，不含墙钟。 */
export type DomainEvent =
  | { type: 'UNIT_MOVED'; unitId: string; from: GridPos; to: GridPos }
  | { type: 'ATTACK_STARTED'; attackerId: string; targetId: string }
  | { type: 'DAMAGE_APPLIED'; targetId: string; amount: number; sourceId?: string }
  | { type: 'UNIT_DIED'; unitId: string }
  | { type: 'RESOURCE_GATHERED'; playerId: string; resource: ResourceType; amount: number }
  | { type: 'BUILDING_PLACED'; buildingId: string }
  | { type: 'PRODUCTION_COMPLETED'; buildingId: string; unitId: string }
  | { type: 'CARD_PLAYED'; playerId: string; cardId: string }
  | { type: 'WORKER_CONSUMED'; unitId: string; buildingId: string }
  | { type: 'VICTORY'; winnerId: string | null; condition: string }

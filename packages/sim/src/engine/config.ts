/**
 * 一期默认与测试用 MatchConfig。
 * 数值仍内嵌；M6 后再拆到 `configs/` JSON。
 */
import {
  CARD_IDS,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  DEFAULT_POPULATION_CAP,
  ENERGY_PER_ROUND,
  HAND_LIMIT,
  MAX_ENERGY,
  PHASE1_DECK_CARD_IDS,
  STARTING_GOLD,
  STARTING_ORE,
  STARTING_WOOD,
  parseMatchConfig,
} from '@battle/shared'
import type {
  BuildingDefinition,
  CardDefinition,
  GridPos,
  MatchConfig,
  ResourceNodeConfig,
  Resources,
  TerrainType,
  UnitDefinition,
} from '@battle/shared'

export const UNIT_TYPE_IDS = {
  worker: 'worker',
  fighter: 'fighter',
} as const

export const BUILDING_TYPE_IDS = {
  mainBase: 'main-base',
  barracks: 'barracks',
  arrowTower: 'arrow-tower',
  lumberCamp: 'lumber-camp',
  oreCamp: 'ore-camp',
} as const

export const unitDefinitions: Record<string, UnitDefinition> = {
  [UNIT_TYPE_IDS.worker]: {
    id: UNIT_TYPE_IDS.worker,
    name: '工人',
    description: '建造资源建筑、兵营和防御。建成伐木场或采矿场后该工人会并入建筑。不会主动攻击。',
    role: 'WORKER',
    hp: 40,
    attack: 0,
    armor: 0,
    attackIntervalMs: 0,
    attackRange: 0,
    moveMsPerCell: 500,
    moveRange: 6,
    carryCapacity: 10,
    gatherMs: 1000,
    population: 1,
    autoAttack: false,
    commands: ['MOVE', 'BUILD', 'REPAIR', 'STOP'],
  },
  [UNIT_TYPE_IDS.fighter]: {
    id: UNIT_TYPE_IDS.fighter,
    name: '战斗单位',
    description: '近战士兵。每回合最多走 8 格，空闲和巡逻时会自动索敌。',
    role: 'COMBAT',
    hp: 80,
    attack: 10,
    armor: 1,
    attackIntervalMs: 1000,
    attackRange: 1,
    moveMsPerCell: 400,
    moveRange: 8,
    carryCapacity: 0,
    gatherMs: 0,
    population: 1,
    autoAttack: true,
    commands: ['MOVE', 'ATTACK', 'PATROL', 'STOP'],
  },
}

export const buildingDefinitions: Record<string, BuildingDefinition> = {
  [BUILDING_TYPE_IDS.mainBase]: {
    id: BUILDING_TYPE_IDS.mainBase,
    name: '主基地',
    description: '阵营核心。被摧毁即失败。',
    role: 'MAIN_BASE',
    hp: 800,
    armor: 0,
    size: { w: 2, h: 2 },
    attack: 0,
    attackIntervalMs: 0,
    attackRange: 0,
    buildCost: { wood: 0, ore: 0, gold: 0 },
    buildTimeMs: 0,
    production: [{ unitTypeId: UNIT_TYPE_IDS.worker, cost: { wood: 50, ore: 0, gold: 0 }, timeMs: 5000 }],
  },
  [BUILDING_TYPE_IDS.barracks]: {
    id: BUILDING_TYPE_IDS.barracks,
    name: '兵营',
    description: '训练战斗单位。完工后才能生产。',
    role: 'PRODUCTION',
    hp: 400,
    armor: 0,
    size: { w: 2, h: 2 },
    attack: 0,
    attackIntervalMs: 0,
    attackRange: 0,
    buildCost: { wood: 80, ore: 40, gold: 0 },
    buildTimeMs: 10000,
    production: [{ unitTypeId: UNIT_TYPE_IDS.fighter, cost: { wood: 0, ore: 40, gold: 0 }, timeMs: 8000 }],
  },
  [BUILDING_TYPE_IDS.arrowTower]: {
    id: BUILDING_TYPE_IDS.arrowTower,
    name: '箭塔',
    description: '固定防御建筑。自走阶段自动攻击射程内的敌人。',
    role: 'DEFENSE',
    hp: 250,
    armor: 0,
    size: { w: 1, h: 1 },
    attack: 8,
    attackIntervalMs: 800,
    attackRange: 3,
    buildCost: { wood: 40, ore: 60, gold: 0 },
    buildTimeMs: 8000,
    production: [],
  },
  [BUILDING_TYPE_IDS.lumberCamp]: {
    id: BUILDING_TYPE_IDS.lumberCamp,
    name: '伐木场',
    description: '建成后消耗工人，之后每秒自动产出木材。',
    role: 'RESOURCE',
    hp: 200,
    armor: 0,
    size: { w: 1, h: 1 },
    attack: 0,
    attackIntervalMs: 0,
    attackRange: 0,
    buildCost: { wood: 60, ore: 0, gold: 0 },
    buildTimeMs: 6000,
    production: [],
    harvest: { resource: 'wood', amount: 8, intervalMs: 1000 },
  },
  [BUILDING_TYPE_IDS.oreCamp]: {
    id: BUILDING_TYPE_IDS.oreCamp,
    name: '采矿场',
    description: '建成后消耗工人，之后每秒自动产出矿石。',
    role: 'RESOURCE',
    hp: 220,
    armor: 0,
    size: { w: 1, h: 1 },
    attack: 0,
    attackIntervalMs: 0,
    attackRange: 0,
    buildCost: { wood: 40, ore: 30, gold: 0 },
    buildTimeMs: 8000,
    production: [],
    harvest: { resource: 'ore', amount: 5, intervalMs: 1000 },
  },
}

export const cardDefinitions: Record<string, CardDefinition> = {
  [CARD_IDS.emergencyRepair]: {
    id: CARD_IDS.emergencyRepair,
    name: '紧急修缮',
    category: 'ENGINEERING',
    cost: 3,
    targetType: 'BUILDING',
    effects: [{ type: 'HEAL_BUILDING', amount: 40 }],
  },
  [CARD_IDS.artilleryBarrage]: {
    id: CARD_IDS.artilleryBarrage,
    name: '火力覆盖',
    category: 'ATTACK',
    cost: 4,
    targetType: 'CELL',
    effects: [{ type: 'DAMAGE_AREA', radius: 1, amount: 15, metric: 'CHEBYSHEV' }],
  },
  [CARD_IDS.battleInspiration]: {
    id: CARD_IDS.battleInspiration,
    name: '战地鼓舞',
    category: 'SUPPORT',
    cost: 2,
    targetType: 'UNIT',
    effects: [{ type: 'ATTACK_BUFF', amount: 3, durationTicks: 200 }],
  },
}

function makeTerrain(width: number, height: number, blocked: GridPos[]): TerrainType[][] {
  const blockedKeys = new Set(blocked.map((pos) => `${pos.x},${pos.y}`))
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (blockedKeys.has(`${x},${y}`) ? 'BLOCKED' : 'PASSABLE')),
  )
}

const DEFAULT_BLOCKED: GridPos[] = [
  { x: 5, y: 11 },
  { x: 6, y: 11 },
  { x: 7, y: 11 },
  { x: 8, y: 11 },
  { x: 15, y: 12 },
  { x: 16, y: 12 },
  { x: 17, y: 12 },
  { x: 18, y: 12 },
]

export function createDefaultMatchConfig(): MatchConfig {
  return parseMatchConfig({
    id: 'default-24x24',
    map: {
      id: 'default-24x24',
      width: DEFAULT_MAP_WIDTH,
      height: DEFAULT_MAP_HEIGHT,
      terrain: makeTerrain(DEFAULT_MAP_WIDTH, DEFAULT_MAP_HEIGHT, DEFAULT_BLOCKED),
      resourceNodes: [],
      players: [
        {
          start: { x: 2, y: 2 },
          teamId: 0,
          buildings: [{ typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 2, y: 2 } }],
          units: [
            { typeId: UNIT_TYPE_IDS.worker, pos: { x: 1, y: 2 } },
            { typeId: UNIT_TYPE_IDS.worker, pos: { x: 2, y: 1 } },
            { typeId: UNIT_TYPE_IDS.fighter, pos: { x: 1, y: 1 } },
          ],
        },
        {
          start: { x: 20, y: 20 },
          teamId: 1,
          buildings: [{ typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 20, y: 20 } }],
          units: [
            { typeId: UNIT_TYPE_IDS.worker, pos: { x: 19, y: 20 } },
            { typeId: UNIT_TYPE_IDS.worker, pos: { x: 20, y: 19 } },
            { typeId: UNIT_TYPE_IDS.fighter, pos: { x: 19, y: 19 } },
          ],
        },
      ],
    },
    units: unitDefinitions,
    buildings: buildingDefinitions,
    cards: cardDefinitions,
    victory: {
      mode: 'ANY',
      conditions: [
        { type: 'DESTROY_MAIN_BASE', enabled: true },
        { type: 'CAPTURE_POINTS', enabled: false, target: 1 },
        { type: 'RESOURCE_SCORE', enabled: false, target: 1 },
        { type: 'SURVIVE_ROUNDS', enabled: false, rounds: 1 },
      ],
    },
    repair: { intervalMs: 1000, oreCost: 1, heal: 20 },
    populationCap: DEFAULT_POPULATION_CAP,
    startingResources: { wood: STARTING_WOOD, ore: STARTING_ORE, gold: STARTING_GOLD },
    maxEnergy: MAX_ENERGY,
    energyPerRound: ENERGY_PER_ROUND,
    handLimit: HAND_LIMIT,
    deckCardIds: [...PHASE1_DECK_CARD_IDS],
  })
}

export function createTestMatchConfig(spec: {
  width?: number
  height?: number
  blocked?: GridPos[]
  units?: Array<{ ownerIndex: number; typeId: string; pos: GridPos }>
  buildings?: Array<{ ownerIndex: number; typeId: string; origin: GridPos }>
  resourceNodes?: ResourceNodeConfig[]
  startingResources?: Resources
  populationCap?: number
  deckCardIds?: string[]
}): MatchConfig {
  const width = spec.width ?? 8
  const height = spec.height ?? 8
  const units = spec.units ?? []
  const buildings = spec.buildings ?? []
  const defaults = createDefaultMatchConfig()
  return parseMatchConfig({
    ...defaults,
    id: 'test-map',
    startingResources: spec.startingResources ?? defaults.startingResources,
    populationCap: spec.populationCap ?? defaults.populationCap,
    deckCardIds: spec.deckCardIds ?? defaults.deckCardIds,
    map: {
      id: 'test-map',
      width,
      height,
      terrain: makeTerrain(width, height, spec.blocked ?? []),
      resourceNodes: spec.resourceNodes ?? [],
      players: [0, 1].map((index) => ({
        start: index === 0 ? { x: 0, y: 0 } : { x: width - 1, y: height - 1 },
        teamId: index,
        buildings: buildings
          .filter((building) => building.ownerIndex === index)
          .map((building) => ({ typeId: building.typeId, origin: building.origin })),
        units: units
          .filter((unit) => unit.ownerIndex === index)
          .map((unit) => ({ typeId: unit.typeId, pos: unit.pos })),
      })),
    },
  })
}

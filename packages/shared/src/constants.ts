/**
 * 一期数值常量。地图宽高、能量、牌序、寻路邻居都固定，避免散落魔法数。
 */
/** 逻辑 tick 长度。一次 `tick()` 固定推进这么多毫秒。 */
export const TICK_MS = 50

/** 操作阶段墙钟时长。倒计时放在 Runner，不进入权威状态。 */
export const OPERATION_MS = 15_000

/** 自走阶段 tick 上限，对应 30 秒。 */
export const AUTO_TICK_LIMIT = 600

export const DEFAULT_MAP_WIDTH = 16
export const DEFAULT_MAP_HEIGHT = 16

export const MAX_ENERGY = 10
export const ENERGY_PER_ROUND = 3
export const HAND_LIMIT = 5
export const DEFAULT_POPULATION_CAP = 20

export const STARTING_WOOD = 100
export const STARTING_ORE = 50
export const STARTING_GOLD = 0

export const CARD_IDS = {
  emergencyRepair: 'emergency-repair',
  artilleryBarrage: 'artillery-barrage',
  battleInspiration: 'battle-inspiration',
} as const

/** 三种卡各 4 张，顺序固定。洗回牌组时仍按实例 ID 排序，不使用随机数。 */
export const PHASE1_DECK_CARD_IDS = [
  CARD_IDS.emergencyRepair,
  CARD_IDS.emergencyRepair,
  CARD_IDS.emergencyRepair,
  CARD_IDS.emergencyRepair,
  CARD_IDS.artilleryBarrage,
  CARD_IDS.artilleryBarrage,
  CARD_IDS.artilleryBarrage,
  CARD_IDS.artilleryBarrage,
  CARD_IDS.battleInspiration,
  CARD_IDS.battleInspiration,
  CARD_IDS.battleInspiration,
  CARD_IDS.battleInspiration,
] as const

/** 寻路邻居顺序：北、东、南、西。y 向下。 */
export const NEIGHBOR_OFFSETS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const

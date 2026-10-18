/**
 * 模拟引擎：阶段机、初始状态、配置、实体查询、领域事件。
 * `tick()` 只在 `simulator.ts` 编排，子系统不得自行推进阶段。
 */
export { GameSimulator, createSimulator } from './simulator.js'
export type {
  CommandResult,
  CreateSimulatorOptions,
  Simulator,
  TickResult,
  VictoryResult,
} from './simulator.js'
export { beginRound, createInitialState, refreshPopulation, spawnOwnedUnit, toSnapshot } from './state.js'
export type { PlayerSetup } from './state.js'
export {
  BUILDING_TYPE_IDS,
  UNIT_TYPE_IDS,
  buildingDefinitions,
  cardDefinitions,
  createDefaultMatchConfig,
  createTestMatchConfig,
  unitDefinitions,
} from './config.js'
export {
  activeBuilding,
  alreadyAdjacent,
  approachCell,
  buildingRef,
  entityCells,
  isEnemy,
  isTargetAlive,
  livingUnit,
  ownerIdOf,
  rangeBetween,
  sameRef,
  unitRef,
} from './entities.js'
export {
  attackStarted,
  buildingPlaced,
  cardPlayed,
  damageApplied,
  productionCompleted,
  resourceGathered,
  unitDied,
  unitMoved,
  victory,
} from './events.js'

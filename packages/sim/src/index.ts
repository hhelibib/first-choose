/**
 * `@battle/sim` 对外出口。
 * 客户端、AI、回放只应依赖本文件导出的命令接口，不要深入内部模块改状态。
 */
export { REJECT } from './commands/index.js'
export {
  BUILDING_TYPE_IDS,
  UNIT_TYPE_IDS,
  createDefaultMatchConfig,
  createTestMatchConfig,
} from './engine/config.js'
export { replay } from './replay/replay.js'
export type { ReplayLog } from './replay/replay.js'
export { GameSimulator, createSimulator } from './engine/simulator.js'
export type {
  CommandResult,
  CreateSimulatorOptions,
  Simulator,
  TickResult,
  VictoryResult,
} from './engine/simulator.js'
/** 操作阶段路径与可达格预览用。只读占位网格，不得写回权威状态。 */
export { findPath, findReachable } from './world/pathfinding.js'

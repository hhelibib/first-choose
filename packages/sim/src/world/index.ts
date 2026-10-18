/**
 * 世界层：格子几何、占位、寻路、资源支付。
 * 不含阶段机，也不产生胜负。
 */
export {
  buildingCells,
  cellAt,
  chebyshev,
  clonePos,
  inBounds,
  manhattan,
  pathKey,
  posKey,
  samePos,
  sortedIds,
} from './grid.js'
export {
  applyUnitMove,
  createOccupancy,
  isStandable,
  occupyBuilding,
  occupyUnit,
  plotBlockedByTerrainOrBuilding,
  plotBlockedByUnit,
  releaseBuilding,
  releaseUnit,
  resolveMoveIntents,
} from './occupancy.js'
export type { MoveIntent } from './occupancy.js'
export { findPath } from './pathfinding.js'
export { canPay, pay, refund } from './resources.js'

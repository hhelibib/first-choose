/**
 * 自走阶段子系统。
 * `GameSimulator.tick()` 按固定顺序调用：清理 → 采集 → 建造 → 维修 → 收集攻击意图 → 生产 → 提交移动 → 结算伤害 → buff → 胜利。
 */
export { cancelBuilderConstruction, cancelConstruction, processBuild } from './build.js'
export { playCardEffect } from './cards.js'
export type { CardPlayResult } from './cards.js'
export { cleanupDead, tickBuffs } from './cleanup.js'
export { applyAttackIntents, collectAttackIntents, damageAmount } from './combat.js'
export type { AttackIntent } from './combat.js'
export { processGather } from './gather.js'
export { collectMoveIntents, commitMoves } from './movement.js'
export { cancelProduction, processProduction, startProduction } from './production.js'
export { processRepair } from './repair.js'
export { applyVictory, checkVictory } from './victory.js'
export type { VictoryResult } from './victory.js'

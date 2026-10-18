/**
 * 一期只判定摧毁主基地。
 * 开局至少两名带 MAIN_BASE 的参赛者才结算，避免测试图被误判结束。
 */
import type { GameState, PlayerId } from '@battle/shared'

export interface VictoryResult {
  winnerId?: PlayerId
  condition: string
}

function hasMainBase(state: GameState, playerId: string): boolean {
  return Object.values(state.buildings).some(
    (building) =>
      building.ownerId === playerId &&
      building.role === 'MAIN_BASE' &&
      building.state !== 'DESTROYED',
  )
}

function contenderIds(state: GameState): string[] {
  const ids: string[] = []
  for (const start of state.map.startPositions) {
    const hasBase = start.buildings.some(
      (placed) => state.config.buildings[placed.typeId]?.role === 'MAIN_BASE',
    )
    if (!hasBase) {
      continue
    }
    const player = Object.values(state.players).find((item) => item.teamId === start.teamId)
    if (player) {
      ids.push(player.id)
    }
  }
  return ids
}

/** 只在至少两名主基地参赛者时判定 DESTROY_MAIN_BASE 或 MUTUAL_DESTRUCTION。 */
export function checkVictory(state: GameState): VictoryResult | null {
  if (state.phase === 'GAME_OVER') {
    return state.winnerCondition
      ? { winnerId: state.winnerId, condition: state.winnerCondition }
      : null
  }
  const destroy = state.victoryRule.conditions.find(
    (condition) => condition.type === 'DESTROY_MAIN_BASE' && condition.enabled,
  )
  if (!destroy) {
    return null
  }
  const contenders = contenderIds(state)
  if (contenders.length < 2) {
    return null
  }
  const living = contenders.filter((id) => hasMainBase(state, id))
  for (const id of contenders) {
    const player = state.players[id]
    if (player) {
      player.eliminated = !living.includes(id)
    }
  }
  if (living.length === 1) {
    return { winnerId: living[0], condition: 'DESTROY_MAIN_BASE' }
  }
  if (living.length === 0) {
    return { condition: 'MUTUAL_DESTRUCTION' }
  }
  return null
}

export function applyVictory(state: GameState, victory: VictoryResult): void {
  state.phase = 'GAME_OVER'
  state.phaseTicksRemaining = 0
  state.winnerId = victory.winnerId
  state.winnerCondition = victory.condition
}

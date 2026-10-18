/**
 * 权威状态哈希：字段排序后的 JSON + FNV-1a。
 * 不含墙钟、配置函数和渲染坐标。
 */
import type { GameState } from '@battle/shared'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const field = record[key]
      if (field === undefined) {
        continue
      }
      sorted[key] = canonicalize(field)
    }
    return sorted
  }
  return value
}

function fnv1aHex(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** 权威哈希：不含配置函数、墙钟和渲染坐标。 */
export function hashState(state: GameState): string {
  return fnv1aHex(
    JSON.stringify(
      canonicalize({
        matchId: state.matchId,
        phase: state.phase,
        round: state.round,
        tick: state.tick,
        phaseTicksRemaining: state.phaseTicksRemaining,
        rngSeed: state.rngSeed,
        unitSeq: state.unitSeq,
        buildingSeq: state.buildingSeq,
        cardSeq: state.cardSeq,
        eventSeq: state.eventSeq,
        configId: state.config.id,
        map: state.map,
        players: state.players,
        units: state.units,
        buildings: state.buildings,
        occupancy: state.occupancy,
        effects: state.effects,
        victoryRule: state.victoryRule,
        winnerId: state.winnerId ?? null,
        winnerCondition: state.winnerCondition ?? null,
      }),
    ),
  )
}

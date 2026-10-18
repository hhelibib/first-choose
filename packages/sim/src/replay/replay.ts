/**
 * 命令日志回放。遇到 END_OPERATION 后 tick 完整段自走，不重新运行 AI。
 */
import type { MatchConfig, ReplayEntry } from '@battle/shared'
import type { PlayerSetup } from '../engine/state.js'
import { createSimulator, type Simulator } from '../engine/simulator.js'

export interface ReplayLog {
  matchId: string
  rngSeed: number
  config: MatchConfig
  players: PlayerSetup[]
  entries: ReplayEntry[]
}

function cloneLog(log: ReplayLog): ReplayLog {
  return JSON.parse(JSON.stringify(log)) as ReplayLog
}

/** 重放命令日志，不重新运行 AI。自走阶段按原对局一样 tick 到结束。 */
export function replay(log: ReplayLog): { hashes: string[]; sim: Simulator } {
  const data = cloneLog(log)
  const sim = createSimulator({
    config: data.config,
    matchId: data.matchId,
    rngSeed: data.rngSeed,
    players: data.players,
  })
  const hashes: string[] = [sim.getStateHash()]
  for (const entry of data.entries) {
    switch (entry.type) {
      case 'PHASE_CHANGED':
        if (entry.phase === 'OPERATION' && sim.getState().phase === 'LOBBY') {
          sim.startMatch()
        } else if (entry.phase === 'OPERATION' && sim.getState().phase === 'AUTO') {
          sim.startOperationPhase()
        }
        hashes.push(sim.getStateHash())
        break
      case 'SUBMIT_COMMAND':
        sim.submitCommand(entry.playerId, entry.target, entry.command)
        hashes.push(sim.getStateHash())
        break
      case 'CLEAR_COMMAND':
        sim.clearCommand(entry.playerId, entry.target)
        hashes.push(sim.getStateHash())
        break
      case 'PLAY_CARD':
        sim.playCard(entry.playerId, entry.instanceId, entry.target)
        hashes.push(sim.getStateHash())
        break
      case 'END_OPERATION':
        sim.endOperationPhase()
        hashes.push(sim.getStateHash())
        while (sim.getState().phase === 'AUTO' && sim.getState().phaseTicksRemaining > 0) {
          hashes.push(sim.tick().stateHash)
        }
        break
      default:
        break
    }
  }
  return { hashes, sim }
}

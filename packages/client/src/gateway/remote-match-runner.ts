/**
 * 联机运行器骨架。一期只保证与 LocalMatchRunner 同一接口，不作为可玩验收。
 */
import type { CardTarget, Command, EntityRef, GameSnapshot, MatchConfig, PlayerId } from '@battle/shared'
import { REJECT, type CommandResult } from '@battle/sim'
import type { MatchListener, MatchRunner, StartMatchOptions } from './types.js'

const REMOTE_DISABLED = '一期不实现联机对局'

export class RemoteMatchRunner implements MatchRunner {
  startMatch(_options?: StartMatchOptions): void {
    throw new Error(REMOTE_DISABLED)
  }

  submitCommand(_playerId: PlayerId, _target: EntityRef, _command: Command): CommandResult {
    return { accepted: false, reason: REMOTE_DISABLED }
  }

  clearCommand(_playerId: PlayerId, _target: EntityRef): CommandResult {
    return { accepted: false, reason: REJECT.WRONG_PHASE }
  }

  playCard(_playerId: PlayerId, _instanceId: string, _target?: CardTarget): CommandResult {
    return { accepted: false, reason: REMOTE_DISABLED }
  }

  endOperation(): void {}

  setPaused(_paused: boolean): void {}

  subscribe(_listener: MatchListener): () => void {
    return () => {}
  }

  getSnapshot(): GameSnapshot | null {
    return null
  }

  getConfig(): MatchConfig | null {
    return null
  }

  dispose(): void {}
}

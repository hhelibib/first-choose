import type {
  CardTarget,
  Command,
  DomainEvent,
  EntityRef,
  GamePhase,
  GameSnapshot,
  MatchConfig,
  PlayerId,
} from '@battle/shared'
import type { CommandResult } from '@battle/sim'
import type { RuleAIOptions } from '@battle/ai'

export interface StartMatchOptions {
  localPlayerId?: PlayerId
  aiPlayerId?: PlayerId
  aiOptions?: RuleAIOptions
}

export interface PhaseInfo {
  phase: GamePhase
  round: number
  /** 操作阶段结束的墙钟。暂停或自走阶段为 null。 */
  operationEndsAtMs: number | null
  /** 操作阶段剩余毫秒。暂停时由 Runner 冻结。 */
  operationRemainMs: number | null
  phaseTicksRemaining: number
  paused: boolean
}

export interface MatchListener {
  onSnapshot(snapshot: GameSnapshot, events: DomainEvent[]): void
  onPhase(info: PhaseInfo): void
  onCommandAck(ack: CommandResult & { target?: EntityRef }): void
  onGameOver(winnerId: PlayerId | null, condition: string): void
}

/**
 * 对局运行器接口。一期用 LocalMatchRunner 调 sim；
 * RemoteMatchRunner 只保留同一形状，不作为可玩联机。
 */
export interface MatchRunner {
  startMatch(options?: StartMatchOptions): void
  submitCommand(playerId: PlayerId, target: EntityRef, command: Command): CommandResult
  clearCommand(playerId: PlayerId, target: EntityRef): CommandResult
  playCard(playerId: PlayerId, instanceId: string, target?: CardTarget): CommandResult
  endOperation(): void
  setPaused(paused: boolean): void
  subscribe(listener: MatchListener): () => void
  getSnapshot(): GameSnapshot | null
  getConfig(): MatchConfig | null
  dispose(): void
}

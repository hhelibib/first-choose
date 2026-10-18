/**
 * 客户/服务消息与回放日志条目。
 * 一期本地对局只用 ReplayEntry；ServerMessage.endsAtMs 留给 Runner。
 */
import type {
  CardTarget,
  Command,
  DomainEvent,
  EntityRef,
  GamePhase,
  GameSnapshot,
  PlayerId,
  PlayerStats,
} from './types.js'

export type ClientMessage =
  | { type: 'JOIN'; playerName: string }
  | { type: 'READY' }
  | { type: 'SUBMIT_COMMAND'; round: number; target: EntityRef; command: Command }
  | { type: 'CLEAR_COMMAND'; round: number; target: EntityRef }
  | { type: 'PLAY_CARD'; round: number; instanceId: string; target?: CardTarget }
  | { type: 'END_OPERATION'; round: number }

export type ServerMessage =
  | { type: 'MATCH_START'; state: GameSnapshot }
  | {
      type: 'PHASE_CHANGED'
      phase: GamePhase
      round: number
      /** 操作阶段倒计时用的墙钟。自走阶段可忽略。 */
      endsAtMs: number
      phaseTicksRemaining: number
    }
  | { type: 'COMMAND_ACK'; target: EntityRef; accepted: boolean; reason?: string }
  | { type: 'SNAPSHOT'; tick: number; state: GameSnapshot }
  | { type: 'EVENTS'; tick: number; events: DomainEvent[] }
  | {
      type: 'GAME_OVER'
      winnerId: PlayerId | null
      condition: string
      stats: Record<PlayerId, PlayerStats>
    }

/** 回放只记录已提交命令和阶段切换，不重新执行 AI。 */
export type ReplayEntry =
  | { type: 'SUBMIT_COMMAND'; playerId: PlayerId; target: EntityRef; command: Command }
  | { type: 'CLEAR_COMMAND'; playerId: PlayerId; target: EntityRef }
  | { type: 'PLAY_CARD'; playerId: PlayerId; instanceId: string; target?: CardTarget }
  | { type: 'END_OPERATION'; playerId: PlayerId }
  | { type: 'PHASE_CHANGED'; phase: GamePhase; tick: number }

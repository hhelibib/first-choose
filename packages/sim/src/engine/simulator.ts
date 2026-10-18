/**
 * 权威模拟入口：阶段机、命令提交、固定 50ms tick 编排。
 * 禁止墙钟、DOM 和随机数进入本模块。
 */
import { AUTO_TICK_LIMIT } from '@battle/shared'
import type {
  CardTarget,
  Command,
  DomainEvent,
  EntityRef,
  GameSnapshot,
  GameState,
  MatchConfig,
  PlayerId,
  ReplayEntry,
} from '@battle/shared'
import {
  applyBuildingCommand,
  applyUnitCommand,
  REJECT,
  requiredKind,
  validateBuildingCommand,
  validateUnitCommand,
} from '../commands/index.js'
import { createDefaultMatchConfig } from './config.js'
import { samePos } from '../world/grid.js'
import { hashState } from '../replay/hash.js'
import type { ReplayLog } from '../replay/replay.js'
import { beginRound, createInitialState, toSnapshot, type PlayerSetup } from './state.js'
import { cancelBuilderConstruction, processBuild } from '../systems/build.js'
import { playCardEffect } from '../systems/cards.js'
import { cleanupDead, tickBuffs } from '../systems/cleanup.js'
import { applyAttackIntents, collectAttackIntents } from '../systems/combat.js'
import { processGather } from '../systems/gather.js'
import { collectMoveIntents, commitMoves } from '../systems/movement.js'
import { cancelProduction, processProduction, startProduction } from '../systems/production.js'
import { processRepair } from '../systems/repair.js'
import { applyVictory, checkVictory, type VictoryResult } from '../systems/victory.js'
import { victory as victoryEvent } from './events.js'

export interface CommandResult {
  accepted: boolean
  reason?: string
}

export type { VictoryResult }

export interface TickResult {
  events: DomainEvent[]
  victory: VictoryResult | null
  stateHash: string
}

export interface Simulator {
  getState(): Readonly<GameState>
  startMatch(): void
  startOperationPhase(): void
  submitCommand(playerId: PlayerId, target: EntityRef, command: Command): CommandResult
  clearCommand(playerId: PlayerId, target: EntityRef): CommandResult
  playCard(playerId: PlayerId, instanceId: string, target?: CardTarget): CommandResult
  endOperationPhase(): void
  tick(): TickResult
  getSnapshot(): GameSnapshot
  getStateHash(): string
  getReplayLog(): ReplayLog
}

export interface CreateSimulatorOptions {
  config?: MatchConfig
  matchId?: string
  rngSeed?: number
  players?: PlayerSetup[]
}

const DEFAULT_PLAYERS: PlayerSetup[] = [
  { id: 'p0', name: '玩家', isAI: false },
  { id: 'p1', name: '规则AI', isAI: true },
]

export class GameSimulator implements Simulator {
  private readonly state: GameState
  private readonly log: ReplayLog

  constructor(options: CreateSimulatorOptions = {}) {
    const config = options.config ?? createDefaultMatchConfig()
    const matchId = options.matchId ?? 'm0'
    const rngSeed = options.rngSeed ?? 1
    const players = options.players ?? DEFAULT_PLAYERS
    this.state = createInitialState({ config, matchId, rngSeed, players })
    this.log = {
      matchId,
      rngSeed,
      config: cloneData(config),
      players: cloneData(players),
      entries: [],
    }
  }

  getState(): Readonly<GameState> {
    return this.state
  }

  getReplayLog(): ReplayLog {
    return cloneData(this.log)
  }

  startMatch(): void {
    if (this.state.phase !== 'LOBBY') {
      throw new Error('只能从大厅开始对局')
    }
    this.state.phase = 'ROUND_START'
    beginRound(this.state)
    this.record({ type: 'PHASE_CHANGED', phase: 'OPERATION', tick: this.state.tick })
  }

  startOperationPhase(): void {
    if (this.state.phase === 'GAME_OVER') {
      throw new Error('对局已结束')
    }
    if (this.state.phase === 'AUTO' && this.state.phaseTicksRemaining > 0) {
      throw new Error('自走阶段尚未结束')
    }
    if (this.state.phase === 'OPERATION') {
      return
    }
    if (this.state.phase !== 'AUTO' && this.state.phase !== 'ROUND_END') {
      throw new Error('当前不能进入操作阶段')
    }
    this.state.phase = 'ROUND_END'
    this.state.phase = 'ROUND_START'
    beginRound(this.state)
    this.record({ type: 'PHASE_CHANGED', phase: 'OPERATION', tick: this.state.tick })
  }

  /** 操作阶段下达一条指令。失败返回原因，状态不变。 */
  submitCommand(playerId: PlayerId, target: EntityRef, command: Command): CommandResult {
    const result = this.applyCommand(playerId, target, command)
    if (result.accepted) {
      this.record({ type: 'SUBMIT_COMMAND', playerId, target: { ...target }, command })
    }
    return result
  }

  clearCommand(playerId: PlayerId, target: EntityRef): CommandResult {
    const result = this.applyCommand(playerId, target, { type: 'STOP' })
    if (result.accepted) {
      this.record({ type: 'CLEAR_COMMAND', playerId, target: { ...target } })
    }
    return result
  }

  /** 操作阶段出牌并立即结算。卡牌效果走 events 工厂，随后检查胜利。 */
  playCard(playerId: PlayerId, instanceId: string, target?: CardTarget): CommandResult {
    if (this.state.phase !== 'OPERATION') {
      return { accepted: false, reason: REJECT.WRONG_PHASE }
    }
    const played = playCardEffect(this.state, playerId, instanceId, target)
    if (!played.accepted) {
      return { accepted: false, reason: played.reason }
    }
    cleanupDead(this.state)
    this.finishIfWon(played.events)
    this.state.eventSeq += played.events.length
    this.record({ type: 'PLAY_CARD', playerId, instanceId, target })
    return { accepted: true }
  }

  endOperationPhase(): void {
    if (this.state.phase === 'GAME_OVER') {
      return
    }
    if (this.state.phase !== 'OPERATION') {
      throw new Error('只能在操作阶段结束操作')
    }
    this.state.phase = 'AUTO'
    this.state.phaseTicksRemaining = AUTO_TICK_LIMIT
    this.record({ type: 'END_OPERATION', playerId: 'p0' })
    this.record({ type: 'PHASE_CHANGED', phase: 'AUTO', tick: this.state.tick })
  }

  /** 一次调用推进一个 50ms 逻辑 tick。操作阶段或已结束时不推进模拟。 */
  tick(): TickResult {
    if (this.state.phase === 'GAME_OVER') {
      return {
        events: [],
        victory: { winnerId: this.state.winnerId, condition: this.state.winnerCondition ?? '' },
        stateHash: hashState(this.state),
      }
    }
    if (this.state.phase !== 'AUTO' || this.state.phaseTicksRemaining <= 0) {
      return { events: [], victory: null, stateHash: hashState(this.state) }
    }

    this.state.tick += 1
    this.state.phaseTicksRemaining -= 1

    // 固定顺序：清理死亡 → 采集 → 建造 → 维修 → 收集攻击意图 → 生产 → 提交移动 → 结算伤害 → buff → 胜利。
    const events: DomainEvent[] = []
    cleanupDead(this.state)
    processGather(this.state, events)
    processBuild(this.state, events)
    processRepair(this.state)
    const combat = collectAttackIntents(this.state)
    events.push(...combat.events)
    processProduction(this.state, events)
    const intents = collectMoveIntents(this.state)
    events.push(...commitMoves(this.state, intents))
    events.push(...applyAttackIntents(this.state, combat.intents))
    tickBuffs(this.state)
    const victory = this.finishIfWon(events)
    this.state.eventSeq += events.length

    return {
      events,
      victory,
      stateHash: hashState(this.state),
    }
  }

  getSnapshot(): GameSnapshot {
    return toSnapshot(this.state)
  }

  getStateHash(): string {
    return hashState(this.state)
  }

  private applyCommand(playerId: PlayerId, target: EntityRef, command: Command): CommandResult {
    if (this.state.phase !== 'OPERATION') {
      return { accepted: false, reason: REJECT.WRONG_PHASE }
    }
    const kind = requiredKind(command)
    if (kind !== 'any' && kind !== target.kind) {
      return { accepted: false, reason: REJECT.TARGET_KIND }
    }
    if (target.kind === 'unit') {
      const unit = this.state.units[target.id]
      if (!unit) {
        return { accepted: false, reason: REJECT.NOT_FOUND }
      }
      if (unit.ownerId !== playerId) {
        return { accepted: false, reason: REJECT.WRONG_OWNER }
      }
      if (unit.state === 'DEAD') {
        return { accepted: false, reason: REJECT.UNIT_DEAD }
      }
      const check = validateUnitCommand(this.state, unit, command)
      if (!check.accepted) {
        return check
      }
      const previous = unit.command
      applyUnitCommand(unit, command)
      if (previous?.type === 'BUILD' && !isSameBuild(previous, unit.command)) {
        cancelBuilderConstruction(this.state, unit.id)
      }
      return { accepted: true }
    }
    const building = this.state.buildings[target.id]
    if (!building) {
      return { accepted: false, reason: REJECT.NOT_FOUND }
    }
    if (building.ownerId !== playerId) {
      return { accepted: false, reason: REJECT.WRONG_OWNER }
    }
    const check = validateBuildingCommand(this.state, building, command)
    if (!check.accepted) {
      return check
    }
    if (command.type === 'STOP') {
      cancelProduction(this.state, building)
      building.command = null
      return { accepted: true }
    }
    if (command.type === 'PRODUCE') {
      const started = startProduction(this.state, building, command.unitTypeId)
      return started.ok ? { accepted: true } : { accepted: false, reason: started.reason }
    }
    applyBuildingCommand(building, command)
    return { accepted: true }
  }

  private finishIfWon(events: DomainEvent[]): VictoryResult | null {
    const victory = checkVictory(this.state)
    if (!victory) {
      return null
    }
    applyVictory(this.state, victory)
    events.push(victoryEvent(victory.winnerId ?? null, victory.condition))
    this.record({ type: 'PHASE_CHANGED', phase: 'GAME_OVER', tick: this.state.tick })
    return victory
  }

  private record(entry: ReplayEntry): void {
    this.log.entries.push(cloneData(entry))
  }
}

export function createSimulator(options?: CreateSimulatorOptions): Simulator {
  return new GameSimulator(options)
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isSameBuild(previous: Command, current: Command | null): boolean {
  return (
    previous.type === 'BUILD' &&
    current?.type === 'BUILD' &&
    previous.buildingTypeId === current.buildingTypeId &&
    samePos(previous.origin, current.origin)
  )
}

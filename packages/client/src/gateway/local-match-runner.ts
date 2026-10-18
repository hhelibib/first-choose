/**
 * 本地对局：浏览器内持有 sim，操作阶段用墙钟倒计时，自走阶段按 50ms 累加 tick。
 * AI 只在进入操作阶段时通过命令接口下令。
 */
import { FIRST_OPERATION_MS, OPERATION_MS, TICK_MS, type CardTarget, type Command, type DomainEvent, type EntityRef, type GameSnapshot, type MatchConfig, type PlayerId } from '@battle/shared'
import { createSimulator, REJECT, type CommandResult, type Simulator } from '@battle/sim'
import { planOperation, type RuleAIOptions } from '@battle/ai'
import { cloneData } from './clone.js'
import type { MatchListener, MatchRunner, PhaseInfo, StartMatchOptions } from './types.js'

export class LocalMatchRunner implements MatchRunner {
  private sim: Simulator | null = null
  private readonly listeners = new Set<MatchListener>()
  private raf = 0
  private lastFrameMs = 0
  private autoAccMs = 0
  private operationEndsAtMs: number | null = null
  private frozenOperationRemainMs: number | null = null
  private localPlayerId: PlayerId = 'p0'
  private aiPlayerId: PlayerId = 'p1'
  private aiOptions: RuleAIOptions = {}
  private running = false
  private paused = false

  startMatch(options: StartMatchOptions = {}): void {
    this.dispose()
    this.localPlayerId = options.localPlayerId ?? 'p0'
    this.aiPlayerId = options.aiPlayerId ?? 'p1'
    this.aiOptions = options.aiOptions ?? {}
    this.sim = createSimulator()
    this.sim.startMatch()
    this.autoAccMs = 0
    this.lastFrameMs = performance.now()
    this.running = true
    this.paused = false
    this.frozenOperationRemainMs = null
    this.enterOperation(true)
    this.raf = requestAnimationFrame(this.loop)
  }

  submitCommand(playerId: PlayerId, target: EntityRef, command: Command): CommandResult {
    if (!this.sim) {
      return { accepted: false, reason: REJECT.NOT_FOUND }
    }
    if (this.sim.getState().phase !== 'OPERATION') {
      return { accepted: false, reason: REJECT.WRONG_PHASE }
    }
    const result = this.sim.submitCommand(playerId, target, command)
    this.emitAck(result, target)
    if (result.accepted) {
      this.emitSnapshot([])
    }
    return result
  }

  clearCommand(playerId: PlayerId, target: EntityRef): CommandResult {
    if (!this.sim) {
      return { accepted: false, reason: REJECT.NOT_FOUND }
    }
    if (this.sim.getState().phase !== 'OPERATION') {
      return { accepted: false, reason: REJECT.WRONG_PHASE }
    }
    const result = this.sim.clearCommand(playerId, target)
    this.emitAck(result, target)
    if (result.accepted) {
      this.emitSnapshot([])
    }
    return result
  }

  playCard(playerId: PlayerId, instanceId: string, target?: CardTarget): CommandResult {
    if (!this.sim) {
      return { accepted: false, reason: REJECT.NOT_FOUND }
    }
    if (this.sim.getState().phase !== 'OPERATION') {
      return { accepted: false, reason: REJECT.WRONG_PHASE }
    }
    const result = this.sim.playCard(playerId, instanceId, target)
    this.emitAck(result)
    this.emitSnapshot([])
    if (this.sim.getState().phase === 'GAME_OVER') {
      this.emitGameOver()
    }
    return result
  }

  endOperation(): void {
    if (!this.sim || this.sim.getState().phase !== 'OPERATION') {
      return
    }
    this.sim.endOperationPhase()
    this.operationEndsAtMs = null
    this.frozenOperationRemainMs = null
    this.autoAccMs = 0
    this.emitPhase()
    this.emitSnapshot([])
  }

  subscribe(listener: MatchListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): GameSnapshot | null {
    return this.sim ? cloneData(this.sim.getSnapshot()) : null
  }

  getConfig(): MatchConfig | null {
    return this.sim ? cloneData(this.sim.getState().config) : null
  }

  dispose(): void {
    this.running = false
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
    this.sim = null
    this.operationEndsAtMs = null
    this.frozenOperationRemainMs = null
    this.paused = false
    this.autoAccMs = 0
  }

  setPaused(paused: boolean): void {
    if (!this.sim || this.paused === paused) {
      return
    }
    if (this.sim.getState().phase === 'GAME_OVER') {
      return
    }
    const now = performance.now()
    if (paused) {
      if (this.operationEndsAtMs !== null) {
        this.frozenOperationRemainMs = Math.max(0, this.operationEndsAtMs - now)
        this.operationEndsAtMs = null
      }
      this.paused = true
    } else {
      if (this.frozenOperationRemainMs !== null) {
        this.operationEndsAtMs = now + this.frozenOperationRemainMs
        this.frozenOperationRemainMs = null
      }
      this.paused = false
      this.lastFrameMs = now
    }
    this.emitPhase()
  }

  private loop = (now: number): void => {
    if (!this.running || !this.sim) {
      return
    }
    this.raf = requestAnimationFrame(this.loop)
    if (this.paused) {
      return
    }
    const dt = Math.min(100, now - this.lastFrameMs)
    this.lastFrameMs = now
    const phase = this.sim.getState().phase
    if (phase === 'GAME_OVER') {
      return
    }
    if (phase === 'OPERATION') {
      if (this.operationEndsAtMs !== null && now >= this.operationEndsAtMs) {
        this.endOperation()
      }
      return
    }
    if (phase !== 'AUTO') {
      return
    }
    this.autoAccMs += dt
    const events: DomainEvent[] = []
    let ticks = 0
    while (
      this.autoAccMs >= TICK_MS &&
      this.sim.getState().phase === 'AUTO' &&
      this.sim.getState().phaseTicksRemaining > 0
    ) {
      this.autoAccMs -= TICK_MS
      const result = this.sim.tick()
      ticks += 1
      events.push(...result.events)
      if (result.victory) {
        break
      }
    }
    if (ticks > 0) {
      this.emitSnapshot(events)
    }
    const after = this.sim.getState()
    if (after.phase === 'GAME_OVER') {
      this.emitGameOver()
      return
    }
    if (after.phase === 'AUTO' && after.phaseTicksRemaining <= 0) {
      this.enterOperation(false)
    }
  }

  private enterOperation(initial: boolean): void {
    if (!this.sim) {
      return
    }
    if (!initial) {
      this.sim.startOperationPhase()
    }
    planOperation(this.sim, this.aiPlayerId, this.aiOptions)
    const duration = this.sim.getState().round <= 1 ? FIRST_OPERATION_MS : OPERATION_MS
    this.operationEndsAtMs = performance.now() + duration
    this.frozenOperationRemainMs = null
    this.emitPhase()
    this.emitSnapshot([])
  }

  private emitSnapshot(events: DomainEvent[]): void {
    if (!this.sim) {
      return
    }
    const snapshot = cloneData(this.sim.getSnapshot())
    const clonedEvents = cloneData(events)
    for (const listener of this.listeners) {
      listener.onSnapshot(snapshot, clonedEvents)
    }
  }

  private emitPhase(): void {
    if (!this.sim) {
      return
    }
    const state = this.sim.getState()
    const info: PhaseInfo = {
      phase: state.phase,
      round: state.round,
      operationEndsAtMs: this.operationEndsAtMs,
      operationRemainMs: this.paused
        ? this.frozenOperationRemainMs
        : this.operationEndsAtMs !== null
          ? Math.max(0, this.operationEndsAtMs - performance.now())
          : null,
      phaseTicksRemaining: state.phaseTicksRemaining,
      paused: this.paused,
    }
    for (const listener of this.listeners) {
      listener.onPhase(info)
    }
  }

  private emitAck(result: CommandResult, target?: EntityRef): void {
    for (const listener of this.listeners) {
      listener.onCommandAck({ ...result, target })
    }
  }

  private emitGameOver(): void {
    if (!this.sim) {
      return
    }
    const state = this.sim.getState()
    this.emitPhase()
    this.emitSnapshot([])
    for (const listener of this.listeners) {
      listener.onGameOver(state.winnerId ?? null, state.winnerCondition ?? '')
    }
  }
}

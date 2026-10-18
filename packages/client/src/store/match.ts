/**
 * 视图状态：选中、悬停、预览、卡牌目标和快照。
 * 生命、资源、占位、胜负只来自 Gateway 快照。
 */
import { markRaw } from 'vue'
import { defineStore } from 'pinia'
import type { CardTarget, Command, DomainEvent, EntityRef, GameSnapshot, GridPos, MatchConfig } from '@battle/shared'
import { CARD_IDS } from '@battle/shared'
import { BUILDING_TYPE_IDS, UNIT_TYPE_IDS } from '@battle/sim'
import type { RuleAIOptions } from '@battle/ai'
import { createLocalGateway, type MatchGateway, type PhaseInfo } from '../gateway/index.js'
import { pickAt } from '../preview/pick.js'
import { linesFromCommandDiff, linesFromEvents, type MatchLogEntry } from '../log/match-log.js'

export type InteractionMode = 'select' | 'build' | 'patrol' | 'repair' | 'card'
export type AiDifficulty = 'default' | 'conservative' | 'aggressive'

export const useMatchStore = defineStore('match', {
  state: () => ({
    view: 'lobby' as 'lobby' | 'game',
    difficulty: 'default' as AiDifficulty,
    gateway: null as MatchGateway | null,
    unsubscribe: null as null | (() => void),
    snapshot: null as GameSnapshot | null,
    prevSnapshot: null as GameSnapshot | null,
    snapshotAtMs: 0,
    config: null as MatchConfig | null,
    localPlayerId: 'p0',
    selected: null as EntityRef | null,
    hover: null as GridPos | null,
    mode: 'select' as InteractionMode,
    buildTypeId: null as string | null,
    cardInstanceId: null as string | null,
    patrolPoints: [] as GridPos[],
    lastReason: '',
    phaseInfo: null as PhaseInfo | null,
    events: [] as DomainEvent[],
    logEntries: [] as MatchLogEntry[],
    logSeq: 0,
    winnerId: null as string | null,
    winnerCondition: '',
  }),
  getters: {
    player(state) {
      return state.snapshot?.players[state.localPlayerId] ?? null
    },
    selectedUnit(state) {
      if (!state.snapshot || state.selected?.kind !== 'unit') {
        return null
      }
      return state.snapshot.units[state.selected.id] ?? null
    },
    selectedBuilding(state) {
      if (!state.snapshot || state.selected?.kind !== 'building') {
        return null
      }
      return state.snapshot.buildings[state.selected.id] ?? null
    },
    isOperation(state) {
      return state.snapshot?.phase === 'OPERATION'
    },
    paused(state) {
      return state.phaseInfo?.paused === true
    },
    operationRemainMs(state) {
      if (!state.phaseInfo?.operationEndsAtMs) {
        return 0
      }
      return Math.max(0, state.phaseInfo.operationEndsAtMs - performance.now())
    },
  },
  actions: {
    startLocalMatch() {
      this.disposeGateway()
      this.logEntries = []
      this.logSeq = 0
      this.winnerId = null
      this.winnerCondition = ''
      this.selected = null
      this.snapshot = null
      this.prevSnapshot = null
      const gateway = markRaw(createLocalGateway())
      this.gateway = gateway
      this.unsubscribe = gateway.subscribe({
        onSnapshot: (snapshot, events) => {
          const prev = this.snapshot
          this.prevSnapshot = prev
          this.snapshot = snapshot
          this.snapshotAtMs = performance.now()
          this.events = events
          this.config = gateway.getConfig()
          if (this.config) {
            this.appendLog([
              ...linesFromEvents(events, snapshot, this.config, this.localPlayerId),
              ...linesFromCommandDiff(prev, snapshot, this.config, this.localPlayerId, events),
            ])
          }
          this.pruneSelection()
        },
        onPhase: (info) => {
          const prev = this.phaseInfo
          this.phaseInfo = info
          if (prev?.phase !== info.phase || prev?.round !== info.round) {
            this.appendLog([
              {
                round: info.round,
                tick: this.snapshot?.tick ?? 0,
                text: info.phase === 'OPERATION' ? `第 ${info.round} 回合进入操作阶段` : info.phase === 'AUTO' ? '进入自走阶段' : `阶段：${info.phase}`,
                relatedIds: [],
                tone: 'system',
              },
            ])
          }
          if (info.phase !== 'OPERATION') {
            this.resetInteraction()
          }
        },
        onCommandAck: (ack) => {
          this.lastReason = ack.accepted ? '' : (ack.reason ?? '指令被拒绝')
        },
        onGameOver: (winnerId, condition) => {
          this.winnerId = winnerId
          this.winnerCondition = condition
        },
      })
      gateway.startMatch({ aiOptions: difficultyOptions(this.difficulty) })
      this.view = 'game'
      this.resetInteraction()
    },
    backToLobby() {
      this.disposeGateway()
      this.view = 'lobby'
      this.snapshot = null
      this.prevSnapshot = null
      this.config = null
      this.logEntries = []
      this.logSeq = 0
    },
    appendLog(lines: Array<Omit<MatchLogEntry, 'id'>>) {
      if (lines.length === 0) {
        return
      }
      const next = [...this.logEntries]
      for (const line of lines) {
        this.logSeq += 1
        next.push({ ...line, id: this.logSeq })
      }
      this.logEntries = next.length > 300 ? next.slice(next.length - 300) : next
    },
    disposeGateway() {
      this.unsubscribe?.()
      this.unsubscribe = null
      this.gateway?.dispose()
      this.gateway = null
    },
    setHover(pos: GridPos | null) {
      this.hover = pos
    },
    resetInteraction() {
      this.mode = 'select'
      this.buildTypeId = null
      this.cardInstanceId = null
      this.patrolPoints = []
    },
    pruneSelection() {
      if (!this.snapshot || !this.selected) {
        return
      }
      if (this.selected.kind === 'unit') {
        const unit = this.snapshot.units[this.selected.id]
        if (!unit || unit.state === 'DEAD') {
          this.selected = null
        }
        return
      }
      const building = this.snapshot.buildings[this.selected.id]
      if (!building || building.state === 'DESTROYED') {
        this.selected = null
      }
    },
    sendCommand(target: EntityRef, command: Command) {
      if (!this.gateway || !this.isOperation) {
        this.lastReason = '当前阶段不能下达指令'
        return
      }
      const result = this.gateway.submitCommand(this.localPlayerId, target, command)
      if (result.accepted) {
        this.resetInteraction()
      }
    },
    sendClear() {
      if (!this.gateway || !this.selected) {
        return
      }
      const result = this.gateway.clearCommand(this.localPlayerId, this.selected)
      if (result.accepted) {
        this.resetInteraction()
      }
    },
    sendCard(target: CardTarget) {
      if (!this.gateway || !this.cardInstanceId || !this.isOperation) {
        this.lastReason = '当前阶段不能出牌'
        return
      }
      const result = this.gateway.playCard(this.localPlayerId, this.cardInstanceId, target)
      if (result.accepted) {
        this.resetInteraction()
      }
    },
    endOperation() {
      if (!this.gateway || !this.isOperation) {
        return
      }
      this.gateway.endOperation()
      this.resetInteraction()
    },
    togglePause() {
      if (!this.gateway || this.snapshot?.phase === 'GAME_OVER') {
        return
      }
      this.gateway.setPaused(!this.paused)
    },
    onLeftClick(pos: GridPos) {
      if (!this.snapshot) {
        return
      }
      if (this.mode === 'card' && this.cardInstanceId) {
        this.clickCardTarget(pos)
        return
      }
      if (this.mode === 'build' && this.selected?.kind === 'unit' && this.buildTypeId) {
        this.sendCommand(this.selected, { type: 'BUILD', buildingTypeId: this.buildTypeId, origin: pos })
        return
      }
      if (this.mode === 'patrol' && this.selected?.kind === 'unit') {
        this.patrolPoints = [...this.patrolPoints, pos]
        if (this.patrolPoints.length >= 2) {
          this.sendCommand(this.selected, { type: 'PATROL', points: this.patrolPoints.slice(0, 2) })
        }
        return
      }
      if (this.mode === 'repair' && this.selected?.kind === 'unit') {
        const hit = pickAt(this.snapshot, pos, this.localPlayerId)
        if (hit.kind === 'building' && hit.building.ownerId === this.localPlayerId) {
          this.sendCommand(this.selected, { type: 'REPAIR', target: { kind: 'building', id: hit.building.id } })
        } else {
          this.lastReason = '请选择己方建筑'
        }
        return
      }
      const hit = pickAt(this.snapshot, pos, this.localPlayerId)
      if (hit.kind === 'unit' && hit.unit.ownerId === this.localPlayerId) {
        this.selected = { kind: 'unit', id: hit.unit.id }
        this.resetInteraction()
        return
      }
      if (hit.kind === 'building' && hit.building.ownerId === this.localPlayerId) {
        this.selected = { kind: 'building', id: hit.building.id }
        this.resetInteraction()
        return
      }
      this.selected = null
      this.resetInteraction()
    },
    onRightClick(pos: GridPos) {
      if (!this.snapshot || !this.isOperation || this.selected?.kind !== 'unit') {
        return
      }
      const unit = this.snapshot.units[this.selected.id]
      if (!unit) {
        return
      }
      const allowed = this.config?.units[unit.typeId]?.commands ?? []
      const hit = pickAt(this.snapshot, pos)
      if (hit.kind === 'unit' && hit.unit.ownerId !== this.localPlayerId && allowed.includes('ATTACK')) {
        this.sendCommand(this.selected, { type: 'ATTACK', target: { kind: 'unit', id: hit.unit.id } })
        return
      }
      if (hit.kind === 'building' && hit.building.ownerId !== this.localPlayerId && allowed.includes('ATTACK')) {
        this.sendCommand(this.selected, { type: 'ATTACK', target: { kind: 'building', id: hit.building.id } })
        return
      }
      if (allowed.includes('MOVE')) {
        this.sendCommand(this.selected, { type: 'MOVE', to: pos })
      }
    },
    beginBuild(typeId: string) {
      this.mode = 'build'
      this.buildTypeId = typeId
      this.cardInstanceId = null
      this.patrolPoints = []
    },
    beginPatrol() {
      this.mode = 'patrol'
      this.patrolPoints = []
      this.buildTypeId = null
      this.cardInstanceId = null
    },
    beginRepair() {
      this.mode = 'repair'
      this.buildTypeId = null
      this.cardInstanceId = null
    },
    beginCard(instanceId: string) {
      this.mode = 'card'
      this.cardInstanceId = instanceId
      this.buildTypeId = null
      this.patrolPoints = []
    },
    produce(unitTypeId: string) {
      if (this.selected?.kind !== 'building') {
        return
      }
      this.sendCommand(this.selected, { type: 'PRODUCE', unitTypeId })
    },
    clickCardTarget(pos: GridPos) {
      if (!this.snapshot || !this.cardInstanceId) {
        return
      }
      const card = this.player?.hand.find((item) => item.instanceId === this.cardInstanceId)
      if (!card) {
        return
      }
      if (card.cardId === CARD_IDS.artilleryBarrage) {
        this.sendCard({ type: 'CELL', pos })
        return
      }
      const hit = pickAt(this.snapshot, pos, this.localPlayerId)
      if (card.cardId === CARD_IDS.emergencyRepair && hit.kind === 'building' && hit.building.ownerId === this.localPlayerId) {
        this.sendCard({ type: 'BUILDING', id: hit.building.id })
        return
      }
      if (card.cardId === CARD_IDS.battleInspiration && hit.kind === 'unit' && hit.unit.ownerId === this.localPlayerId) {
        this.sendCard({ type: 'UNIT', id: hit.unit.id })
        return
      }
      this.lastReason = '卡牌目标非法'
    },
  },
})

function difficultyOptions(difficulty: AiDifficulty): RuleAIOptions {
  if (difficulty === 'conservative') {
    return { reserve: { wood: 80, ore: 40 } }
  }
  if (difficulty === 'aggressive') {
    return { reserve: { wood: 0, ore: 0 } }
  }
  return {}
}

export { BUILDING_TYPE_IDS, UNIT_TYPE_IDS }

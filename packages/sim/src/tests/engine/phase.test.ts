import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AUTO_TICK_LIMIT, TICK_MS } from '@battle/shared'
import { REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

function movingSim() {
  const sim = createSimulator({
    config: createTestMatchConfig({
      units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
    }),
  })
  sim.startMatch()
  return sim
}

describe('阶段机', () => {
  it('从大厅进入第 1 轮操作阶段', () => {
    const sim = movingSim()
    const state = sim.getState()
    assert.equal(state.phase, 'OPERATION')
    assert.equal(state.round, 1)
    assert.equal(state.tick, 0)
    assert.equal(state.players['p0']?.energy, 10)
    assert.equal(state.players['p0']?.hand.length, 5)
  })

  it('操作阶段 tick 不推进模拟', () => {
    const sim = movingSim()
    const result = sim.tick()
    assert.deepEqual(result.events, [])
    assert.equal(sim.getState().tick, 0)
    assert.equal(sim.getState().phase, 'OPERATION')
  })

  it('结束操作后进入自走，并拒绝新指令', () => {
    const sim = movingSim()
    sim.endOperationPhase()
    assert.equal(sim.getState().phase, 'AUTO')
    assert.equal(sim.getState().phaseTicksRemaining, AUTO_TICK_LIMIT)
    const rejected = sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 1, y: 0 } })
    assert.deepEqual(rejected, { accepted: false, reason: REJECT.WRONG_PHASE })
  })

  it('自走打满 tick 后可以进入下一轮操作', () => {
    const sim = movingSim()
    const accepted = sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 1, y: 0 } })
    assert.equal(accepted.accepted, true)
    sim.endOperationPhase()
    for (let i = 0; i < AUTO_TICK_LIMIT; i += 1) {
      sim.tick()
    }
    assert.equal(sim.getState().phaseTicksRemaining, 0)
    assert.equal(sim.getState().tick, AUTO_TICK_LIMIT)
    sim.startOperationPhase()
    assert.equal(sim.getState().phase, 'OPERATION')
    assert.equal(sim.getState().round, 2)
    assert.equal(sim.getState().players['p0']?.energy, 10)
  })

  it('每个逻辑 tick 固定 50ms', () => {
    assert.equal(TICK_MS, 50)
    assert.equal(AUTO_TICK_LIMIT, 300)
  })

  it('默认 50×50 对局可以开局', () => {
    const sim = createSimulator()
    sim.startMatch()
    assert.equal(sim.getState().map.width, 50)
    assert.equal(sim.getState().map.height, 50)
    assert.equal(Object.keys(sim.getState().units).length, 6)
    assert.equal(Object.keys(sim.getState().buildings).length, 2)
  })
})

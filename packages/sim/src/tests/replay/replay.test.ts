import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'
import { replay } from '../../replay/replay.js'

describe('回放', () => {
  it('重放命令日志得到相同哈希', () => {
    const config = createTestMatchConfig({
      units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
    })
    const sim = createSimulator({ config, matchId: 'replay', rngSeed: 9 })
    sim.startMatch()
    sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 2, y: 0 } })
    sim.endOperationPhase()
    while (sim.getState().phase === 'AUTO' && sim.getState().phaseTicksRemaining > 0) {
      sim.tick()
    }
    const recorded = replay(sim.getReplayLog())
    assert.equal(recorded.sim.getStateHash(), sim.getStateHash())
    assert.equal(recorded.sim.getState().units['u0']?.pos.x, 2)
  })
})

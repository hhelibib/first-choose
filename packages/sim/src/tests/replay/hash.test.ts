import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

function sameSetup() {
  const config = createTestMatchConfig({
    units: [
      { ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } },
      { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 7, y: 7 } },
    ],
  })
  return {
    a: createSimulator({ config, matchId: 'hash', rngSeed: 7 }),
    b: createSimulator({ config, matchId: 'hash', rngSeed: 7 }),
  }
}

describe('状态哈希', () => {
  it('相同指令序列逐 tick 哈希一致', () => {
    const { a, b } = sameSetup()
    a.startMatch()
    b.startMatch()
    assert.equal(a.getStateHash(), b.getStateHash())
    a.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 3, y: 0 } })
    b.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 3, y: 0 } })
    a.endOperationPhase()
    b.endOperationPhase()
    for (let i = 0; i < 40; i += 1) {
      const left = a.tick()
      const right = b.tick()
      assert.equal(left.stateHash, right.stateHash)
      assert.deepEqual(left.events, right.events)
    }
  })

  it('不同移动目标会产生不同哈希', () => {
    const { a, b } = sameSetup()
    a.startMatch()
    b.startMatch()
    a.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 3, y: 0 } })
    b.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 0, y: 3 } })
    a.endOperationPhase()
    b.endOperationPhase()
    for (let i = 0; i < 20; i += 1) {
      a.tick()
      b.tick()
    }
    assert.notEqual(a.getStateHash(), b.getStateHash())
  })
})

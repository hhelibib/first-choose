import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '@battle/sim'
import { planOperation } from '../rule-ai.js'

describe('规则 AI', () => {
  it('只通过命令接口给战斗单位下达攻击', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 1, y: 0 } },
        ],
      }),
    })
    sim.startMatch()
    planOperation(sim, 'p1')
    assert.equal(sim.getState().units['u1']?.command?.type, 'ATTACK')
    sim.endOperationPhase()
    sim.tick()
    assert.equal(sim.getState().units['u0']?.hp, 71)
  })

  it('工人在有资源点时会采集', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 1, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
        resourceNodes: [{ id: 'wood-1', resource: 'wood', pos: { x: 2, y: 0 }, amount: 50 }],
        startingResources: { wood: 0, ore: 0, gold: 0 },
      }),
    })
    sim.startMatch()
    planOperation(sim, 'p1')
    assert.equal(sim.getState().units['u0']?.command?.type, 'GATHER')
  })
})

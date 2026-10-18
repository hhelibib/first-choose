import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '@battle/sim'
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

  it('工人会建造伐木场', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 1, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
        startingResources: { wood: 60, ore: 0, gold: 0 },
      }),
    })
    sim.startMatch()
    planOperation(sim, 'p1')
    const command = sim.getState().units['u0']?.command
    assert.equal(command?.type, 'BUILD')
    assert.equal(command?.type === 'BUILD' ? command.buildingTypeId : '', BUILDING_TYPE_IDS.lumberCamp)
  })
})

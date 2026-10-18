import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

describe('采集', () => {
  it('工人采集后送回主基地并清空耗尽的资源点指令', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 0, y: 2 } }],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
        resourceNodes: [{ id: 'wood-1', resource: 'wood', pos: { x: 1, y: 0 }, amount: 10 }],
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'GATHER', resourceNodeId: 'wood-1' }).accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 50; i += 1) {
      sim.tick()
    }
    assert.equal(sim.getState().players['p0']?.resources.wood, 110)
    assert.equal(sim.getState().map.resourceNodes[0]?.remaining, 0)
    assert.equal(sim.getState().units['u0']?.command, null)
    assert.equal(sim.getState().units['u0']?.carry, undefined)
    assert.equal(sim.getState().players['p0']?.stats.resourcesGathered, 10)
  })

  it('未知资源点会被拒绝', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
      }),
    })
    sim.startMatch()
    assert.deepEqual(sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'GATHER', resourceNodeId: 'missing' }), {
      accepted: false,
      reason: REJECT.TARGET_INVALID,
    })
  })

  it('战斗单位不能采集', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } }],
        resourceNodes: [{ id: 'wood-1', resource: 'wood', pos: { x: 1, y: 0 }, amount: 10 }],
      }),
    })
    sim.startMatch()
    assert.deepEqual(sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'GATHER', resourceNodeId: 'wood-1' }), {
      accepted: false,
      reason: REJECT.COMMAND_NOT_ALLOWED,
    })
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

describe('采集', () => {
  it('资源建筑完工后消耗工人并自动产出', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
        startingResources: { wood: 100, ore: 0, gold: 0 },
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, {
        type: 'BUILD',
        buildingTypeId: BUILDING_TYPE_IDS.lumberCamp,
        origin: { x: 1, y: 0 },
      }).accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 200 && Object.values(sim.getState().buildings)[0]?.state !== 'ACTIVE'; i += 1) {
      sim.tick()
    }
    const building = Object.values(sim.getState().buildings)[0]
    assert.equal(building?.typeId, BUILDING_TYPE_IDS.lumberCamp)
    assert.equal(building?.state, 'ACTIVE')
    const worker = sim.getState().units['u0']
    assert.ok(!worker || worker.state === 'DEAD')
    assert.equal(sim.getState().players['p0']?.resources.wood, 40)
    for (let i = 0; i < 20; i += 1) {
      sim.tick()
    }
    assert.equal(sim.getState().players['p0']?.resources.wood, 48)
    assert.equal(sim.getState().players['p0']?.stats.resourcesGathered, 8)
  })

  it('工人不能再对资源点采集', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
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

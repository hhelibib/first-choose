import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

describe('维修', () => {
  it('工人维修己方建筑并在满血后停止', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 1, y: 1 } }],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 1 } }],
      }),
    })
    sim.startMatch()
    const building = sim.getState().buildings['b0']
    assert.ok(building)
    building.hp = 780
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'REPAIR', target: { kind: 'building', id: 'b0' } })
        .accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 20; i += 1) {
      sim.tick()
    }
    assert.equal(sim.getState().buildings['b0']?.hp, 800)
    assert.equal(sim.getState().players['p0']?.resources.ore, 49)
    assert.equal(sim.getState().units['u0']?.command, null)
  })

  it('不能维修敌方建筑', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 1, typeId: BUILDING_TYPE_IDS.arrowTower, origin: { x: 3, y: 3 } }],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 2, y: 3 } }],
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'REPAIR', target: { kind: 'building', id: 'b0' } })
        .accepted,
      false,
    )
  })
})

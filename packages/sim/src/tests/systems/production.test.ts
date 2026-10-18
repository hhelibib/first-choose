import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

describe('生产', () => {
  it('主基地扣除资源后在出口格生成工人', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 0, y: 0 } }],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 3, y: 3 } }],
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'building', id: 'b0' }, { type: 'PRODUCE', unitTypeId: UNIT_TYPE_IDS.worker })
        .accepted,
      true,
    )
    assert.equal(sim.getState().players['p0']?.resources.wood, 50)
    assert.equal(sim.getState().players['p0']?.population, 2)
    sim.endOperationPhase()
    for (let i = 0; i < 100; i += 1) {
      sim.tick()
    }
    const spawned = sim.getState().units['u1']
    assert.ok(spawned)
    assert.deepEqual(spawned.pos, { x: 2, y: 0 })
    assert.equal(spawned.typeId, UNIT_TYPE_IDS.worker)
    assert.equal(spawned.moveRemaining, sim.getState().config.units[UNIT_TYPE_IDS.worker]?.moveRange)
    assert.equal(sim.getState().buildings['b0']?.command, null)
    assert.equal(sim.getState().players['p0']?.population, 2)
  })

  it('人口满时拒绝生产', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 0, y: 0 } }],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 3, y: 3 } }],
        populationCap: 1,
      }),
    })
    sim.startMatch()
    assert.deepEqual(
      sim.submitCommand('p0', { kind: 'building', id: 'b0' }, { type: 'PRODUCE', unitTypeId: UNIT_TYPE_IDS.worker }),
      { accepted: false, reason: REJECT.POPULATION_CAP },
    )
    assert.equal(sim.getState().players['p0']?.resources.wood, 100)
  })

  it('资源不足时拒绝生产', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 0, y: 0 } }],
        startingResources: { wood: 40, ore: 50, gold: 0 },
      }),
    })
    sim.startMatch()
    assert.deepEqual(
      sim.submitCommand('p0', { kind: 'building', id: 'b0' }, { type: 'PRODUCE', unitTypeId: UNIT_TYPE_IDS.worker }),
      { accepted: false, reason: REJECT.NOT_ENOUGH_RESOURCES },
    )
  })

  it('停止生产会退还已扣资源', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 0, y: 0 } }],
      }),
    })
    sim.startMatch()
    sim.submitCommand('p0', { kind: 'building', id: 'b0' }, { type: 'PRODUCE', unitTypeId: UNIT_TYPE_IDS.worker })
    assert.equal(sim.getState().players['p0']?.resources.wood, 50)
    sim.clearCommand('p0', { kind: 'building', id: 'b0' })
    assert.equal(sim.getState().players['p0']?.resources.wood, 100)
    assert.equal(sim.getState().buildings['b0']?.command, null)
  })
})

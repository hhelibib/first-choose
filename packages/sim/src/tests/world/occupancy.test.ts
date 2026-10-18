import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'
import type { Simulator } from '../../engine/simulator.js'

function occupancyAt(sim: Simulator, pos: { x: number; y: number }) {
  return sim.getState().occupancy.cells[pos.y]?.[pos.x]
}

describe('占位', () => {
  it('同一格竞争时 ID 较小的单位进入', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } },
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 2, y: 0 } },
        ],
      }),
    })
    sim.startMatch()
    sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 1, y: 0 } })
    sim.submitCommand('p0', { kind: 'unit', id: 'u1' }, { type: 'MOVE', to: { x: 1, y: 0 } })
    sim.endOperationPhase()
    for (let i = 0; i < 10; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 1, y: 0 })
    assert.deepEqual(sim.getState().units['u1']?.pos, { x: 2, y: 0 })
    assert.equal(occupancyAt(sim, { x: 1, y: 0 })?.unitId, 'u0')
    assert.equal(occupancyAt(sim, { x: 2, y: 0 })?.unitId, 'u1')
  })

  it('两个单位可以同时互换格子', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } },
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 1, y: 0 } },
        ],
      }),
    })
    sim.startMatch()
    sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 1, y: 0 } })
    sim.submitCommand('p0', { kind: 'unit', id: 'u1' }, { type: 'MOVE', to: { x: 0, y: 0 } })
    sim.endOperationPhase()
    for (let i = 0; i < 10; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 1, y: 0 })
    assert.deepEqual(sim.getState().units['u1']?.pos, { x: 0, y: 0 })
    assert.equal(occupancyAt(sim, { x: 1, y: 0 })?.unitId, 'u0')
    assert.equal(occupancyAt(sim, { x: 0, y: 0 })?.unitId, 'u1')
  })

  it('建筑占地阻挡单位', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 1, y: 1 } }],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
      }),
    })
    sim.startMatch()
    assert.equal(occupancyAt(sim, { x: 1, y: 1 })?.buildingId, 'b0')
    assert.equal(occupancyAt(sim, { x: 2, y: 2 })?.buildingId, 'b0')
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 1, y: 1 } }).accepted,
      false,
    )
  })
})

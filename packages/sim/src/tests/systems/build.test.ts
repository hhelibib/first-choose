import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

describe('建造', () => {
  it('工人在相邻格开始建造并在完成后激活建筑', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 1, y: 0 } }],
        startingResources: { wood: 100, ore: 80, gold: 0 },
      }),
    })
    sim.startMatch()
    assert.equal(
      sim
        .submitCommand('p0', { kind: 'unit', id: 'u0' }, {
          type: 'BUILD',
          buildingTypeId: BUILDING_TYPE_IDS.arrowTower,
          origin: { x: 2, y: 0 },
        }).accepted,
      true,
    )
    sim.endOperationPhase()
    const started = sim.tick()
    assert.equal(
      started.events.some((event) => event.type === 'BUILDING_PLACED'),
      true,
    )
    const placed = Object.values(sim.getState().buildings)[0]
    assert.equal(placed?.state, 'CONSTRUCTING')
    assert.equal(sim.getState().players['p0']?.resources.wood, 60)
    assert.equal(sim.getState().players['p0']?.resources.ore, 20)
    assert.equal(sim.getState().occupancy.cells[0]?.[2]?.buildingId, placed?.id)
    for (let i = 0; i < 159; i += 1) {
      sim.tick()
    }
    assert.equal(sim.getState().buildings[placed?.id ?? '']?.state, 'ACTIVE')
    assert.equal(sim.getState().units['u0']?.command, null)
  })

  it('停止建造会退款并释放占地', () => {
    const config = createTestMatchConfig({
      units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 1, y: 0 } }],
      startingResources: { wood: 100, ore: 80, gold: 0 },
    })
    const tower = config.buildings[BUILDING_TYPE_IDS.arrowTower]
    if (tower) {
      tower.buildTimeMs = 40_000
    }
    const sim = createSimulator({ config })
    sim.startMatch()
    sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, {
      type: 'BUILD',
      buildingTypeId: BUILDING_TYPE_IDS.arrowTower,
      origin: { x: 2, y: 0 },
    })
    sim.endOperationPhase()
    sim.tick()
    assert.equal(Object.keys(sim.getState().buildings).length, 1)
    while (sim.getState().phaseTicksRemaining > 0) {
      sim.tick()
    }
    sim.startOperationPhase()
    sim.clearCommand('p0', { kind: 'unit', id: 'u0' })
    assert.equal(Object.keys(sim.getState().buildings).length, 0)
    assert.equal(sim.getState().players['p0']?.resources.wood, 100)
    assert.equal(sim.getState().players['p0']?.resources.ore, 80)
    assert.equal(sim.getState().occupancy.cells[0]?.[2]?.buildingId, undefined)
  })

  it('不能在阻挡格上建造', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        blocked: [{ x: 2, y: 0 }],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 1, y: 0 } }],
      }),
    })
    sim.startMatch()
    assert.deepEqual(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, {
        type: 'BUILD',
        buildingTypeId: BUILDING_TYPE_IDS.arrowTower,
        origin: { x: 2, y: 0 },
      }),
      { accepted: false, reason: REJECT.CELL_INVALID },
    )
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

function startWorkerAt(
  pos: { x: number; y: number },
  extra: Parameters<typeof createTestMatchConfig>[0] = {},
) {
  const sim = createSimulator({
    config: createTestMatchConfig({
      ...extra,
      units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos }, ...(extra.units ?? [])],
    }),
  })
  sim.startMatch()
  return sim
}

describe('移动', () => {
  it('工人 10 个 tick 走一格', () => {
    const sim = startWorkerAt({ x: 0, y: 0 })
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 2, y: 0 } }).accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 9; i += 1) {
      sim.tick()
      assert.deepEqual(sim.getState().units['u0']?.pos, { x: 0, y: 0 })
    }
    const tenth = sim.tick()
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 1, y: 0 })
    assert.deepEqual(tenth.events, [
      { type: 'UNIT_MOVED', unitId: 'u0', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
    ])
    for (let i = 0; i < 10; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 2, y: 0 })
    assert.equal(sim.getState().units['u0']?.command, null)
    assert.equal(sim.getState().units['u0']?.state, 'IDLE')
  })

  it('绕过阻挡地形', () => {
    const sim = startWorkerAt({ x: 0, y: 1 }, { blocked: [{ x: 1, y: 1 }] })
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 2, y: 1 } }).accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 40; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 2, y: 1 })
  })

  it('拒绝走进阻挡或建筑格', () => {
    const sim = startWorkerAt(
      { x: 0, y: 0 },
      {
        blocked: [{ x: 1, y: 0 }],
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.arrowTower, origin: { x: 0, y: 1 } }],
      },
    )
    assert.deepEqual(sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 1, y: 0 } }), {
      accepted: false,
      reason: REJECT.CELL_INVALID,
    })
    assert.deepEqual(sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 0, y: 1 } }), {
      accepted: false,
      reason: REJECT.CELL_INVALID,
    })
  })

  it('已在目标格的移动立即完成', () => {
    const sim = startWorkerAt({ x: 2, y: 2 })
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 2, y: 2 } }).accepted,
      true,
    )
    assert.equal(sim.getState().units['u0']?.command, null)
    assert.equal(sim.getState().units['u0']?.state, 'IDLE')
  })

  it('本回合走尽移动格后停下，指令保留到下一回合', () => {
    const config = createTestMatchConfig({
      units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } }],
    })
    config.units[UNIT_TYPE_IDS.worker] = { ...config.units[UNIT_TYPE_IDS.worker]!, moveRange: 1 }
    const sim = createSimulator({ config })
    sim.startMatch()
    const unit = sim.getState().units['u0']
    assert.equal(unit?.moveRemaining, 1)
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 3, y: 0 } }).accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 30; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 1, y: 0 })
    assert.equal(sim.getState().units['u0']?.moveRemaining, 0)
    assert.equal(sim.getState().units['u0']?.command?.type, 'MOVE')
    while (sim.getState().phaseTicksRemaining > 0) {
      sim.tick()
    }
    sim.startOperationPhase()
    assert.equal(sim.getState().units['u0']?.moveRemaining, 1)
    assert.equal(sim.getState().units['u0']?.command?.type, 'MOVE')
    sim.endOperationPhase()
    for (let i = 0; i < 10; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 2, y: 0 })
    assert.equal(sim.getState().units['u0']?.moveRemaining, 0)
  })

  it('巡逻在两点间循环且指令保留', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } }],
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, {
        type: 'PATROL',
        points: [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ],
      }).accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 8; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 1, y: 0 })
    assert.equal(sim.getState().units['u0']?.command?.type, 'PATROL')
    for (let i = 0; i < 8; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 0, y: 0 })
    assert.equal(sim.getState().units['u0']?.command?.type, 'PATROL')
  })
})

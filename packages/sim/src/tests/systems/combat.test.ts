import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

function startAuto(config: Parameters<typeof createTestMatchConfig>[0]) {
  const sim = createSimulator({ config: createTestMatchConfig(config) })
  sim.startMatch()
  sim.endOperationPhase()
  return sim
}

describe('攻击', () => {
  it('空闲战斗单位会向射程内敌人开火', () => {
    const sim = startAuto({
      units: [
        { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
        { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 1, y: 0 } },
      ],
    })
    const result = sim.tick()
    const damage = result.events.filter((event) => event.type === 'DAMAGE_APPLIED')
    assert.equal(damage.length, 2)
    assert.equal(damage[0]?.amount, 9)
    assert.equal(sim.getState().units['u0']?.hp, 71)
    assert.equal(sim.getState().units['u1']?.hp, 71)
  })

  it('MOVE 中的战斗单位不自动索敌', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 1 } },
        ],
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'MOVE', to: { x: 3, y: 0 } }).accepted,
      true,
    )
    sim.endOperationPhase()
    sim.tick()
    assert.equal(sim.getState().units['u0']?.hp, 71)
    assert.equal(sim.getState().units['u1']?.hp, 80)
    assert.equal(sim.getState().units['u0']?.command?.type, 'MOVE')
  })

  it('锁定攻击会追击并在目标死亡后清空指令', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: UNIT_TYPE_IDS.worker, pos: { x: 3, y: 0 } },
        ],
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'ATTACK', target: { kind: 'unit', id: 'u1' } })
        .accepted,
      true,
    )
    sim.endOperationPhase()
    for (let i = 0; i < 16; i += 1) {
      sim.tick()
    }
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 2, y: 0 })
    assert.equal(sim.getState().units['u1']?.hp, 40)
    for (let i = 0; i < 80; i += 1) {
      sim.tick()
    }
    assert.equal(sim.getState().units['u1'], undefined)
    assert.equal(sim.getState().units['u0']?.command, null)
    assert.equal(sim.getState().units['u0']?.state, 'IDLE')
  })

  it('工人不会自动攻击', () => {
    const sim = startAuto({
      units: [
        { ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 0, y: 0 } },
        { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 1, y: 0 } },
      ],
    })
    const result = sim.tick()
    assert.equal(
      result.events.some((event) => event.type === 'ATTACK_STARTED' && event.attackerId === 'u0'),
      false,
    )
    assert.equal(sim.getState().units['u1']?.hp, 80)
  })

  it('箭塔只攻击射程内的敌方单位', () => {
    const sim = startAuto({
      buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.arrowTower, origin: { x: 1, y: 1 } }],
      units: [{ ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 1, y: 3 } }],
    })
    const result = sim.tick()
    const hit = result.events.find((event) => event.type === 'DAMAGE_APPLIED')
    assert.equal(hit?.amount, 7)
    assert.equal(hit?.targetId, 'u0')
    assert.equal(sim.getState().units['u0']?.hp, 73)
  })

  it('不能攻击友军', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.worker, pos: { x: 1, y: 0 } },
        ],
      }),
    })
    sim.startMatch()
    assert.deepEqual(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'ATTACK', target: { kind: 'unit', id: 'u1' } }),
      { accepted: false, reason: REJECT.TARGET_INVALID },
    )
  })

  it('巡逻遇敌时插入攻击并保留巡逻指令', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 1 } },
        ],
      }),
    })
    sim.startMatch()
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, {
        type: 'PATROL',
        points: [
          { x: 3, y: 0 },
          { x: 0, y: 0 },
        ],
      }).accepted,
      true,
    )
    sim.endOperationPhase()
    sim.tick()
    assert.equal(sim.getState().units['u0']?.command?.type, 'PATROL')
    assert.deepEqual(sim.getState().units['u0']?.pos, { x: 0, y: 0 })
    assert.equal(sim.getState().units['u1']?.hp, 71)
  })

  it('相同攻击序列哈希一致', () => {
    const config = createTestMatchConfig({
      units: [
        { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
        { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 1, y: 0 } },
      ],
    })
    const a = createSimulator({ config, matchId: 'atk', rngSeed: 3 })
    const b = createSimulator({ config, matchId: 'atk', rngSeed: 3 })
    a.startMatch()
    b.startMatch()
    a.endOperationPhase()
    b.endOperationPhase()
    for (let i = 0; i < 5; i += 1) {
      assert.equal(a.tick().stateHash, b.tick().stateHash)
    }
  })
})

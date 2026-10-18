import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUILDING_TYPE_IDS, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

describe('胜利', () => {
  it('摧毁对方主基地后结束对局', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [
          { ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 3, y: 0 } },
        ],
        units: [{ ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 2, y: 0 } }],
      }),
    })
    sim.startMatch()
    const enemyBase = sim.getState().buildings['b1']
    assert.ok(enemyBase)
    enemyBase.hp = 5
    assert.equal(
      sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'ATTACK', target: { kind: 'building', id: 'b1' } })
        .accepted,
      true,
    )
    sim.endOperationPhase()
    const result = sim.tick()
    assert.equal(result.victory?.condition, 'DESTROY_MAIN_BASE')
    assert.equal(result.victory?.winnerId, 'p0')
    assert.equal(sim.getState().phase, 'GAME_OVER')
    assert.equal(sim.tick().events.length, 0)
  })

  it('同一 tick 双方主基地都被摧毁则没有胜者', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [
          { ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 3, y: 0 } },
        ],
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 2, y: 0 } },
          { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 2, y: 1 } },
        ],
      }),
    })
    sim.startMatch()
    sim.getState().buildings['b0']!.hp = 5
    sim.getState().buildings['b1']!.hp = 5
    sim.submitCommand('p0', { kind: 'unit', id: 'u0' }, { type: 'ATTACK', target: { kind: 'building', id: 'b1' } })
    sim.submitCommand('p1', { kind: 'unit', id: 'u1' }, { type: 'ATTACK', target: { kind: 'building', id: 'b0' } })
    sim.endOperationPhase()
    const result = sim.tick()
    assert.equal(result.victory?.condition, 'MUTUAL_DESTRUCTION')
    assert.equal(result.victory?.winnerId, undefined)
    assert.equal(sim.getState().phase, 'GAME_OVER')
  })
})

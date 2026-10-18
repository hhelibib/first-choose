import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CARD_IDS } from '@battle/shared'
import { BUILDING_TYPE_IDS, REJECT, UNIT_TYPE_IDS, createSimulator, createTestMatchConfig } from '../../index.js'

describe('卡牌', () => {
  it('紧急修缮立即回复己方建筑生命', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 1, y: 1 } }],
      }),
    })
    sim.startMatch()
    const building = sim.getState().buildings['b0']
    assert.ok(building)
    building.hp = 700
    const card = sim.getState().players['p0']?.hand.find((item) => item.cardId === CARD_IDS.emergencyRepair)
    assert.ok(card)
    assert.equal(sim.playCard('p0', card.instanceId, { type: 'BUILDING', id: 'b0' }).accepted, true)
    assert.equal(sim.getState().buildings['b0']?.hp, 740)
    assert.equal(sim.getState().players['p0']?.energy, 7)
  })

  it('火力覆盖伤害 3×3 内的敌方单位且能击杀', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: UNIT_TYPE_IDS.worker, pos: { x: 2, y: 2 } },
        ],
      }),
    })
    sim.startMatch()
    const enemy = sim.getState().units['u1']
    assert.ok(enemy)
    enemy.hp = 10
    const card = sim.getState().players['p0']?.hand.find((item) => item.cardId === CARD_IDS.artilleryBarrage)
    assert.ok(card)
    const result = sim.playCard('p0', card.instanceId, { type: 'CELL', pos: { x: 2, y: 2 } })
    assert.equal(result.accepted, true)
    assert.equal(sim.getState().units['u1'], undefined)
    assert.equal(sim.getState().units['u0']?.hp, 80)
    assert.equal(sim.getState().players['p0']?.energy, 6)
  })

  it('战地鼓舞给己方战斗单位加攻击', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        units: [
          { ownerIndex: 0, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 0, y: 0 } },
          { ownerIndex: 1, typeId: UNIT_TYPE_IDS.fighter, pos: { x: 1, y: 0 } },
        ],
        deckCardIds: [CARD_IDS.battleInspiration, CARD_IDS.battleInspiration, CARD_IDS.battleInspiration, CARD_IDS.battleInspiration, CARD_IDS.battleInspiration],
      }),
    })
    sim.startMatch()
    const card = sim.getState().players['p0']?.hand[0]
    assert.ok(card)
    assert.equal(sim.playCard('p0', card.instanceId, { type: 'UNIT', id: 'u0' }).accepted, true)
    assert.equal(sim.getState().units['u0']?.buffs[0]?.attackBonus, 3)
    sim.endOperationPhase()
    const result = sim.tick()
    const hit = result.events.find((event) => event.type === 'DAMAGE_APPLIED' && event.sourceId === 'u0')
    assert.equal(hit?.type === 'DAMAGE_APPLIED' ? hit.amount : undefined, 12)
  })

  it('能量不足时拒绝出牌', () => {
    const sim = createSimulator({
      config: createTestMatchConfig({
        buildings: [{ ownerIndex: 0, typeId: BUILDING_TYPE_IDS.mainBase, origin: { x: 1, y: 1 } }],
      }),
    })
    sim.startMatch()
    const player = sim.getState().players['p0']
    assert.ok(player)
    player.energy = 2
    const card = player.hand.find((item) => item.cardId === CARD_IDS.emergencyRepair)
    assert.ok(card)
    assert.deepEqual(sim.playCard('p0', card.instanceId, { type: 'BUILDING', id: 'b0' }), {
      accepted: false,
      reason: REJECT.ENERGY,
    })
  })
})

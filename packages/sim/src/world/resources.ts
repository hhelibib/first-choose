/**
 * 资源支付与退款。只改传入的 Resources 对象，不读玩家状态。
 */
import type { Resources } from '@battle/shared'

export function canPay(have: Resources, cost: Resources): boolean {
  return (
    have.food >= cost.food &&
    have.wood >= cost.wood &&
    have.stone >= cost.stone &&
    have.ore >= cost.ore &&
    have.gold >= cost.gold
  )
}

export function pay(have: Resources, cost: Resources): void {
  have.food -= cost.food
  have.wood -= cost.wood
  have.stone -= cost.stone
  have.ore -= cost.ore
  have.gold -= cost.gold
}

export function refund(have: Resources, cost: Resources): void {
  have.food += cost.food
  have.wood += cost.wood
  have.stone += cost.stone
  have.ore += cost.ore
  have.gold += cost.gold
}

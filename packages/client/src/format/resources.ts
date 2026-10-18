import type { Resources } from '@battle/shared'

export function formatResources(cost: Resources): string {
  const parts: string[] = []
  if (cost.wood > 0) {
    parts.push(`木 ${cost.wood}`)
  }
  if (cost.ore > 0) {
    parts.push(`矿 ${cost.ore}`)
  }
  if (cost.gold > 0) {
    parts.push(`金 ${cost.gold}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '免费'
}

export function formatDuration(ms: number): string {
  const seconds = ms / 1000
  return Number.isInteger(seconds) ? `${seconds}秒` : `${seconds.toFixed(1)}秒`
}

export function canAfford(have: Resources | null | undefined, cost: Resources): boolean {
  if (!have) {
    return false
  }
  return have.wood >= cost.wood && have.ore >= cost.ore && have.gold >= cost.gold
}

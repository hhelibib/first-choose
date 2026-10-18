import type { ResourceType, Resources } from '@battle/shared'

const LABELS: Record<ResourceType, string> = {
  food: '粮',
  wood: '木',
  stone: '石',
  ore: '矿',
  gold: '金',
}

export function resourceLabel(type: ResourceType): string {
  return LABELS[type]
}

export function formatResources(cost: Resources): string {
  const parts: string[] = []
  for (const key of ['food', 'wood', 'stone', 'ore', 'gold'] as const) {
    if (cost[key] > 0) {
      parts.push(`${LABELS[key]} ${cost[key]}`)
    }
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
  return (
    have.food >= cost.food &&
    have.wood >= cost.wood &&
    have.stone >= cost.stone &&
    have.ore >= cost.ore &&
    have.gold >= cost.gold
  )
}

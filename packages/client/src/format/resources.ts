import type { ResourceType, Resources } from '@battle/shared'
import { t } from '../i18n/index.js'

const RES_KEYS: Record<ResourceType, string> = {
  food: 'res.food',
  wood: 'res.wood',
  stone: 'res.stone',
  ore: 'res.ore',
  gold: 'res.gold',
}

export function resourceLabel(type: ResourceType): string {
  return t(RES_KEYS[type])
}

export function resourceFull(type: ResourceType): string {
  return t(
    type === 'food'
      ? 'res.foodFull'
      : type === 'wood'
        ? 'res.woodFull'
        : type === 'stone'
          ? 'res.stoneFull'
          : type === 'ore'
            ? 'res.oreFull'
            : 'res.goldFull',
  )
}

export function formatResources(cost: Resources): string {
  const parts: string[] = []
  for (const key of ['food', 'wood', 'stone', 'ore', 'gold'] as const) {
    if (cost[key] > 0) {
      parts.push(`${t(RES_KEYS[key])} ${cost[key]}`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : t('res.free')
}

export function formatDuration(ms: number): string {
  const seconds = ms / 1000
  const n = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1)
  return t('res.sec', { n })
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

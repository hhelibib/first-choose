import { TICK_MS } from '@battle/shared'

export function remainingTicks(ms: number): number {
  return Math.max(0, Math.ceil(Math.max(0, ms) / TICK_MS))
}

export function etaTick(currentTick: number, remainingMs: number): number {
  return currentTick + remainingTicks(remainingMs)
}

export function remainingSeconds(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1)
}

export const TIP_IDS = {
  target: 'target',
  reject: 'reject',
  card: 'card',
} as const

export type TipId = (typeof TIP_IDS)[keyof typeof TIP_IDS]

const TIPS_ENABLED_KEY = 'battle-ba-show-tips'
const REJECT_TIPS_KEY = 'battle-ba-show-reject-tips'
const MUTED_KEY = 'battle-ba-muted-tips'

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key)
    if (saved === '0') {
      return false
    }
    if (saved === '1') {
      return true
    }
  } catch {
    /* ignore */
  }
  return fallback
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function readShowTipsPref(): boolean {
  return readFlag(TIPS_ENABLED_KEY, true)
}

export function writeShowTipsPref(value: boolean): void {
  writeFlag(TIPS_ENABLED_KEY, value)
}

export function readShowRejectTipsPref(): boolean {
  return readFlag(REJECT_TIPS_KEY, true)
}

export function writeShowRejectTipsPref(value: boolean): void {
  writeFlag(REJECT_TIPS_KEY, value)
}

export function readMutedTips(): TipId[] {
  try {
    const raw = localStorage.getItem(MUTED_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((id): id is TipId => id === TIP_IDS.target || id === TIP_IDS.reject || id === TIP_IDS.card)
  } catch {
    return []
  }
}

export function writeMutedTips(ids: TipId[]): void {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

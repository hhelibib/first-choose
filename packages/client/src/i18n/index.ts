import { computed, ref, watch } from 'vue'
import { REJECT } from '@battle/sim'
import type { Locale, MessageTable } from './types.js'
import { zhCN } from './zh-CN.js'
import { zhTW } from './zh-TW.js'
import { en } from './en.js'

const STORAGE = 'battle-ba-locale'

const tables: Record<Locale, MessageTable> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
}

export const locales: Locale[] = ['zh-CN', 'zh-TW', 'en']

// 检测语言类型
function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE)
    if (saved === 'zh-CN' || saved === 'zh-TW' || saved === 'en') {
      return saved
    }
  } catch {
    /* ignore */
  }
  const lang = typeof navigator === 'undefined' ? '' : navigator.language
  if (/^zh[-_]?(TW|HK|Hant)/i.test(lang)) {
    return 'zh-TW'
  }
  if (/^zh/i.test(lang)) {
    return 'zh-CN'
  }
  return 'en'
}

export const locale = ref<Locale>(detectLocale())

watch(
  locale,
  (value) => {
    try {
      localStorage.setItem(STORAGE, value)
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = value
    }
  },
  { immediate: true },
)

export function setLocale(next: Locale): void {
  locale.value = next
}

export const localeModel = computed({
  get: () => locale.value,
  set: (next: Locale) => {
    locale.value = next
  },
})

/**
 * 匹配 key 和填充值
 * @param key
 * @param params
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const table = tables[locale.value]
  let text = table[key] ?? zhCN[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

/**
 * 根据类型获取单位名称
 * @param typeId
 * @param fallback
 */
export function unitName(typeId: string, fallback?: string): string {
  const key = `unit.${typeId}.name`
  const value = t(key)
  return value === key ? (fallback ?? typeId) : value
}

/**
 * 根据类型获取单位描述
 * @param typeId
 * @param fallback
 */
export function unitDesc(typeId: string, fallback?: string): string {
  const key = `unit.${typeId}.desc`
  const value = t(key)
  return value === key ? (fallback ?? '') : value
}

/**
 * 根据类型获取建筑名称
 * @param typeId
 * @param fallback
 */
export function buildingName(typeId: string, fallback?: string): string {
  const key = `building.${typeId}.name`
  const value = t(key)
  return value === key ? (fallback ?? typeId) : value
}

/**
 * 根据类型获取建筑描述
 * @param typeId
 * @param fallback
 */
export function buildingDesc(typeId: string, fallback?: string): string {
  const key = `building.${typeId}.desc`
  const value = t(key)
  return value === key ? (fallback ?? '') : value
}

/**
 * 根据卡片id获取卡片名称
 * @param cardId
 * @param fallback
 */
export function cardName(cardId: string, fallback?: string): string {
  const key = `card.${cardId}.name`
  const value = t(key)
  return value === key ? (fallback ?? cardId) : value
}

/**
 * 根据类型获取指令名称
 * @param type
 */
export function commandName(type: string | undefined): string {
  if (!type) {
    return t('cmd.idle')
  }
  const key = `cmd.${type}`
  const value = t(key)
  return value === key ? type : value
}

const REJECT_KEYS: Record<string, string> = {
  [REJECT.WRONG_PHASE]: 'reject.WRONG_PHASE',
  [REJECT.WRONG_OWNER]: 'reject.WRONG_OWNER',
  [REJECT.UNIT_DEAD]: 'reject.UNIT_DEAD',
  [REJECT.BUILDING_DESTROYED]: 'reject.BUILDING_DESTROYED',
  [REJECT.NOT_FOUND]: 'reject.NOT_FOUND',
  [REJECT.COMMAND_NOT_ALLOWED]: 'reject.COMMAND_NOT_ALLOWED',
  [REJECT.TARGET_KIND]: 'reject.TARGET_KIND',
  [REJECT.CELL_INVALID]: 'reject.CELL_INVALID',
  [REJECT.PATROL_POINTS]: 'reject.PATROL_POINTS',
  [REJECT.TARGET_INVALID]: 'reject.TARGET_INVALID',
  [REJECT.NOT_ENOUGH_RESOURCES]: 'reject.NOT_ENOUGH_RESOURCES',
  [REJECT.POPULATION_CAP]: 'reject.POPULATION_CAP',
  [REJECT.BUILDING_NOT_READY]: 'reject.BUILDING_NOT_READY',
  [REJECT.ENERGY]: 'reject.ENERGY',
  [REJECT.CARD_NOT_IN_HAND]: 'reject.CARD_NOT_IN_HAND',
  [REJECT.CARD_NOT_READY]: 'reject.CARD_NOT_READY',
}

export function translateReason(reason: string): string {
  if (!reason) {
    return ''
  }
  if (reason.startsWith('reject.')) {
    return t(reason)
  }
  const key = REJECT_KEYS[reason]
  return key ? t(key) : reason
}

export type { Locale }

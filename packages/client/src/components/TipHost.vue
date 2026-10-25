<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore } from '../store/match'
import { formatDuration, formatResources, resourceFull } from '../format/resources'
import { buildingName, t, translateReason } from '../i18n/index'
import { TIP_IDS } from '../tips/prefs'
import TipPopup from './TipPopup.vue'

const store = useMatchStore()

const placing = computed(() =>
  store.mode === 'build' && store.buildTypeId ? store.config?.buildings[store.buildTypeId] ?? null : null,
)

const targetBody = computed(() => {
  const lines = [t('order.confirm')]
  const def = placing.value
  if (def) {
    const hint = `${formatResources(def.buildCost)} · ${formatDuration(def.buildTimeMs)}`
    lines.push(t('order.place', { name: buildingName(store.buildTypeId ?? '', def.name), hint }))
    if (def.harvest) {
      lines.push(t('order.harvest', { res: resourceFull(def.harvest.resource) }))
    }
  } else if (store.mode === 'repair') {
    lines.push(t('order.repair'))
  } else if (store.mode === 'patrol') {
    lines.push(t('order.patrol'))
  } else if (store.mode === 'card') {
    lines.push(t('card.hint'))
  }
  return lines.join('\n')
})

const rejectOpen = computed(() => !!store.lastReason && store.shouldShowTip(TIP_IDS.reject))
const targetOpen = computed(() => store.isTargeting && store.shouldShowTip(TIP_IDS.target))
</script>

<template>
  <TipPopup
    v-if="rejectOpen"
    :key="`reject-${store.lastReason}`"
    tone="warn"
    :title="t('tip.rejectTitle')"
    :body="translateReason(store.lastReason)"
    @close="(mute) => store.dismissTip(TIP_IDS.reject, mute)"
  />
  <TipPopup
    v-else-if="targetOpen"
    :key="`target-${store.mode}-${store.buildTypeId ?? ''}`"
    :title="t('order.hintTitle')"
    :body="targetBody"
    @close="(mute) => store.dismissTip(TIP_IDS.target, mute)"
  />
</template>

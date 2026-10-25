<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { t } from '../i18n/index'

const props = withDefaults(
  defineProps<{
    title: string
    body: string
    tone?: 'info' | 'warn'
  }>(),
  { tone: 'info' },
)

const emit = defineEmits<{
  close: [mute: boolean]
}>()

const muteNext = ref(false)
const dragging = ref(false)
const offset = ref({ x: 0, y: 0 })
let dragStart = { x: 0, y: 0, ox: 0, oy: 0 }

function bindDrag(on: boolean): void {
  const method = on ? 'addEventListener' : 'removeEventListener'
  window[method]('pointermove', onMove)
  window[method]('pointerup', onUp)
  window[method]('pointercancel', onUp)
}

function onHeadDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  dragging.value = true
  dragStart = { x: event.clientX, y: event.clientY, ox: offset.value.x, oy: offset.value.y }
  bindDrag(true)
  event.preventDefault()
}

function onMove(event: Event): void {
  if (!dragging.value) {
    return
  }
  const mouse = event as PointerEvent
  offset.value = {
    x: dragStart.ox + mouse.clientX - dragStart.x,
    y: dragStart.oy + mouse.clientY - dragStart.y,
  }
}

function onUp(): void {
  if (!dragging.value) {
    return
  }
  dragging.value = false
  bindDrag(false)
}

function close(): void {
  emit('close', muteNext.value)
}

onBeforeUnmount(() => {
  bindDrag(false)
})
</script>

<template>
  <div
    class="tip-popup"
    :class="[tone, { dragging }]"
    :style="{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)` }"
  >
    <div class="head" @pointerdown="onHeadDown">
      <h2>{{ title }}</h2>
      <button type="button" class="close" @pointerdown.stop @click="close">{{ t('tip.close') }}</button>
    </div>
    <p>{{ body }}</p>
    <label>
      <input v-model="muteNext" type="checkbox" />
      {{ t('tip.mute') }}
    </label>
  </div>
</template>

<style>
.tip-popup {
  position: absolute;
  top: 86px;
  left: 50%;
  z-index: 12;
  width: min(360px, calc(100% - 24px));
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  background: rgb(15 22 30 / 90%);
  border: 1px solid #3d4b5c;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgb(0 0 0 / 36%);
  pointer-events: auto;
}

.tip-popup.warn {
  border-color: #8a4a4a;
}

.tip-popup.dragging {
  user-select: none;
}

.tip-popup .head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: grab;
}

.tip-popup.dragging .head {
  cursor: grabbing;
}

.tip-popup h2 {
  margin: 0;
  flex: 1;
  font-size: 14px;
  color: #e8edf2;
}

.tip-popup p {
  margin: 0;
  color: #c5d0db;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.tip-popup.warn p {
  color: #ffb4b4;
}

.tip-popup label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #9aabbc;
  font-size: 12px;
}

.tip-popup .close {
  padding: 2px 8px;
  border: 1px solid #3d4b5c;
  background: #1d2632;
  color: #e8edf2;
  font-size: 12px;
  cursor: pointer;
}
</style>

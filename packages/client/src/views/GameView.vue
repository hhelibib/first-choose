<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMatchStore } from '../store/match'
import { BattleRenderer } from '../render/battle-renderer'
import HudBar from '../components/HudBar.vue'
import CommandPanel from '../components/CommandPanel.vue'
import MatchLog from '../components/MatchLog.vue'

const store = useMatchStore()
const { snapshot, prevSnapshot, config } = storeToRefs(store)
const stageEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderer: BattleRenderer | null = null
let panning = false
let didPan = false
let lastPanX = 0
let lastPanY = 0
const PAN_THRESHOLD = 5

onMounted(async () => {
  await nextTick()
  if (!stageEl.value || !canvasEl.value) {
    return
  }
  renderer = new BattleRenderer()
  await renderer.mount(canvasEl.value, stageEl.value)
  renderer.app.ticker.add(renderFrame)
})

onBeforeUnmount(() => {
  renderer?.app.ticker.remove(renderFrame)
  renderer?.destroy()
  renderer = null
})

watch(
  () => store.viewResetSeq,
  () => {
    renderer?.resetView()
  },
)

function renderFrame(): void {
  if (!renderer || !snapshot.value || !config.value) {
    return
  }
  renderer.draw(snapshot.value, prevSnapshot.value, config.value, {
    selected: store.selected,
    hover: store.hover,
    mode: store.mode,
    buildTypeId: store.buildTypeId,
    localPlayerId: store.localPlayerId,
    events: store.events,
    snapshotAtMs: store.snapshotAtMs,
    isOperation: store.isOperation,
  })
}

function onPointerMove(event: PointerEvent): void {
  if (panning && renderer) {
    const dx = event.clientX - lastPanX
    const dy = event.clientY - lastPanY
    if (!didPan && Math.hypot(dx, dy) >= PAN_THRESHOLD) {
      didPan = true
    }
    if (didPan) {
      renderer.panBy(dx, dy)
      lastPanX = event.clientX
      lastPanY = event.clientY
    }
    return
  }
  if (!renderer || !snapshot.value) {
    return
  }
  store.setHover(renderer.gridAt(event.clientX, event.clientY, snapshot.value))
}

function applyClick(event: PointerEvent): void {
  if (!renderer || !snapshot.value) {
    return
  }
  const pos = renderer.gridAt(event.clientX, event.clientY, snapshot.value)
  if (!pos) {
    if (event.button === 0) {
      store.selected = null
      store.resetInteraction()
    }
    return
  }
  if (event.button === 2) {
    store.onRightClick(pos)
    return
  }
  if (event.button === 0) {
    store.onLeftClick(pos)
  }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button === 0 || event.button === 1) {
    panning = true
    didPan = event.button === 1
    lastPanX = event.clientX
    lastPanY = event.clientY
    canvasEl.value?.setPointerCapture(event.pointerId)
    if (event.button === 1) {
      event.preventDefault()
    }
    return
  }
  applyClick(event)
}

function onPointerUp(event: PointerEvent): void {
  if (event.button === 0 || event.button === 1) {
    if (event.button === 0 && !didPan) {
      applyClick(event)
    }
    panning = false
    didPan = false
    if (canvasEl.value?.hasPointerCapture(event.pointerId)) {
      canvasEl.value.releasePointerCapture(event.pointerId)
    }
  }
}

function onWheel(event: WheelEvent): void {
  if (!renderer) {
    return
  }
  renderer.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12)
}

function zoomIn(): void {
  renderer?.zoomBy(1.15)
}

function zoomOut(): void {
  renderer?.zoomBy(1 / 1.15)
}

function resetView(): void {
  renderer?.resetView()
}

const winnerText = () => {
  if (!store.winnerCondition) {
    return ''
  }
  if (store.winnerCondition === 'MUTUAL_DESTRUCTION') {
    return '双方主基地同时被摧毁，没有胜者'
  }
  if (store.winnerId === store.localPlayerId) {
    return '胜利：摧毁对方主基地'
  }
  if (store.winnerId) {
    return '失败：主基地被摧毁'
  }
  return store.winnerCondition
}
</script>

<template>
  <div class="game">
    <div class="battlefield">
      <div ref="stageEl" class="stage" @contextmenu.prevent>
        <canvas
          ref="canvasEl"
          @pointermove="onPointerMove"
          @pointerdown="onPointerDown"
          @pointerup="onPointerUp"
          @pointercancel="panning = false; didPan = false; store.setHover(null)"
          @wheel.prevent="onWheel"
        />
      </div>
      <div class="zoom-tools">
        <button type="button" @click="zoomIn">+</button>
        <button type="button" @click="zoomOut">−</button>
        <button type="button" @click="resetView">复位</button>
      </div>
      <HudBar />
      <MatchLog />
      <CommandPanel />
      <div v-if="store.paused" class="paused-note">已暂停</div>
      <div v-if="store.snapshot?.phase === 'GAME_OVER'" class="over">
        <div>
          <h2>对局结束</h2>
          <p>{{ winnerText() }}</p>
          <button type="button" @click="store.backToLobby()">返回大厅</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.game {
  height: 100%;
  position: relative;
}

.battlefield {
  position: absolute;
  inset: 0;
}

.stage {
  position: absolute;
  inset: 0;
  background: #0b0e13;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

canvas:active {
  cursor: grabbing;
}

.zoom-tools {
  position: absolute;
  right: 48px;
  bottom: 16px;
  z-index: 5;
  display: flex;
  gap: 6px;
}

.zoom-tools button {
  min-width: 36px;
  padding: 6px 10px;
  border: 1px solid #3d4b5c;
  background: rgb(15 22 30 / 88%);
  color: #e8edf2;
  border-radius: 8px;
}

.paused-note {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 5;
  padding: 6px 12px;
  background: rgb(15 22 30 / 88%);
  border: 1px solid #ffe066;
  color: #ffe066;
  border-radius: 8px;
  pointer-events: none;
}

.over {
  position: absolute;
  inset: 0;
  z-index: 8;
  background: rgb(8 10 14 / 72%);
  display: grid;
  place-items: center;
}

.over div {
  padding: 24px;
  background: #151b24;
  border: 1px solid #4aa3ff;
  display: grid;
  gap: 12px;
  min-width: 280px;
}

.over button {
  padding: 8px 12px;
  border: 1px solid #4aa3ff;
  background: #2d6fbf;
  color: #fff;
}
</style>

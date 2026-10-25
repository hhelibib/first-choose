<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { locale, t } from '../i18n/index'
import { useMatchStore } from '../store/match'
import { BattleRenderer } from '../render/battle-renderer'
import HudBar from '../components/HudBar.vue'
import CommandPanel from '../components/CommandPanel.vue'
import InspectorPanel from '../components/InspectorPanel.vue'
import LeftDockStack from '../components/LeftDockStack.vue'
import CardBar from '../components/CardBar.vue'
import TipHost from '../components/TipHost.vue'

const store = useMatchStore()
const { snapshot, prevSnapshot, config } = storeToRefs(store)
const combatFeed = computed(() => store.logEntries.filter((entry) => entry.tone === 'combat').slice(-4))
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
    showOrderHints: store.showOrderHints,
  })
  syncCommandAnchor()
}

function syncCommandAnchor(): void {
  const view = renderer
  if (!view || !snapshot.value || !store.selected) {
    if (store.commandAnchor) {
      store.commandAnchor = null
    }
    return
  }
  let origin = { x: 0, y: 0 }
  let size = { w: 1, h: 1 }
  if (store.selected.kind === 'unit') {
    const unit = snapshot.value.units[store.selected.id]
    if (!unit) {
      store.commandAnchor = null
      return
    }
    origin = unit.pos
  } else {
    const building = snapshot.value.buildings[store.selected.id]
    if (!building) {
      store.commandAnchor = null
      return
    }
    origin = building.origin
    size = building.size
  }
  const point = view.cellScreen(origin, snapshot.value)
  const next = {
    x: point.x,
    y: point.y,
    w: point.cell * size.w,
    h: point.cell * size.h,
  }
  const prev = store.commandAnchor
  if (!prev || Math.abs(prev.x - next.x) > 0.5 || Math.abs(prev.y - next.y) > 0.5 || prev.w !== next.w || prev.h !== next.h) {
    store.commandAnchor = next
  }
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
    if (event.button === 2 && store.isTargeting) {
      store.cancelTargeting()
      return
    }
    if (event.button === 0 && !store.isTargeting) {
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

const winnerText = computed(() => {
  if (!store.winnerCondition) {
    return ''
  }
  if (store.winnerCondition === 'MUTUAL_DESTRUCTION') {
    return t('game.draw')
  }
  if (store.winnerId === store.localPlayerId) {
    return t('game.win')
  }
  if (store.winnerId) {
    return t('game.lose')
  }
  return store.winnerCondition
})
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
        <button type="button" @click="resetView">{{ t('game.reset') }}</button>
      </div>
      <HudBar :key="locale" />
      <InspectorPanel :key="locale" />
      <LeftDockStack :key="`docks-${locale}`" />
      <CommandPanel :key="locale" />
      <TipHost :key="locale" />
<!--      <CardBar :key="locale" />-->
      <ul v-if="combatFeed.length" class="combat-feed">
        <li v-for="line in combatFeed" :key="line.id">{{ line.text }}</li>
      </ul>
      <div v-if="store.paused" class="paused-note">{{ t('hud.paused') }}</div>
      <div v-if="store.snapshot?.phase === 'GAME_OVER'" class="over">
        <div>
          <h2>{{ t('game.over') }}</h2>
          <p>{{ winnerText }}</p>
          <button type="button" @click="store.backToLobby()">{{ t('hud.lobby') }}</button>
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

.combat-feed {
  position: absolute;
  left: 50%;
  bottom: 20px;
  z-index: 6;
  transform: translateX(-50%);
  margin: 0;
  padding: 8px 12px;
  list-style: none;
  width: min(420px, calc(100% - 180px));
  background: rgb(15 22 30 / 72%);
  border: 1px solid #2c3644;
  border-radius: 8px;
  pointer-events: none;
  color: #f0c4c4;
  font-size: 13px;
  line-height: 1.45;
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

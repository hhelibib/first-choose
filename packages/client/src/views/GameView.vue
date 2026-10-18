<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMatchStore } from '../store/match'
import { BattleRenderer } from '../render/battle-renderer'
import HudBar from '../components/HudBar.vue'
import CommandPanel from '../components/CommandPanel.vue'
import CardBar from '../components/CardBar.vue'
import MatchLog from '../components/MatchLog.vue'

const store = useMatchStore()
const { snapshot, prevSnapshot, config } = storeToRefs(store)
const stageEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderer: BattleRenderer | null = null

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
  if (!renderer || !snapshot.value) {
    return
  }
  store.setHover(renderer.gridAt(event.clientX, event.clientY, snapshot.value))
}

function onPointerDown(event: PointerEvent): void {
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
    <HudBar />
    <div class="body">
      <MatchLog />
      <div ref="stageEl" class="stage" @contextmenu.prevent>
        <canvas
          ref="canvasEl"
          @pointermove="onPointerMove"
          @pointerdown="onPointerDown"
          @pointerleave="store.setHover(null)"
        />
      </div>
      <CommandPanel />
    </div>
    <CardBar />
    <div v-if="store.snapshot?.phase === 'GAME_OVER'" class="over">
      <div>
        <h2>对局结束</h2>
        <p>{{ winnerText() }}</p>
        <button type="button" @click="store.backToLobby()">返回大厅</button>
      </div>
    </div>
  </div>
</template>

<style>
.game {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  position: relative;
}

.body {
  display: grid;
  grid-template-columns: 260px 1fr 280px;
  min-height: 0;
}

.stage {
  min-width: 0;
  min-height: 0;
  background: #0b0e13;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.over {
  position: absolute;
  inset: 0;
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

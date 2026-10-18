<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TICK_MS } from '@battle/shared'
import { useMatchStore } from '../store/match'

const store = useMatchStore()
const now = ref(performance.now())
const settingsOpen = ref(false)
const settingsEl = ref<HTMLElement | null>(null)
let timer = 0

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = performance.now()
  }, 100)
  window.addEventListener('pointerdown', onDocPointer, true)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.removeEventListener('pointerdown', onDocPointer, true)
})

function onDocPointer(event: Event): void {
  if (!settingsOpen.value || !settingsEl.value) {
    return
  }
  if (!settingsEl.value.contains(event.target as Node)) {
    closeSettings()
  }
}

function openSettings(): void {
  settingsOpen.value = true
  store.setPaused(true)
}

function closeSettings(): void {
  settingsOpen.value = false
}

const phaseText = computed(() => {
  const phase = store.snapshot?.phase
  if (phase === 'OPERATION') return '操作阶段'
  if (phase === 'AUTO') return '自走阶段'
  if (phase === 'GAME_OVER') return '对局结束'
  return phase ?? ''
})

const remainMs = computed(() => {
  if (store.snapshot?.phase === 'OPERATION') {
    if (store.paused) {
      return store.phaseInfo?.operationRemainMs ?? 0
    }
    if (store.phaseInfo?.operationEndsAtMs) {
      return Math.max(0, store.phaseInfo.operationEndsAtMs - now.value)
    }
    return store.phaseInfo?.operationRemainMs ?? 0
  }
  if (store.snapshot?.phase === 'AUTO') {
    return store.snapshot.phaseTicksRemaining * TICK_MS
  }
  return 0
})

const countdown = computed(() => Math.ceil(remainMs.value / 1000))

function resetView(): void {
  store.requestViewReset()
}

function resume(): void {
  closeSettings()
  store.setPaused(false)
}

function leave(): void {
  closeSettings()
  store.backToLobby()
}
</script>

<template>
  <header v-if="store.snapshot && store.player" class="hud">
    <div class="hud-resources">
      <span>粮 {{ store.player.resources.food }}</span>
      <span>木 {{ store.player.resources.wood }}</span>
      <span>石 {{ store.player.resources.stone }}</span>
      <span>矿 {{ store.player.resources.ore }}</span>
      <span>金 {{ store.player.resources.gold }}</span>
      <span class="pop">人口 {{ store.player.population }}/{{ store.player.populationCap }}</span>
    </div>
    <div class="hud-clock">
      <span class="round">第 {{ store.snapshot.round }} 回合</span>
      <span class="count">{{ countdown }}</span>
      <span class="phase">{{ phaseText }}</span>
    </div>
    <div class="hud-right">
      <button type="button" :disabled="store.snapshot.phase === 'GAME_OVER'" @click="store.togglePause()">
        {{ store.paused ? '继续' : '暂停' }}
      </button>
      <button type="button" :disabled="!store.isOperation" @click="store.endOperation()">结束操作</button>
      <span v-if="store.paused" class="paused">已暂停</span>
      <div class="settings">
        <button type="button" class="icon" title="设置" aria-label="设置" @click="openSettings">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64L4.86 10.7c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.49.42h3.8c.23 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
      </div>
    </div>
    <div
      v-if="settingsOpen"
      class="game-settings-mask"
      @pointerdown.self="closeSettings"
    >
      <div ref="settingsEl" class="game-settings-dialog" @pointerdown.stop>
        <h2>设置</h2>
        <p class="hint">游戏已暂停</p>
        <button type="button" @click="resetView">复位视角</button>
        <button type="button" @click="leave">返回大厅</button>
        <button type="button" class="primary" @click="resume">继续游戏</button>
        <button type="button" class="ghost" @click="closeSettings">关闭</button>
      </div>
    </div>
    <p v-if="store.lastReason" class="reason">{{ store.lastReason }}</p>
  </header>
</template>

<style>
.hud {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  font-size: 13px;
}

.hud .game-settings-mask {
  pointer-events: auto;
}

.hud-resources,
.hud-clock,
.hud-right,
.reason {
  pointer-events: auto;
}

.hud-resources {
  position: absolute;
  top: 10px;
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 8px 12px;
  background: rgb(15 22 30 / 58%);
  border: 1px solid #2c3644;
  border-radius: 10px;
  color: #d5dee8;
}

.hud-resources .pop {
  color: #9aabbc;
}

.hud-clock {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 22px;
  background: rgb(15 22 30 / 62%);
  border: 1px solid #2c3644;
  border-radius: 12px;
}

.hud-clock .round,
.hud-clock .phase {
  min-width: 88px;
  font-size: 15px;
  color: #c5d0db;
}

.hud-clock .round {
  text-align: right;
}

.hud-clock .phase {
  text-align: left;
}

.hud-clock .count {
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.04em;
  color: #f2f6fa;
  min-width: 1.4em;
  text-align: center;
}

.hud-right {
  position: absolute;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hud button {
  padding: 6px 10px;
  border: 1px solid #4aa3ff;
  background: #2d6fbf;
  color: #fff;
}

.hud .paused {
  color: #ffe066;
}

.settings {
  position: relative;
}

.settings .icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: rgb(15 22 30 / 72%);
  border-color: #3d4b5c;
  color: #c5d0db;
}

.game-settings-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(6 8 12 / 62%);
}

.game-settings-dialog {
  width: min(320px, 86vw);
  display: grid;
  gap: 8px;
  padding: 20px;
  background: #151b24;
  border: 1px solid #3d4b5c;
  border-radius: 12px;
  box-shadow: 0 16px 40px rgb(0 0 0 / 45%);
}

.game-settings-dialog h2 {
  margin: 0;
  font-size: 18px;
  color: #e8edf2;
}

.game-settings-dialog .hint {
  margin: 0 0 6px;
  color: #ffe066;
  font-size: 13px;
}

.game-settings-dialog button {
  padding: 8px 12px;
  border: 1px solid #4aa3ff;
  background: #1d2632;
  color: #e8edf2;
  text-align: center;
}

.game-settings-dialog .primary {
  background: #2d6fbf;
  color: #fff;
}

.game-settings-dialog .ghost {
  background: transparent;
  border-color: #3d4b5c;
}

.reason {
  position: absolute;
  top: 86px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  color: #ffb4b4;
  background: rgb(15 22 30 / 70%);
  padding: 4px 10px;
  border-radius: 8px;
}
</style>

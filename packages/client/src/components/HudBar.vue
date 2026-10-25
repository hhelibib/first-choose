<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TICK_MS } from '@battle/shared'
import { locale, localeModel, t } from '../i18n/index'
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
  if (phase === 'OPERATION') return t('hud.phase.OPERATION')
  if (phase === 'AUTO') return t('hud.phase.AUTO')
  if (phase === 'GAME_OVER') return t('hud.phase.GAME_OVER')
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
  <header v-if="store.snapshot && store.player" class="hud" :data-locale="locale">
    <div class="hud-resources">
      <span>{{ t('hud.food') }} {{ store.player.resources.food }}</span>
      <span>{{ t('hud.wood') }} {{ store.player.resources.wood }}</span>
      <span>{{ t('hud.stone') }} {{ store.player.resources.stone }}</span>
      <span>{{ t('hud.ore') }} {{ store.player.resources.ore }}</span>
      <span>{{ t('hud.gold') }} {{ store.player.resources.gold }}</span>
      <span class="pop">{{ t('hud.pop', { cur: store.player.population, cap: store.player.populationCap }) }}</span>
    </div>
    <div class="hud-clock">
      <span class="round">{{ t('hud.round', { n: store.snapshot.round }) }}</span>
      <span class="tick">{{ t('hud.tick', { n: store.snapshot.tick }) }}</span>
      <span class="count">{{ countdown }}</span>
      <span class="phase">{{ phaseText }}</span>
    </div>
    <div class="hud-right">
      <button type="button" :disabled="store.snapshot.phase === 'GAME_OVER'" @click="store.togglePause()">
        {{ store.paused ? t('hud.resume') : t('hud.pause') }}
      </button>
      <button type="button" :disabled="!store.isOperation" @click="store.endOperation()">{{ t('hud.endOp') }}</button>
      <span v-if="store.paused" class="paused">{{ t('hud.paused') }}</span>
      <div class="settings">
        <button type="button" class="icon" :title="t('hud.settings')" :aria-label="t('hud.settings')" @click="openSettings">
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
        <h2>{{ t('hud.settings') }}</h2>
        <p class="hint">{{ t('hud.settingsHint') }}</p>
        <label class="lang">
          {{ t('lang.label') }}
          <select v-model="localeModel">
            <option value="zh-CN">{{ t('lang.zhCN') }}</option>
            <option value="zh-TW">{{ t('lang.zhTW') }}</option>
            <option value="en">{{ t('lang.en') }}</option>
          </select>
        </label>
        <h3>{{ t('hud.display') }}</h3>
        <label class="check">
          <input
            type="checkbox"
            :checked="store.showOrderHints"
            @change="store.setShowOrderHints(($event.target as HTMLInputElement).checked)"
          />
          {{ t('hud.orderHints') }}
        </label>
        <p class="hint muted">{{ t('hud.orderHintsHint') }}</p>
        <label class="check">
          <input
            type="checkbox"
            :checked="store.showTips"
            @change="store.setShowTips(($event.target as HTMLInputElement).checked)"
          />
          {{ t('hud.showTips') }}
        </label>
        <p class="hint muted">{{ t('hud.showTipsHint') }}</p>
        <label class="check">
          <input
            type="checkbox"
            :checked="store.showRejectTips"
            @change="store.setShowRejectTips(($event.target as HTMLInputElement).checked)"
          />
          {{ t('hud.showRejectTips') }}
        </label>
        <p class="hint muted">{{ t('hud.showRejectTipsHint') }}</p>
        <label class="check">
          <input
            type="checkbox"
            :checked="store.showOrdersDock"
            @change="store.setShowOrdersDock(($event.target as HTMLInputElement).checked)"
          />
          {{ t('hud.showOrdersDock') }}
        </label>
        <p class="hint muted">{{ t('hud.showOrdersDockHint') }}</p>
        <label class="check">
          <input
            type="checkbox"
            :checked="store.showReportDock"
            @change="store.setShowReportDock(($event.target as HTMLInputElement).checked)"
          />
          {{ t('hud.showReportDock') }}
        </label>
        <p class="hint muted">{{ t('hud.showReportDockHint') }}</p>
        <button type="button" class="ghost" @click="store.resetMutedTips()">{{ t('hud.resetTips') }}</button>
        <button type="button" @click="resetView">{{ t('hud.resetView') }}</button>
        <button type="button" @click="leave">{{ t('hud.lobby') }}</button>
        <button type="button" class="primary" @click="resume">{{ t('hud.resumeGame') }}</button>
        <button type="button" class="ghost" @click="closeSettings">{{ t('hud.close') }}</button>
      </div>
    </div>
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
.hud-right {
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
.hud-clock .tick,
.hud-clock .phase {
  min-width: 72px;
  font-size: 15px;
  color: #c5d0db;
}

.hud-clock .round {
  text-align: right;
}

.hud-clock .tick {
  text-align: right;
  color: #9ad1ff;
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
  width: min(360px, 86vw);
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

.game-settings-dialog h3 {
  margin: 8px 0 0;
  font-size: 13px;
  color: #9ad1ff;
}

.game-settings-dialog .hint {
  margin: 0 0 6px;
  color: #ffe066;
  font-size: 13px;
}

.game-settings-dialog .lang {
  display: grid;
  gap: 6px;
  color: #c5d0db;
  font-size: 13px;
}

.game-settings-dialog .lang select {
  padding: 8px 12px;
  border: 1px solid #3d4b5c;
  background: #0f141b;
  color: #e8edf2;
}

.game-settings-dialog .check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e8edf2;
  font-size: 13px;
}

.game-settings-dialog .hint.muted {
  color: #9aabbc;
  font-size: 12px;
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
</style>

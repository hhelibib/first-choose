<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AUTO_TICK_LIMIT, TICK_MS } from '@battle/shared'
import { useMatchStore } from '../store/match'

const store = useMatchStore()
const now = ref(performance.now())
let timer = 0

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = performance.now()
  }, 100)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
})

const phaseText = computed(() => {
  const phase = store.snapshot?.phase
  if (phase === 'OPERATION') return '操作阶段'
  if (phase === 'AUTO') return '自走阶段'
  if (phase === 'GAME_OVER') return '对局结束'
  return phase ?? ''
})

const countdown = computed(() => {
  if (store.snapshot?.phase === 'OPERATION') {
    const remain = store.paused
      ? (store.phaseInfo?.operationRemainMs ?? 0)
      : store.phaseInfo?.operationEndsAtMs
        ? Math.max(0, store.phaseInfo.operationEndsAtMs - now.value)
        : (store.phaseInfo?.operationRemainMs ?? 0)
    return `${Math.ceil(remain / 1000)}s`
  }
  if (store.snapshot?.phase === 'AUTO') {
    const remain = store.snapshot.phaseTicksRemaining * TICK_MS
    return `${Math.ceil(remain / 1000)}s / ${Math.round((AUTO_TICK_LIMIT * TICK_MS) / 1000)}s`
  }
  return '—'
})
</script>

<template>
  <header v-if="store.snapshot && store.player" class="hud">
    <div>回合 {{ store.snapshot.round }}</div>
    <div>{{ phaseText }}</div>
    <div>倒计时 {{ countdown }}</div>
    <div>木 {{ store.player.resources.wood }}</div>
    <div>矿 {{ store.player.resources.ore }}</div>
    <div>金 {{ store.player.resources.gold }}</div>
    <div>能量 {{ store.player.energy }}/{{ store.player.maxEnergy }}</div>
    <div>人口 {{ store.player.population }}/{{ store.player.populationCap }}</div>
    <button type="button" :disabled="store.snapshot.phase === 'GAME_OVER'" @click="store.togglePause()">
      {{ store.paused ? '继续' : '暂停' }}
    </button>
    <button type="button" :disabled="!store.isOperation" @click="store.endOperation()">结束操作</button>
    <button type="button" class="ghost" @click="store.backToLobby()">返回大厅</button>
    <span v-if="store.paused" class="paused">已暂停</span>
    <p v-if="store.lastReason" class="reason">{{ store.lastReason }}</p>
  </header>
</template>

<style>
.hud {
  position: relative;
  z-index: 5;
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  width: 100%;
  padding: 10px 16px;
  background: #151b24;
  border-bottom: 1px solid #2c3644;
  font-size: 13px;
}

.hud button {
  padding: 6px 10px;
  border: 1px solid #4aa3ff;
  background: #2d6fbf;
  color: #fff;
}

.hud .ghost {
  background: transparent;
  border-color: #3d4b5c;
}

.hud .paused {
  color: #ffe066;
}

.reason {
  margin: 0;
  color: #ffb4b4;
  width: 100%;
}
</style>

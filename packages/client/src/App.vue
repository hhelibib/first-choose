<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { useMatchStore } from './store/match'
import LobbyView from './views/LobbyView.vue'
import GameView from './views/GameView.vue'

const GAME_VERSION = '0.1.1'
const store = useMatchStore()

onBeforeUnmount(() => {
  store.disposeGateway()
})
</script>

<template>
  <LobbyView v-if="store.view === 'lobby'" />
  <GameView v-else />
  <span class="game-version">v{{ GAME_VERSION }}</span>
</template>

<style>
.game-version {
  position: fixed;
  left: 10px;
  bottom: 8px;
  z-index: 20;
  font-size: 11px;
  line-height: 1;
  color: #4d5966;
  pointer-events: none;
  user-select: none;
}
</style>

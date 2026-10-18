<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { useMatchStore } from './store/match'
import LobbyView from './views/LobbyView.vue'
import GameView from './views/GameView.vue'

const store = useMatchStore()

onBeforeUnmount(() => {
  store.disposeGateway()
})
</script>

<template>
  <LobbyView v-if="store.view === 'lobby'" />
  <GameView v-else />
</template>

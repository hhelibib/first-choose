<script setup lang="ts">
import { useMatchStore } from '../store/match'
import { cardName, t } from '../i18n/index'

const store = useMatchStore()

function nameOf(cardId: string): string {
  return cardName(cardId, store.config?.cards[cardId]?.name)
}

function costOf(cardId: string): number {
  return store.config?.cards[cardId]?.cost ?? 0
}
</script>

<template>
  <footer v-if="store.player" class="card-bar">
    <button
      v-for="card in store.player.hand"
      :key="card.instanceId"
      type="button"
      :class="{ active: store.cardInstanceId === card.instanceId }"
      :disabled="!store.isOperation"
      @click="store.beginCard(card.instanceId)"
    >
      {{ nameOf(card.cardId) }}
      <span>{{ t('card.energy', { n: costOf(card.cardId) }) }}</span>
    </button>
  </footer>
</template>

<style>
.card-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  background: rgb(15 22 30 / 88%);
  border-top: 1px solid #2c3644;
  pointer-events: auto;
}

.card-bar button {
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid #3d4b5c;
  background: #1d2632;
  color: #e8edf2;
  display: grid;
  gap: 2px;
}

.card-bar button.active {
  border-color: #ffe066;
}

.card-bar span,
.card-bar p {
  color: #9aa8b7;
  font-size: 12px;
  margin: 0;
}
</style>

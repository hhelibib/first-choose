<script setup lang="ts">
import { CARD_IDS } from '@battle/shared'
import { useMatchStore } from '../store/match'

const store = useMatchStore()

function nameOf(cardId: string): string {
  if (cardId === CARD_IDS.emergencyRepair) return '紧急修缮'
  if (cardId === CARD_IDS.artilleryBarrage) return '火力覆盖'
  if (cardId === CARD_IDS.battleInspiration) return '战地鼓舞'
  return cardId
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
      <span>{{ costOf(card.cardId) }} 能</span>
    </button>
    <p>选中卡牌后再点目标。自走阶段不能出牌。</p>
  </footer>
</template>

<style>
.card-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  background: #151b24;
  border-top: 1px solid #2c3644;
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

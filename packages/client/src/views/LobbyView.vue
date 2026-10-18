<script setup lang="ts">
import { useMatchStore, type AiDifficulty } from '../store/match'

const store = useMatchStore()

function setDifficulty(value: string) {
  store.difficulty = value as AiDifficulty
}
</script>

<template>
  <main class="lobby">
    <section class="panel">
      <h1>战斗吧</h1>
      <p>15 秒下令，然后观看自走。本地 1 人 vs 规则 AI，色块战场。</p>
      <label>
        地图
        <select disabled>
          <option>默认 24×24</option>
        </select>
      </label>
      <label>
        AI 难度
        <select :value="store.difficulty" @change="setDifficulty(($event.target as HTMLSelectElement).value)">
          <option value="default">默认</option>
          <option value="conservative">保守</option>
          <option value="aggressive">积极</option>
        </select>
      </label>
      <button type="button" class="start" @click="store.startLocalMatch()">开始本地对局</button>
    </section>
  </main>
</template>

<style>
.lobby {
  min-height: 100%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 20% 20%, #1d2a3c 0%, transparent 40%),
    radial-gradient(circle at 80% 80%, #3a1d1d 0%, transparent 42%),
    #0e1218;
}

.panel {
  width: min(440px, 92vw);
  padding: 32px;
  border: 1px solid #2c3644;
  background: #151b24;
  display: grid;
  gap: 16px;
}

h1 {
  margin: 0;
  letter-spacing: 0.12em;
}

p,
label {
  color: #b7c2ce;
}

label {
  display: grid;
  gap: 6px;
}

select,
.start {
  padding: 10px 12px;
  border: 1px solid #3d4b5c;
  background: #0f141b;
  color: #e8edf2;
}

.start {
  background: #2d6fbf;
  border-color: #4aa3ff;
  font-weight: 700;
}
</style>

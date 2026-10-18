<script setup lang="ts">
import { locale, localeModel, t } from '../i18n/index'
import { useMatchStore, type AiDifficulty } from '../store/match'

const store = useMatchStore()

function setDifficulty(value: string) {
  store.difficulty = value as AiDifficulty
}

</script>

<template>
  <main class="lobby" :data-locale="locale">
    <section class="panel" :key="locale">
      <h1>{{ t('game.title') }}</h1>
      <p>{{ t('lobby.blurb') }}</p>
      <label>
        {{ t('lang.label') }}
        <select v-model="localeModel">
          <option value="zh-CN">{{ t('lang.zhCN') }}</option>
          <option value="zh-TW">{{ t('lang.zhTW') }}</option>
          <option value="en">{{ t('lang.en') }}</option>
        </select>
      </label>
      <label>
        {{ t('lobby.map') }}
        <select disabled>
          <option>{{ t('lobby.mapDefault') }}</option>
        </select>
      </label>
      <label>
        {{ t('lobby.difficulty') }}
        <select :value="store.difficulty" @change="setDifficulty(($event.target as HTMLSelectElement).value)">
          <option value="default">{{ t('lobby.diffDefault') }}</option>
          <option value="conservative">{{ t('lobby.diffConservative') }}</option>
          <option value="aggressive">{{ t('lobby.diffAggressive') }}</option>
        </select>
      </label>
      <button type="button" class="start" @click="store.startLocalMatch()">{{ t('lobby.start') }}</button>
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

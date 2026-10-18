<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n/index'
import { useMatchStore } from '../store/match'
import EntityCard from './EntityCard.vue'

const PANEL_W = 260
const DEFAULT_TOP = 56
const DEFAULT_RIGHT = 12

const store = useMatchStore()
const dragging = ref(false)
let panelEl: HTMLElement | null = null
let dragOffsetX = 0
let dragOffsetY = 0

const style = computed(() => {
  const viewW = panelEl?.parentElement?.clientWidth ?? (typeof window === 'undefined' ? 1280 : window.innerWidth)
  const pos = store.inspectorPos ?? { x: Math.max(8, viewW - DEFAULT_RIGHT - PANEL_W), y: DEFAULT_TOP }
  return {
    left: `${Math.round(pos.x)}px`,
    top: `${Math.round(pos.y)}px`,
  }
})

function clampPos(x: number, y: number): { x: number; y: number } {
  const viewW = panelEl?.parentElement?.clientWidth ?? 1280
  const viewH = panelEl?.parentElement?.clientHeight ?? 720
  const height = panelEl?.offsetHeight ?? 200
  return {
    x: Math.min(Math.max(8, x), Math.max(8, viewW - PANEL_W - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, viewH - height - 8)),
  }
}

function bindDrag(on: boolean): void {
  const method = on ? 'addEventListener' : 'removeEventListener'
  window[method]('pointermove', onDragMove)
  window[method]('mousemove', onDragMove)
  window[method]('pointerup', onDragEnd)
  window[method]('mouseup', onDragEnd)
  window[method]('pointercancel', onDragEnd)
}

function onDocDown(event: Event): void {
  const mouse = event as MouseEvent
  const target = mouse.target
  if (!(target instanceof Element) || !target.closest('.inspector-head')) {
    return
  }
  onDragStart(mouse)
}

function onDragStart(event: Event): void {
  const mouse = event as MouseEvent
  const host = (mouse.target instanceof Element ? mouse.target.closest('#entity-inspector') : null) as HTMLElement | null
  if (mouse.button !== 0 || dragging.value || !host) {
    return
  }
  panelEl = host
  const rect = host.getBoundingClientRect()
  dragging.value = true
  dragOffsetX = mouse.clientX - rect.left
  dragOffsetY = mouse.clientY - rect.top
  bindDrag(true)
  mouse.preventDefault()
}

function onDragMove(event: Event): void {
  if (!dragging.value || !panelEl) {
    return
  }
  const mouse = event as MouseEvent
  const parent = panelEl.parentElement?.getBoundingClientRect()
  if (!parent) {
    return
  }
  store.inspectorPos = clampPos(mouse.clientX - parent.left - dragOffsetX, mouse.clientY - parent.top - dragOffsetY)
}

function onDragEnd(): void {
  if (!dragging.value) {
    return
  }
  dragging.value = false
  bindDrag(false)
}

function hookPanel(): void {
  const next = document.getElementById('entity-inspector')
  if (panelEl && panelEl !== next) {
    const prevHead = panelEl.querySelector('.inspector-head')
    prevHead?.removeEventListener('pointerdown', onDragStart)
    prevHead?.removeEventListener('mousedown', onDragStart)
  }
  panelEl = next
  const head = panelEl?.querySelector('.inspector-head')
  head?.removeEventListener('pointerdown', onDragStart)
  head?.removeEventListener('mousedown', onDragStart)
  head?.addEventListener('pointerdown', onDragStart)
  head?.addEventListener('mousedown', onDragStart)
}

onMounted(async () => {
  await nextTick()
  hookPanel()
  document.addEventListener('mousedown', onDocDown, true)
  document.addEventListener('pointerdown', onDocDown, true)
})

watch(
  () => store.selected,
  async (selected) => {
    if (!selected) {
      return
    }
    await nextTick()
    hookPanel()
    const fallback = store.inspectorPos ?? {
      x: Math.max(8, (panelEl?.parentElement?.clientWidth ?? window.innerWidth) - DEFAULT_RIGHT - PANEL_W),
      y: DEFAULT_TOP,
    }
    store.inspectorPos = clampPos(fallback.x, fallback.y)
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown, true)
  document.removeEventListener('pointerdown', onDocDown, true)
  const head = panelEl?.querySelector('.inspector-head')
  head?.removeEventListener('pointerdown', onDragStart)
  head?.removeEventListener('mousedown', onDragStart)
  bindDrag(false)
})
</script>

<template>
  <aside
    v-show="store.selected"
    id="entity-inspector"
    class="inspector"
    :class="{ dragging }"
    :style="style"
    @pointerdown="onDocDown"
    @mousedown="onDocDown"
  >
    <div class="inspector-head">
      <h2>{{ t('inspect.title') }}</h2>
      <span class="drag-hint">{{ t('inspect.drag') }}</span>
    </div>
    <EntityCard />
  </aside>
</template>

<style>
.inspector {
  position: absolute;
  z-index: 7;
  width: 260px;
  max-height: calc(100% - 80px);
  overflow: auto;
  padding: 12px;
  background: rgb(15 22 30 / 86%);
  border: 1px solid #2c3644;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
  pointer-events: auto;
}

.inspector.dragging {
  user-select: none;
}

.inspector-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  cursor: grab;
}

.inspector.dragging .inspector-head {
  cursor: grabbing;
}

.inspector-head h2 {
  margin: 0;
  flex: 1;
  font-size: 15px;
}

.inspector-head .drag-hint {
  color: #7f90a3;
  font-size: 11px;
}
</style>

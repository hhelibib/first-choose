/**
 * Pixi 战场。按快照色块绘制，单位沿当前格子边插值到 60FPS。
 * 不预测伤害和胜负。标签与浮动文字复用，静态层按指纹重绘。
 */
import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js'
import { TICK_MS, type Building, type DomainEvent, type EntityRef, type GameSnapshot, type GridPos, type MatchConfig, type Unit } from '@battle/shared'
import {
  attackRangeOf,
  buildingAttackRange,
  buildingCells,
  entityCells,
  plotValid,
  previewMovePath,
  previewReachable,
  rangeCells,
} from '../preview/command-preview.js'
import { buildingName, locale, t } from '../i18n/index.js'
import { CELL, COLOR, ownerColor, setCellSize } from './colors.js'

export interface RenderView {
  selected: EntityRef | null
  hover: GridPos | null
  mode: string
  buildTypeId: string | null
  localPlayerId: string
  events: DomainEvent[]
  snapshotAtMs: number
  isOperation: boolean
  showOrderHints: boolean
}

const MAP_EDGE_PAD = 0
const MIN_ZOOM = 0.8
const MAX_ZOOM = 2.8
const MAX_OUTSIDE_CELLS = 2
const HIT_MS = 900

const FILL_HP_BACK = { color: COLOR.hpBack }
const FILL_HP_GOOD = { color: COLOR.hpGood }
const FILL_HP_BAD = { color: COLOR.hpBad }
const FILL_WORKER = { color: COLOR.overlay }
const FILL_MOVE = { color: COLOR.moveRange, alpha: 0.16 }
const FILL_RANGE = { color: COLOR.range, alpha: 0.12 }
const FILL_BUILDING_RANGE = { color: COLOR.range, alpha: 0.1 }
const FILL_PATH_GHOST = { color: COLOR.path, alpha: 0.7 }
const FILL_PLOT_OK = { color: COLOR.path, alpha: 0.35 }
const FILL_PLOT_BAD = { color: COLOR.invalid, alpha: 0.35 }
const FILL_CONSTRUCT = { color: COLOR.constructing }
const STROKE_GRID = { color: COLOR.grid, width: 1, alpha: 0.35 }
const STROKE_HOVER = { color: COLOR.hover, width: 2 }
const STROKE_SELECTED = { color: COLOR.selected, width: 2 }
const STROKE_ORDER_IDLE = { color: COLOR.orderIdle, width: 2 }
const STROKE_ORDER_SET = { color: COLOR.orderSet, width: 2 }

interface PooledText {
  view: Text
  text: string
  size: number
}

interface LiveUnit {
  unit: Unit
  moveMs: number
  worker: boolean
  maxHp: number
}

interface LiveBuilding {
  building: Building
  buildTimeMs: number
}

export class BattleRenderer {
  readonly app = new Application()
  private readonly terrain = new Graphics()
  private readonly resources = new Graphics()
  private readonly occupancy = new Graphics()
  private readonly buildings = new Graphics()
  private readonly units = new Graphics()
  private readonly effects = new Graphics()
  private readonly overlay = new Graphics()
  private readonly labels = new Container()
  private readonly floatLayer = new Container()
  private hits: Array<{ key: string; gx: number; gy: number; until: number; label: Text }> = []
  private seenHitKeys = new Set<string>()
  private buildingLabels = new Map<string, PooledText>()
  private nodeLabels = new Map<string, PooledText>()
  private unitList: LiveUnit[] = []
  private buildingList: LiveBuilding[] = []
  private listSnapshot: GameSnapshot | null = null
  private lastSnapshot: GameSnapshot | null = null
  private lastPlayerId = ''
  private lastPos = new Map<string, GridPos>()
  private hitArea = new Rectangle(0, 0, 1, 1)
  private hitFill = { color: COLOR.hpBad, alpha: 0.22 }
  private terrainKey = ''
  private resourceKey = ''
  private occupancyKey = ''
  private overlayDrawKey = ''
  private reachKey = ''
  private reachCells: GridPos[] = []
  private unitRangeKey = ''
  private unitRangeCells: GridPos[] = []
  private pathKey = ''
  private pathCells: GridPos[] = []
  private buildingRangeKey = ''
  private buildingRangeCells: GridPos[] = []
  private lastTick = -1
  private lastTickAtMs = 0
  private tickGapMs = TICK_MS
  private zoom = 1
  private panX = 0
  private panY = 0
  private originX = 0
  private originY = 0
  private mapCols = 1
  private mapRows = 1
  private viewW = 1
  private viewH = 1
  private didFocusPlayer = false

  async mount(canvas: HTMLCanvasElement, parent: HTMLElement): Promise<void> {
    await this.app.init({
      canvas,
      background: COLOR.background,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: parent,
    })
    const stage = this.app.stage
    stage.eventMode = 'static'
    stage.addChild(
      this.terrain,
      this.resources,
      this.occupancy,
      this.buildings,
      this.units,
      this.effects,
      this.overlay,
      this.labels,
      this.floatLayer,
    )
  }

  destroy(): void {
    for (const hit of this.hits) {
      hit.label.destroy()
    }
    this.hits = []
    for (const item of this.buildingLabels.values()) {
      item.view.destroy()
    }
    for (const item of this.nodeLabels.values()) {
      item.view.destroy()
    }
    this.buildingLabels.clear()
    this.nodeLabels.clear()
    this.app.destroy({ removeView: true }, { children: true })
  }

  cellScreen(pos: GridPos, _snapshot: GameSnapshot): { x: number; y: number; cell: number } {
    return {
      x: this.originX + this.panX + pos.x * CELL * this.zoom,
      y: this.originY + this.panY + pos.y * CELL * this.zoom,
      cell: CELL * this.zoom,
    }
  }

  gridAt(clientX: number, clientY: number, snapshot: GameSnapshot): GridPos | null {
    const rect = this.app.canvas.getBoundingClientRect()
    const local = this.screenToLocal(clientX - rect.left, clientY - rect.top)
    const x = Math.floor(local.x / CELL)
    const y = Math.floor(local.y / CELL)
    if (x < 0 || y < 0 || x >= snapshot.map.width || y >= snapshot.map.height) {
      return null
    }
    return { x, y }
  }

  zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.app.canvas.getBoundingClientRect()
    const lx = clientX - rect.left
    const ly = clientY - rect.top
    const before = this.screenToLocal(lx, ly)
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor))
    this.panX = lx - this.originX - before.x * this.zoom
    this.panY = ly - this.originY - before.y * this.zoom
    this.clampPan()
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx
    this.panY += dy
    this.clampPan()
  }

  resetView(): void {
    this.zoom = 1
    if (this.lastSnapshot) {
      this.focusPlayer(this.lastPlayerId)
      this.didFocusPlayer = true
      return
    }
    this.didFocusPlayer = false
  }

  zoomBy(factor: number): void {
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2
    const before = this.screenToLocal(cx, cy)
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor))
    this.panX = cx - this.originX - before.x * this.zoom
    this.panY = cy - this.originY - before.y * this.zoom
    this.clampPan()
  }

  private screenToLocal(lx: number, ly: number): { x: number; y: number } {
    return {
      x: (lx - this.originX - this.panX) / this.zoom,
      y: (ly - this.originY - this.panY) / this.zoom,
    }
  }

  private ensureLayout(viewW: number, viewH: number, width: number, height: number): void {
    if (viewW === this.viewW && viewH === this.viewH && width === this.mapCols && height === this.mapRows && this.viewW > 0) {
      return
    }
    const innerW = Math.max(1, viewW - MAP_EDGE_PAD * 2)
    const innerH = Math.max(1, viewH - MAP_EDGE_PAD * 2)
    setCellSize(Math.max(16, Math.ceil(Math.max(innerW / width, innerH / height))))
    const mapW = width * CELL
    const mapH = height * CELL
    this.viewW = viewW
    this.viewH = viewH
    this.mapCols = width
    this.mapRows = height
    this.originX = MAP_EDGE_PAD + (innerW - mapW) / 2
    this.originY = MAP_EDGE_PAD + (innerH - mapH) / 2
    this.hitArea.width = mapW
    this.hitArea.height = mapH
    this.app.stage.hitArea = this.hitArea
    this.clampPan()
  }

  private focusPlayer(playerId: string): void {
    this.zoom = 1
    let gx = 0
    let gy = 0
    let gw = 1
    let gh = 1
    const base = this.buildingList.find(
      (item) => item.building.ownerId === playerId && item.building.role === 'MAIN_BASE',
    )?.building
    if (base) {
      gx = base.origin.x
      gy = base.origin.y
      gw = base.size.w
      gh = base.size.h
    } else {
      const unit = this.unitList.find((item) => item.unit.ownerId === playerId)?.unit
      if (unit) {
        gx = unit.pos.x
        gy = unit.pos.y
      }
    }
    const worldX = (gx + gw / 2) * CELL * this.zoom
    const worldY = (gy + gh / 2) * CELL * this.zoom
    this.panX = this.viewW / 2 - this.originX - worldX
    this.panY = this.viewH / 2 - this.originY - worldY
    this.clampPan()
  }

  private clampPan(): void {
    const margin = MAX_OUTSIDE_CELLS * CELL * this.zoom
    this.panX = clampPanAxis(this.panX, this.originX, this.mapCols * CELL * this.zoom, this.viewW, margin)
    this.panY = clampPanAxis(this.panY, this.originY, this.mapRows * CELL * this.zoom, this.viewH, margin)
  }

  private refreshLists(snapshot: GameSnapshot, config: MatchConfig): void {
    if (this.listSnapshot === snapshot) {
      return
    }
    this.listSnapshot = snapshot
    this.unitList = []
    this.buildingList = []
    for (const id in snapshot.units) {
      const unit = snapshot.units[id]
      if (!unit || unit.state === 'DEAD') {
        continue
      }
      const def = config.units[unit.typeId]
      this.unitList.push({
        unit,
        moveMs: def?.moveMsPerCell ?? 500,
        worker: def?.role === 'WORKER',
        maxHp: unit.maxHp > 0 ? unit.maxHp : (def?.hp ?? 1),
      })
      this.lastPos.set(unit.id, unit.pos)
    }
    for (const id in snapshot.buildings) {
      const building = snapshot.buildings[id]
      if (!building || building.state === 'DESTROYED') {
        continue
      }
      this.buildingList.push({
        building,
        buildTimeMs: config.buildings[building.typeId]?.buildTimeMs ?? 0,
      })
      this.lastPos.set(building.id, building.origin)
    }
  }

  private noteSnapshotGap(snapshot: GameSnapshot, snapshotAtMs: number): void {
    if (snapshot.tick === this.lastTick) {
      return
    }
    if (this.lastTickAtMs > 0) {
      this.tickGapMs = Math.max(TICK_MS, snapshotAtMs - this.lastTickAtMs)
    }
    this.lastTick = snapshot.tick
    this.lastTickAtMs = snapshotAtMs
  }

  draw(
    snapshot: GameSnapshot,
    prev: GameSnapshot | null,
    config: MatchConfig,
    view: RenderView,
  ): void {
    this.ensureLayout(this.app.screen.width, this.app.screen.height, snapshot.map.width, snapshot.map.height)
    this.refreshLists(snapshot, config)
    this.noteSnapshotGap(snapshot, view.snapshotAtMs)
    this.lastSnapshot = snapshot
    this.lastPlayerId = view.localPlayerId
    if (!this.didFocusPlayer) {
      this.focusPlayer(view.localPlayerId)
      this.didFocusPlayer = true
    }
    this.app.stage.position.set(this.originX + this.panX, this.originY + this.panY)
    this.app.stage.scale.set(this.zoom)
    this.collectHits(snapshot, prev, view.events)
    this.drawTerrain(snapshot)
    this.drawResources(snapshot)
    this.drawOccupancy(snapshot)
    this.drawBuildings(snapshot, view)
    this.drawUnits(view)
    this.syncLabels(snapshot)
    this.drawHits()
    this.drawOverlay(snapshot, config, view)
  }

  private collectHits(snapshot: GameSnapshot, prev: GameSnapshot | null, events: DomainEvent[]): void {
    const now = performance.now()
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]
      if (!event || (event.type !== 'DAMAGE_APPLIED' && event.type !== 'UNIT_DIED')) {
        continue
      }
      const key =
        event.type === 'DAMAGE_APPLIED'
          ? `${snapshot.tick}:${index}:dmg:${event.targetId}:${event.amount}:${event.sourceId ?? ''}`
          : `${snapshot.tick}:${index}:die:${event.unitId}`
      if (this.seenHitKeys.has(key)) {
        continue
      }
      this.seenHitKeys.add(key)
      const id = event.type === 'DAMAGE_APPLIED' ? event.targetId : event.unitId
      const unit = snapshot.units[id] ?? prev?.units[id]
      const building = snapshot.buildings[id] ?? prev?.buildings[id]
      const cached = this.lastPos.get(id)
      const gx = unit?.pos.x ?? building?.origin.x ?? cached?.x
      const gy = unit?.pos.y ?? building?.origin.y ?? cached?.y
      if (gx === undefined || gy === undefined) {
        continue
      }
      const amount = event.type === 'DAMAGE_APPLIED' ? event.amount : 0
      const label = new Text({
        text: amount > 0 ? `-${amount}` : t('map.dead'),
        style: { fontSize: Math.max(11, Math.floor(CELL * 0.38)), fill: 0xffd0d0, fontFamily: 'Segoe UI, sans-serif', fontWeight: '700' },
      })
      label.anchor.set(0.5, 1)
      this.floatLayer.addChild(label)
      this.hits.push({ key, gx, gy, until: now + HIT_MS, label })
    }
    if (this.seenHitKeys.size > 400) {
      const live = new Set(this.hits.map((hit) => hit.key))
      this.seenHitKeys = live
    }
  }

  private drawTerrain(snapshot: GameSnapshot): void {
    const key = `${snapshot.map.id}:${snapshot.map.width}x${snapshot.map.height}:${CELL}`
    if (key === this.terrainKey) {
      return
    }
    this.terrainKey = key
    const g = this.terrain
    g.clear()
    for (let y = 0; y < snapshot.map.height; y += 1) {
      for (let x = 0; x < snapshot.map.width; x += 1) {
        const blocked = snapshot.map.terrain[y]?.[x] === 'BLOCKED'
        g.rect(x * CELL, y * CELL, CELL - 1, CELL - 1).fill(blocked ? COLOR.blocked : COLOR.passable)
      }
    }
  }

  private drawResources(snapshot: GameSnapshot): void {
    let key = `${CELL}`
    for (const node of snapshot.map.resourceNodes) {
      key += `|${node.id}:${node.resource}:${node.remaining}:${node.pos.x},${node.pos.y}`
    }
    if (key === this.resourceKey) {
      return
    }
    this.resourceKey = key
    const g = this.resources
    g.clear()
    for (const node of snapshot.map.resourceNodes) {
      if (node.remaining <= 0) {
        continue
      }
      g.rect(node.pos.x * CELL + 6, node.pos.y * CELL + 6, CELL - 13, CELL - 13).fill(node.resource === 'ore' ? COLOR.ore : COLOR.wood)
    }
  }

  private drawOccupancy(snapshot: GameSnapshot): void {
    const key = occupancyFingerprint(this.unitList, this.buildingList, CELL)
    if (key === this.occupancyKey) {
      return
    }
    this.occupancyKey = key
    const g = this.occupancy
    g.clear()
    for (let y = 0; y < snapshot.map.height; y += 1) {
      for (let x = 0; x < snapshot.map.width; x += 1) {
        const cell = snapshot.occupancy.cells[y]?.[x]
        if (cell?.unitId || cell?.buildingId) {
          g.rect(x * CELL + 1, y * CELL + 1, CELL - 3, CELL - 3).stroke(STROKE_GRID)
        }
      }
    }
  }

  private drawBuildings(snapshot: GameSnapshot, view: RenderView): void {
    const g = this.buildings
    g.clear()
    for (const item of this.buildingList) {
      drawBuilding(g, item.building, item.buildTimeMs, view)
    }
  }

  private drawUnits(view: RenderView): void {
    const g = this.units
    g.clear()
    const elapsedMs = view.isOperation ? 0 : Math.min(this.tickGapMs, Math.max(0, performance.now() - view.snapshotAtMs))
    const hpH = hpBarHeight()
    for (const item of this.unitList) {
      const unit = item.unit
      const pos = displayPos(unit, item.moveMs, elapsedMs)
      const selected = view.selected?.kind === 'unit' && view.selected.id === unit.id
      const color = ownerColor(unit.ownerId)
      const r = Math.max(5, Math.floor(CELL * 0.32))
      const cx = pos.x * CELL + CELL / 2
      const cy = pos.y * CELL + CELL / 2
      g.circle(cx, cy, r).fill(color)
      if (view.showOrderHints && view.isOperation && unit.ownerId === view.localPlayerId) {
        g.circle(cx, cy, r + 3).stroke(unit.command ? STROKE_ORDER_SET : STROKE_ORDER_IDLE)
      }
      if (selected) {
        g.circle(cx, cy, r + 5).stroke(STROKE_SELECTED)
      }
      if (item.worker) {
        const mark = Math.max(4, Math.floor(CELL * 0.22))
        g.rect(cx - mark / 2, cy - mark / 2, mark, mark).fill(FILL_WORKER)
      }
      if (unit.hp < item.maxHp) {
        const barW = Math.max(8, r * 2)
        drawHpBar(g, cx - barW / 2, cy + r + 2, barW, hpH, unit.hp, item.maxHp)
      }
    }
  }

  private drawHits(): void {
    const g = this.effects
    g.clear()
    const now = performance.now()
    const keep: typeof this.hits = []
    for (const hit of this.hits) {
      if (hit.until <= now) {
        hit.label.destroy()
        this.seenHitKeys.delete(hit.key)
        continue
      }
      const life = (hit.until - now) / HIT_MS
      this.hitFill.alpha = 0.22 * life
      g.rect(hit.gx * CELL, hit.gy * CELL, CELL - 1, CELL - 1).fill(this.hitFill)
      hit.label.x = hit.gx * CELL + CELL / 2
      hit.label.y = hit.gy * CELL + CELL * 0.2 - (1 - life) * CELL * 0.8
      hit.label.alpha = Math.min(1, life * 1.4)
      keep.push(hit)
    }
    this.hits = keep
  }

  private drawOverlay(snapshot: GameSnapshot, config: MatchConfig, view: RenderView): void {
    const hover = view.hover ? `${view.hover.x},${view.hover.y}` : ''
    const selected = view.selected ? `${view.selected.kind}:${view.selected.id}` : ''
    const drawKey = [
      snapshot.tick,
      view.isOperation ? '1' : '0',
      selected,
      hover,
      view.mode,
      view.buildTypeId ?? '',
      CELL,
    ].join('|')
    if (drawKey === this.overlayDrawKey) {
      return
    }
    this.overlayDrawKey = drawKey
    const g = this.overlay
    g.clear()
    if (view.hover) {
      g.rect(view.hover.x * CELL, view.hover.y * CELL, CELL - 1, CELL - 1).stroke(STROKE_HOVER)
    }
    if (!view.isOperation) {
      return
    }
    const selectedUnit = view.selected?.kind === 'unit' ? snapshot.units[view.selected.id] : undefined
    const selectedBuilding = view.selected?.kind === 'building' ? snapshot.buildings[view.selected.id] : undefined
    if (selectedUnit && selectedUnit.state !== 'DEAD') {
      const reachKey = `${snapshot.tick}:${selectedUnit.id}:${selectedUnit.pos.x},${selectedUnit.pos.y}:${selectedUnit.moveRemaining}`
      if (reachKey !== this.reachKey) {
        this.reachKey = reachKey
        this.reachCells = previewReachable(snapshot, selectedUnit)
      }
      for (const cell of this.reachCells) {
        g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill(FILL_MOVE)
      }
      const range = attackRangeOf(config, selectedUnit)
      const rangeKey = `${selectedUnit.id}:${selectedUnit.pos.x},${selectedUnit.pos.y}:${range}:${CELL}`
      if (rangeKey !== this.unitRangeKey) {
        this.unitRangeKey = rangeKey
        this.unitRangeCells = range > 0 ? rangeCells(snapshot, entityCells(snapshot, selectedUnit), range) : []
      }
      for (const cell of this.unitRangeCells) {
        g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill(FILL_RANGE)
      }
      if (view.hover && (view.mode === 'select' || view.mode === 'patrol')) {
        const pathKey = `${reachKey}:${hover}:${view.mode}`
        if (pathKey !== this.pathKey) {
          this.pathKey = pathKey
          this.pathCells = previewMovePath(snapshot, selectedUnit, view.hover)
        }
        this.pathCells.forEach((step, index) => {
          const withinBudget = index < selectedUnit.moveRemaining
          g.circle(step.x * CELL + CELL / 2, step.y * CELL + CELL / 2, 4).fill(
            withinBudget ? COLOR.path : COLOR.invalid,
          )
        })
      }
      if (selectedUnit.path.length > 0) {
        for (const step of selectedUnit.path) {
          g.circle(step.x * CELL + CELL / 2, step.y * CELL + CELL / 2, 3).fill(FILL_PATH_GHOST)
        }
      }
    }
    if (selectedBuilding && selectedBuilding.state !== 'DESTROYED') {
      const range = buildingAttackRange(config, selectedBuilding)
      const bKey = `${selectedBuilding.id}:${range}:${CELL}`
      if (bKey !== this.buildingRangeKey) {
        this.buildingRangeKey = bKey
        this.buildingRangeCells =
          range > 0 ? rangeCells(snapshot, entityCells(snapshot, undefined, selectedBuilding), range) : []
      }
      for (const cell of this.buildingRangeCells) {
        g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill(FILL_BUILDING_RANGE)
      }
    }
    if (view.mode === 'build' && view.buildTypeId && view.hover) {
      const def = config.buildings[view.buildTypeId]
      if (def) {
        const valid = plotValid(snapshot.occupancy, view.hover, def.size, snapshot.map.width, snapshot.map.height)
        for (const cell of buildingCells(view.hover, def.size)) {
          g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill(valid ? FILL_PLOT_OK : FILL_PLOT_BAD)
        }
      }
    }
  }

  private syncLabels(snapshot: GameSnapshot): void {
    const nameSize = Math.max(9, Math.floor(CELL * 0.28))
    const liveBuildings = new Set<string>()
    for (const item of this.buildingList) {
      const building = item.building
      liveBuildings.add(building.id)
      const text = buildingLabel(building)
      upsertLabel(this.buildingLabels, this.labels, building.id, text, nameSize, 0xf2f5f8, building.origin.x * CELL + 4, building.origin.y * CELL + 4)
    }
    for (const [id, item] of this.buildingLabels) {
      if (!liveBuildings.has(id)) {
        item.view.destroy()
        this.buildingLabels.delete(id)
      }
    }

    const liveNodes = new Set<string>()
    void locale.value
    for (const node of snapshot.map.resourceNodes) {
      if (node.remaining <= 0) {
        continue
      }
      liveNodes.add(node.id)
      const text = `${t(node.resource === 'ore' ? 'map.ore' : 'map.wood')}${node.remaining}`
      upsertLabel(this.nodeLabels, this.labels, node.id, text, 10, 0xf7efe3, node.pos.x * CELL + 4, node.pos.y * CELL + CELL - 14)
    }
    for (const [id, item] of this.nodeLabels) {
      if (!liveNodes.has(id)) {
        item.view.destroy()
        this.nodeLabels.delete(id)
      }
    }
  }
}

function upsertLabel(
  pool: Map<string, PooledText>,
  parent: Container,
  id: string,
  text: string,
  size: number,
  fill: number,
  x: number,
  y: number,
): void {
  let item = pool.get(id)
  if (!item) {
    const view = new Text({
      text,
      style: { fontSize: size, fill, fontFamily: 'Segoe UI, sans-serif' },
    })
    parent.addChild(view)
    item = { view, text, size }
    pool.set(id, item)
  } else if (item.text !== text || item.size !== size) {
    item.view.text = text
    item.view.style.fontSize = size
    item.text = text
    item.size = size
  }
  item.view.x = x
  item.view.y = y
}

function occupancyFingerprint(units: LiveUnit[], buildings: LiveBuilding[], cell: number): string {
  let hash = units.length * 131 + buildings.length
  for (const item of units) {
    hash = (hash * 31 + item.unit.pos.x * 1009 + item.unit.pos.y) | 0
  }
  for (const item of buildings) {
    const building = item.building
    hash = (hash * 31 + building.origin.x * 17 + building.origin.y + (building.size.w << 8)) | 0
  }
  return `${cell}:${hash}:${units.length}:${buildings.length}`
}

function clampPanAxis(pan: number, origin: number, scaled: number, view: number, margin: number): number {
  const min = view - margin - scaled - origin
  const max = margin - origin
  if (min > max) {
    return (min + max) / 2
  }
  return Math.min(max, Math.max(min, pan))
}

function displayPos(unit: Unit, moveMs: number, elapsedMs: number): GridPos {
  const next = unit.path[0]
  if (!next || moveMs <= 0) {
    return { x: unit.pos.x, y: unit.pos.y }
  }
  const progress = Math.min(1, Math.max(0, (unit.moveProgressMs + elapsedMs) / moveMs))
  return {
    x: unit.pos.x + (next.x - unit.pos.x) * progress,
    y: unit.pos.y + (next.y - unit.pos.y) * progress,
  }
}

function drawBuilding(g: Graphics, building: Building, buildTimeMs: number, view: RenderView): void {
  const w = building.size.w * CELL - 2
  const h = building.size.h * CELL - 2
  const x = building.origin.x * CELL + 1
  const y = building.origin.y * CELL + 1
  const ready = ownerColor(building.ownerId, true)
  if (building.state === 'CONSTRUCTING') {
    g.rect(x, y, w, h).fill(FILL_CONSTRUCT)
    const ratio = buildTimeMs > 0 ? Math.max(0, Math.min(1, building.buildProgressMs / buildTimeMs)) : 0
    if (ratio > 0) {
      const built = Math.max(1, Math.round(h * ratio))
      g.rect(x, y + h - built, w, built).fill(ready)
    }
  } else {
    g.rect(x, y, w, h).fill(ready)
  }
  if (view.showOrderHints && view.isOperation && building.ownerId === view.localPlayerId) {
    g.rect(x, y, w, h).stroke(building.command ? STROKE_ORDER_SET : STROKE_ORDER_IDLE)
  }
  if (view.selected?.kind === 'building' && view.selected.id === building.id) {
    g.rect(x - 1, y - 1, w + 2, h + 2).stroke(STROKE_SELECTED)
  }
  const hpH = hpBarHeight()
  drawHpBar(g, x + 4, y + h - hpH - 2, Math.max(8, w - 8), hpH, building.hp, building.maxHp > 0 ? building.maxHp : 1)
}

function hpBarHeight(): number {
  return Math.max(2, Math.round(CELL * 0.1))
}

function drawHpBar(g: Graphics, x: number, y: number, w: number, h: number, hp: number, maxHp: number): void {
  const ratio = maxHp <= 0 ? 0 : Math.max(0, Math.min(1, hp / maxHp))
  const filled = Math.max(0, Math.round(w * ratio))
  g.rect(x, y, w, h).fill(FILL_HP_BACK)
  if (filled > 0) {
    g.rect(x, y, filled, h).fill(ratio > 0.35 ? FILL_HP_GOOD : FILL_HP_BAD)
  }
}

function buildingLabel(building: Building): string {
  const name = buildingName(building.typeId)
  return building.state === 'CONSTRUCTING' ? `${name}${t('building.ellipsis')}` : name
}

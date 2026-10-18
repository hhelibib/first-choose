/**
 * Pixi 战场。按快照色块绘制，单位位置用 moveProgressMs 插值到 60FPS。
 * 不预测伤害和胜负。
 */
import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { Building, DomainEvent, EntityRef, GameSnapshot, GridPos, MatchConfig, Unit } from '@battle/shared'
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
import { buildingName, t } from '../i18n/index.js'
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

export class BattleRenderer {
  readonly app = new Application()
  private readonly terrain = new Graphics()
  private readonly occupancy = new Graphics()
  private readonly buildings = new Graphics()
  private readonly units = new Graphics()
  private readonly effects = new Graphics()
  private readonly overlay = new Graphics()
  private readonly labels = new Container()
  private readonly floatLayer = new Container()
  private hits: Array<{ gx: number; gy: number; until: number; label: Text }> = []
  private lastEvents: DomainEvent[] = []
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
    this.app.destroy(true)
  }

  cellScreen(pos: GridPos, snapshot: GameSnapshot): { x: number; y: number; cell: number } {
    this.layout(this.app.screen.width, this.app.screen.height, snapshot.map.width, snapshot.map.height)
    return {
      x: this.originX + this.panX + pos.x * CELL * this.zoom,
      y: this.originY + this.panY + pos.y * CELL * this.zoom,
      cell: CELL * this.zoom,
    }
  }

  gridAt(clientX: number, clientY: number, snapshot: GameSnapshot): GridPos | null {
    const rect = this.app.canvas.getBoundingClientRect()
    this.layout(this.app.screen.width, this.app.screen.height, snapshot.map.width, snapshot.map.height)
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

  private layout(viewW: number, viewH: number, width: number, height: number): void {
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
    this.clampPan()
  }

  private focusPlayer(snapshot: GameSnapshot, playerId: string): void {
    this.zoom = 1
    let gx = 0
    let gy = 0
    let gw = 1
    let gh = 1
    const base = Object.values(snapshot.buildings).find(
      (building) => building.ownerId === playerId && building.role === 'MAIN_BASE' && building.state !== 'DESTROYED',
    )
    if (base) {
      gx = base.origin.x
      gy = base.origin.y
      gw = base.size.w
      gh = base.size.h
    } else {
      const unit = Object.values(snapshot.units).find((item) => item.ownerId === playerId && item.state !== 'DEAD')
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

  draw(
    snapshot: GameSnapshot,
    prev: GameSnapshot | null,
    config: MatchConfig,
    view: RenderView,
  ): void {
    this.layout(this.app.screen.width, this.app.screen.height, snapshot.map.width, snapshot.map.height)
    if (!this.didFocusPlayer) {
      this.focusPlayer(snapshot, view.localPlayerId)
      this.didFocusPlayer = true
    }
    this.app.stage.position.set(this.originX + this.panX, this.originY + this.panY)
    this.app.stage.scale.set(this.zoom)
    this.app.stage.hitArea = new Rectangle(0, 0, snapshot.map.width * CELL, snapshot.map.height * CELL)
    this.collectHits(snapshot, prev, view.events)
    this.drawTerrain(snapshot)
    this.drawOccupancy(snapshot)
    this.drawBuildings(snapshot, view)
    this.drawUnits(snapshot, prev, config, view)
    this.drawHits()
    this.drawOverlay(snapshot, config, view)
  }

  private collectHits(snapshot: GameSnapshot, prev: GameSnapshot | null, events: DomainEvent[]): void {
    if (events === this.lastEvents) {
      return
    }
    this.lastEvents = events
    const now = performance.now()
    for (const event of events) {
      if (event.type !== 'DAMAGE_APPLIED' && event.type !== 'UNIT_DIED') {
        continue
      }
      const id = event.type === 'DAMAGE_APPLIED' ? event.targetId : event.unitId
      const unit = snapshot.units[id] ?? prev?.units[id]
      const building = snapshot.buildings[id] ?? prev?.buildings[id]
      const gx = unit?.pos.x ?? building?.origin.x
      const gy = unit?.pos.y ?? building?.origin.y
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
      this.hits.push({ gx, gy, until: now + 900, label })
    }
  }

  private drawTerrain(snapshot: GameSnapshot): void {
    const g = this.terrain
    g.clear()
    for (let y = 0; y < snapshot.map.height; y += 1) {
      for (let x = 0; x < snapshot.map.width; x += 1) {
        const blocked = snapshot.map.terrain[y]?.[x] === 'BLOCKED'
        g.rect(x * CELL, y * CELL, CELL - 1, CELL - 1).fill(blocked ? COLOR.blocked : COLOR.passable)
      }
    }
    for (const node of snapshot.map.resourceNodes) {
      if (node.remaining <= 0) {
        continue
      }
      g.rect(node.pos.x * CELL + 6, node.pos.y * CELL + 6, CELL - 13, CELL - 13).fill(node.resource === 'ore' ? COLOR.ore : COLOR.wood)
    }
  }

  private drawOccupancy(snapshot: GameSnapshot): void {
    const g = this.occupancy
    g.clear()
    for (let y = 0; y < snapshot.map.height; y += 1) {
      for (let x = 0; x < snapshot.map.width; x += 1) {
        const cell = snapshot.occupancy.cells[y]?.[x]
        if (cell?.unitId || cell?.buildingId) {
          g.rect(x * CELL + 1, y * CELL + 1, CELL - 3, CELL - 3).stroke({ color: COLOR.grid, width: 1, alpha: 0.35 })
        }
      }
    }
  }

  private drawBuildings(snapshot: GameSnapshot, view: RenderView): void {
    const g = this.buildings
    g.clear()
    for (const building of Object.values(snapshot.buildings)) {
      drawBuilding(g, building, view)
    }
    this.rebuildLabels(snapshot)
  }

  private drawUnits(snapshot: GameSnapshot, prev: GameSnapshot | null, config: MatchConfig, view: RenderView): void {
    const g = this.units
    g.clear()
    const alpha = view.isOperation ? 1 : Math.min(1, Math.max(0, (performance.now() - view.snapshotAtMs) / 50))
    for (const unit of Object.values(snapshot.units)) {
      const prevUnit = prev?.units[unit.id] ?? null
      const pos = interpolateUnit(unit, prevUnit, config, alpha)
      const selected = view.selected?.kind === 'unit' && view.selected.id === unit.id
      const color = ownerColor(unit.ownerId)
      const r = Math.max(5, Math.floor(CELL * 0.32))
      const cx = pos.x * CELL + CELL / 2
      const cy = pos.y * CELL + CELL / 2
      g.circle(cx, cy, r).fill(color)
      if (
        view.showOrderHints &&
        view.isOperation &&
        unit.ownerId === view.localPlayerId &&
        unit.state !== 'DEAD'
      ) {
        g.circle(cx, cy, r + 3).stroke({
          color: unit.command ? COLOR.orderSet : COLOR.orderIdle,
          width: 2,
        })
      }
      if (selected) {
        g.circle(cx, cy, r + 5).stroke({ color: COLOR.selected, width: 2 })
      }
      if (config.units[unit.typeId]?.role === 'WORKER') {
        const mark = Math.max(4, Math.floor(CELL * 0.22))
        g.rect(cx - mark / 2, cy - mark / 2, mark, mark).fill(0xffffff)
      }
      const maxHp = unit.maxHp > 0 ? unit.maxHp : (config.units[unit.typeId]?.hp ?? 1)
      if (unit.hp < maxHp) {
        const barW = Math.max(8, r * 2)
        drawHpBar(g, cx - barW / 2, cy + r + 2, barW, unit.hp, maxHp)
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
        continue
      }
      const t = (hit.until - now) / 900
      g.rect(hit.gx * CELL, hit.gy * CELL, CELL - 1, CELL - 1).fill({ color: COLOR.hpBad, alpha: 0.22 * t })
      hit.label.x = hit.gx * CELL + CELL / 2
      hit.label.y = hit.gy * CELL + CELL * 0.2 - (1 - t) * CELL * 0.8
      hit.label.alpha = Math.min(1, t * 1.4)
      keep.push(hit)
    }
    this.hits = keep
  }

  private drawOverlay(snapshot: GameSnapshot, config: MatchConfig, view: RenderView): void {
    const g = this.overlay
    g.clear()
    if (view.hover) {
      g.rect(view.hover.x * CELL, view.hover.y * CELL, CELL - 1, CELL - 1).stroke({ color: COLOR.hover, width: 2 })
    }
    if (!view.isOperation) {
      return
    }
    const selectedUnit = view.selected?.kind === 'unit' ? snapshot.units[view.selected.id] : undefined
    const selectedBuilding = view.selected?.kind === 'building' ? snapshot.buildings[view.selected.id] : undefined
    if (selectedUnit) {
      for (const cell of previewReachable(snapshot, selectedUnit)) {
        g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill({ color: COLOR.moveRange, alpha: 0.16 })
      }
      const range = attackRangeOf(config, selectedUnit)
      if (range > 0) {
        for (const cell of rangeCells(snapshot, entityCells(snapshot, selectedUnit), range)) {
          g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill({ color: COLOR.range, alpha: 0.12 })
        }
      }
      if (view.hover && (view.mode === 'select' || view.mode === 'patrol')) {
        const path = previewMovePath(snapshot, selectedUnit, view.hover)
        path.forEach((step, index) => {
          const withinBudget = index < selectedUnit.moveRemaining
          g.circle(step.x * CELL + CELL / 2, step.y * CELL + CELL / 2, 4).fill(
            withinBudget ? COLOR.path : COLOR.invalid,
          )
        })
      }
      if (selectedUnit.path.length > 0) {
        for (const step of selectedUnit.path) {
          g.circle(step.x * CELL + CELL / 2, step.y * CELL + CELL / 2, 3).fill({ color: COLOR.path, alpha: 0.7 })
        }
      }
    }
    if (selectedBuilding) {
      const range = buildingAttackRange(config, selectedBuilding)
      if (range > 0) {
        for (const cell of rangeCells(snapshot, entityCells(snapshot, undefined, selectedBuilding), range)) {
          g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill({ color: COLOR.range, alpha: 0.1 })
        }
      }
    }
    if (view.mode === 'build' && view.buildTypeId && view.hover) {
      const def = config.buildings[view.buildTypeId]
      if (def) {
        const valid = plotValid(snapshot.occupancy, view.hover, def.size, snapshot.map.width, snapshot.map.height)
        for (const cell of buildingCells(view.hover, def.size)) {
          g.rect(cell.x * CELL, cell.y * CELL, CELL - 1, CELL - 1).fill({
            color: valid ? COLOR.path : COLOR.invalid,
            alpha: 0.35,
          })
        }
      }
    }
    for (const node of snapshot.map.resourceNodes) {
      if (node.remaining <= 0) {
        continue
      }
      // remaining drawn as labels
    }
  }

  private rebuildLabels(snapshot: GameSnapshot): void {
    this.labels.removeChildren()
    for (const building of Object.values(snapshot.buildings)) {
      const text = new Text({
        text: buildingLabel(building),
        style: { fontSize: Math.max(9, Math.floor(CELL * 0.28)), fill: 0xf2f5f8, fontFamily: 'Segoe UI, sans-serif' },
      })
      text.x = building.origin.x * CELL + 4
      text.y = building.origin.y * CELL + 4
      this.labels.addChild(text)
    }
    for (const node of snapshot.map.resourceNodes) {
      if (node.remaining <= 0) {
        continue
      }
      const text = new Text({
        text: `${t(node.resource === 'ore' ? 'map.ore' : 'map.wood')}${node.remaining}`,
        style: { fontSize: 10, fill: 0xf7efe3, fontFamily: 'Segoe UI, sans-serif' },
      })
      text.x = node.pos.x * CELL + 4
      text.y = node.pos.y * CELL + CELL - 14
      this.labels.addChild(text)
    }
  }
}

function clampPanAxis(pan: number, origin: number, scaled: number, view: number, margin: number): number {
  const min = view - margin - scaled - origin
  const max = margin - origin
  if (min > max) {
    return (min + max) / 2
  }
  return Math.min(max, Math.max(min, pan))
}

function interpolateUnit(unit: Unit, prev: Unit | null, config: MatchConfig, alpha: number): GridPos {
  const current = progressPos(unit, config)
  if (!prev) {
    return current
  }
  const older = progressPos(prev, config)
  return {
    x: older.x + (current.x - older.x) * alpha,
    y: older.y + (current.y - older.y) * alpha,
  }
}

function progressPos(unit: Unit, config: MatchConfig): { x: number; y: number } {
  const next = unit.path[0]
  const moveMs = config.units[unit.typeId]?.moveMsPerCell ?? 500
  if (!next || moveMs <= 0) {
    return { x: unit.pos.x, y: unit.pos.y }
  }
  const t = Math.min(1, Math.max(0, unit.moveProgressMs / moveMs))
  return {
    x: unit.pos.x + (next.x - unit.pos.x) * t,
    y: unit.pos.y + (next.y - unit.pos.y) * t,
  }
}

function drawBuilding(g: Graphics, building: Building, view: RenderView): void {
  const w = building.size.w * CELL - 2
  const h = building.size.h * CELL - 2
  const x = building.origin.x * CELL + 1
  const y = building.origin.y * CELL + 1
  const fill = building.state === 'CONSTRUCTING' ? COLOR.constructing : ownerColor(building.ownerId, true)
  g.rect(x, y, w, h).fill(fill)
  if (
    view.showOrderHints &&
    view.isOperation &&
    building.ownerId === view.localPlayerId &&
    building.state !== 'DESTROYED'
  ) {
    g.rect(x, y, w, h).stroke({
      color: building.command ? COLOR.orderSet : COLOR.orderIdle,
      width: 2,
    })
  }
  if (view.selected?.kind === 'building' && view.selected.id === building.id) {
    g.rect(x - 1, y - 1, w + 2, h + 2).stroke({ color: COLOR.selected, width: 2 })
  }
  drawHpBar(g, x + 4, y + h - 8, Math.max(8, w - 8), building.hp, building.maxHp > 0 ? building.maxHp : 1)
}

function drawHpBar(g: Graphics, x: number, y: number, w: number, hp: number, maxHp: number): void {
  const ratio = maxHp <= 0 ? 0 : Math.max(0, Math.min(1, hp / maxHp))
  const filled = Math.max(0, Math.round(w * ratio))
  g.rect(x, y, w, 4).fill({ color: COLOR.hpBack })
  if (filled > 0) {
    g.rect(x, y, filled, 4).fill({ color: ratio > 0.35 ? COLOR.hpGood : COLOR.hpBad })
  }
}

function buildingLabel(building: Building): string {
  const name = buildingName(building.typeId)
  return building.state === 'CONSTRUCTING' ? `${name}${t('building.ellipsis')}` : name
}

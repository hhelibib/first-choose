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
import { CELL, COLOR, ownerColor } from './colors.js'

export interface RenderView {
  selected: EntityRef | null
  hover: GridPos | null
  mode: string
  buildTypeId: string | null
  localPlayerId: string
  events: DomainEvent[]
  snapshotAtMs: number
  isOperation: boolean
}

export class BattleRenderer {
  readonly app = new Application()
  private readonly terrain = new Graphics()
  private readonly occupancy = new Graphics()
  private readonly buildings = new Graphics()
  private readonly units = new Graphics()
  private readonly effects = new Graphics()
  private readonly overlay = new Graphics()
  private readonly labels = new Container()
  private flashes: Array<{ x: number; y: number; until: number }> = []
  private lastEvents: DomainEvent[] = []

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
    stage.addChild(this.terrain, this.occupancy, this.buildings, this.units, this.effects, this.overlay, this.labels)
  }

  destroy(): void {
    this.app.destroy(true)
  }

  gridAt(clientX: number, clientY: number, snapshot: GameSnapshot): GridPos | null {
    const rect = this.app.canvas.getBoundingClientRect()
    const origin = mapOrigin(this.app.screen.width, this.app.screen.height, snapshot.map.width, snapshot.map.height)
    const x = Math.floor((clientX - rect.left - origin.x) / CELL)
    const y = Math.floor((clientY - rect.top - origin.y) / CELL)
    if (x < 0 || y < 0 || x >= snapshot.map.width || y >= snapshot.map.height) {
      return null
    }
    return { x, y }
  }

  draw(
    snapshot: GameSnapshot,
    prev: GameSnapshot | null,
    config: MatchConfig,
    view: RenderView,
  ): void {
    const origin = mapOrigin(this.app.screen.width, this.app.screen.height, snapshot.map.width, snapshot.map.height)
    this.app.stage.position.set(origin.x, origin.y)
    this.app.stage.hitArea = new Rectangle(0, 0, snapshot.map.width * CELL, snapshot.map.height * CELL)
    this.collectFlashes(view.events)
    this.drawTerrain(snapshot)
    this.drawOccupancy(snapshot)
    this.drawBuildings(snapshot, view)
    this.drawUnits(snapshot, prev, config, view)
    this.drawEffects()
    this.drawOverlay(snapshot, config, view)
  }

  private collectFlashes(events: DomainEvent[]): void {
    if (events === this.lastEvents) {
      return
    }
    this.lastEvents = events
    const now = performance.now()
    for (const event of events) {
      if (event.type === 'DAMAGE_APPLIED' || event.type === 'UNIT_DIED' || event.type === 'CARD_PLAYED') {
        this.flashes.push({ x: 0, y: 0, until: now + 280 })
      }
    }
    this.flashes = this.flashes.filter((item) => item.until > now)
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
      drawBuilding(g, building, view.selected)
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
      const r = 12
      const cx = pos.x * CELL + CELL / 2
      const cy = pos.y * CELL + CELL / 2
      if (selected) {
        g.circle(cx, cy, r + 4).stroke({ color: COLOR.selected, width: 2 })
      }
      g.circle(cx, cy, r).fill(color)
      if (config.units[unit.typeId]?.role === 'WORKER') {
        g.rect(cx - 4, cy - 4, 8, 8).fill(0xffffff)
      }
      drawHpBar(g, cx - 14, cy - 20, 28, unit.hp, unit.maxHp)
    }
  }

  private drawEffects(): void {
    const g = this.effects
    g.clear()
    const now = performance.now()
    this.flashes = this.flashes.filter((item) => item.until > now)
    if (this.flashes.length > 0) {
      g.rect(0, 0, this.app.screen.width, 4).fill({ color: COLOR.hpBad, alpha: 0.45 })
    }
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
        style: { fontSize: 11, fill: 0xf2f5f8, fontFamily: 'Segoe UI, sans-serif' },
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
        text: `${node.resource === 'ore' ? '矿' : '木'}${node.remaining}`,
        style: { fontSize: 10, fill: 0xf7efe3, fontFamily: 'Segoe UI, sans-serif' },
      })
      text.x = node.pos.x * CELL + 4
      text.y = node.pos.y * CELL + CELL - 14
      this.labels.addChild(text)
    }
  }
}

function mapOrigin(viewW: number, viewH: number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.max(8, (viewW - width * CELL) / 2),
    y: Math.max(8, (viewH - height * CELL) / 2),
  }
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

function drawBuilding(g: Graphics, building: Building, selected: EntityRef | null): void {
  const w = building.size.w * CELL - 2
  const h = building.size.h * CELL - 2
  const x = building.origin.x * CELL + 1
  const y = building.origin.y * CELL + 1
  const fill = building.state === 'CONSTRUCTING' ? COLOR.constructing : ownerColor(building.ownerId, true)
  g.rect(x, y, w, h).fill(fill)
  if (selected?.kind === 'building' && selected.id === building.id) {
    g.rect(x, y, w, h).stroke({ color: COLOR.selected, width: 2 })
  }
  drawHpBar(g, x + 4, y + h - 8, w - 8, building.hp, building.maxHp)
}

function drawHpBar(g: Graphics, x: number, y: number, w: number, hp: number, maxHp: number): void {
  const ratio = maxHp <= 0 ? 0 : Math.max(0, Math.min(1, hp / maxHp))
  g.rect(x, y, w, 4).fill(COLOR.hpBack)
  g.rect(x, y, w * ratio, 4).fill(ratio > 0.35 ? COLOR.hpGood : COLOR.hpBad)
}

function buildingLabel(building: Building): string {
  if (building.role === 'MAIN_BASE') {
    return '主基地'
  }
  if (building.role === 'PRODUCTION') {
    return building.state === 'CONSTRUCTING' ? '兵营…' : '兵营'
  }
  if (building.role === 'DEFENSE') {
    return building.state === 'CONSTRUCTING' ? '箭塔…' : '箭塔'
  }
  return building.typeId
}

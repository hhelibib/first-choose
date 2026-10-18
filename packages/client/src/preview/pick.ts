import type { Building, GameSnapshot, GridPos, ResourceNode, Unit } from '@battle/shared'
import { buildingCells } from './command-preview.js'

export type WorldPick =
  | { kind: 'unit'; unit: Unit }
  | { kind: 'building'; building: Building }
  | { kind: 'resource'; node: ResourceNode }
  | { kind: 'empty'; pos: GridPos }

export function pickAt(snapshot: GameSnapshot, pos: GridPos, preferOwnId?: string): WorldPick {
  const units = Object.values(snapshot.units).filter(
    (unit) => unit.state !== 'DEAD' && unit.pos.x === pos.x && unit.pos.y === pos.y,
  )
  if (preferOwnId) {
    const mine = units.find((unit) => unit.ownerId === preferOwnId)
    if (mine) {
      return { kind: 'unit', unit: mine }
    }
  }
  if (units[0]) {
    return { kind: 'unit', unit: units[0] }
  }
  const buildings = Object.values(snapshot.buildings).filter((building) => {
    if (building.state === 'DESTROYED') {
      return false
    }
    return buildingCells(building.origin, building.size).some((cell) => cell.x === pos.x && cell.y === pos.y)
  })
  if (preferOwnId) {
    const mine = buildings.find((building) => building.ownerId === preferOwnId)
    if (mine) {
      return { kind: 'building', building: mine }
    }
  }
  if (buildings[0]) {
    return { kind: 'building', building: buildings[0] }
  }
  const node = snapshot.map.resourceNodes.find((item) => item.pos.x === pos.x && item.pos.y === pos.y && item.remaining > 0)
  if (node) {
    return { kind: 'resource', node }
  }
  return { kind: 'empty', pos }
}

export function sameRef(a: { kind: string; id: string } | null, kind: string, id: string): boolean {
  return !!a && a.kind === kind && a.id === id
}

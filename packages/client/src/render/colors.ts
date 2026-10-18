export let CELL = 40

export function setCellSize(size: number): void {
  CELL = size
}

export const COLOR = {
  background: 0x12161c,
  passable: 0x2a3340,
  blocked: 0x151820,
  grid: 0x3a4554,
  wood: 0x8b5a2b,
  ore: 0x8fa3b8,
  p0: 0x4aa3ff,
  p1: 0xe85d5d,
  buildingP0: 0x2d6fbf,
  buildingP1: 0xb44545,
  constructing: 0x6b5b3a,
  selected: 0xffe066,
  orderIdle: 0xff9f43,
  orderSet: 0x3ecf6e,
  hover: 0x9ad1ff,
  path: 0xf5d76e,
  moveRange: 0x5ec8e8,
  range: 0xe85d5d,
  hpBack: 0x1b1f27,
  hpGood: 0x3ecf6e,
  hpBad: 0xd94c4c,
  invalid: 0xcc3344,
  overlay: 0xffffff,
} as const

export function ownerColor(ownerId: string, building = false): number {
  if (ownerId === 'p0') {
    return building ? COLOR.buildingP0 : COLOR.p0
  }
  return building ? COLOR.buildingP1 : COLOR.p1
}

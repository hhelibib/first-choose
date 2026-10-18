/**
 * MatchConfig 校验。解析失败不得进入模拟。
 */
import { z } from 'zod'
import type { MatchConfig } from './types.js'

const gridPosSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
})

const resourcesSchema = z.object({
  food: z.number().int().nonnegative().default(0),
  wood: z.number().int().nonnegative(),
  stone: z.number().int().nonnegative().default(0),
  ore: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
})

const resourceNodeConfigSchema = z.object({
  id: z.string().min(1),
  resource: z.enum(['food', 'wood', 'stone', 'ore', 'gold']),
  pos: gridPosSchema,
  amount: z.number().int().positive(),
})

const playerStartSchema = z.object({
  start: gridPosSchema,
  teamId: z.number().int().nonnegative(),
  buildings: z.array(
    z.object({
      typeId: z.string().min(1),
      origin: gridPosSchema,
    }),
  ),
  units: z.array(
    z.object({
      typeId: z.string().min(1),
      pos: gridPosSchema,
    }),
  ),
})

const mapConfigSchema = z
  .object({
    id: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    terrain: z.array(z.array(z.enum(['PASSABLE', 'BLOCKED']))),
    resourceNodes: z.array(resourceNodeConfigSchema),
    players: z.array(playerStartSchema).min(1),
  })
  .superRefine((map, ctx) => {
    if (map.terrain.length !== map.height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['terrain'],
        message: '地形行数必须等于地图高度',
      })
    }
    map.terrain.forEach((row, y) => {
      if (row.length !== map.width) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['terrain', y],
          message: '地形列数必须等于地图宽度',
        })
      }
    })
    const inside = (pos: { x: number; y: number }, path: (string | number)[]) => {
      if (pos.x < 0 || pos.y < 0 || pos.x >= map.width || pos.y >= map.height) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: '坐标超出地图',
        })
      }
    }
    map.resourceNodes.forEach((node, index) => {
      inside(node.pos, ['resourceNodes', index, 'pos'])
    })
    map.players.forEach((player, playerIndex) => {
      inside(player.start, ['players', playerIndex, 'start'])
      player.buildings.forEach((building, buildingIndex) => {
        inside(building.origin, ['players', playerIndex, 'buildings', buildingIndex, 'origin'])
      })
      player.units.forEach((unit, unitIndex) => {
        inside(unit.pos, ['players', playerIndex, 'units', unitIndex, 'pos'])
      })
    })
  })

const unitDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  role: z.enum(['WORKER', 'COMBAT']),
  hp: z.number().int().positive(),
  attack: z.number().int().nonnegative(),
  armor: z.number().int().nonnegative(),
  attackIntervalMs: z.number().int().nonnegative(),
  attackRange: z.number().int().nonnegative(),
  moveMsPerCell: z.number().int().positive(),
  moveRange: z.number().int().positive(),
  carryCapacity: z.number().int().nonnegative(),
  gatherMs: z.number().int().nonnegative(),
  population: z.number().int().nonnegative(),
  autoAttack: z.boolean(),
  commands: z.array(z.enum(['MOVE', 'ATTACK', 'PATROL', 'GATHER', 'BUILD', 'REPAIR', 'STOP'])),
})

const buildingDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  role: z.enum(['MAIN_BASE', 'PRODUCTION', 'DEFENSE', 'WAREHOUSE', 'RESOURCE']),
  hp: z.number().int().positive(),
  armor: z.number().int().nonnegative(),
  size: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
  attack: z.number().int().nonnegative(),
  attackIntervalMs: z.number().int().nonnegative(),
  attackRange: z.number().int().nonnegative(),
  buildCost: resourcesSchema,
  buildTimeMs: z.number().int().nonnegative(),
  production: z.array(
    z.object({
      unitTypeId: z.string().min(1),
      cost: resourcesSchema,
      timeMs: z.number().int().positive(),
    }),
  ),
  harvest: z
    .object({
      resource: z.enum(['food', 'wood', 'stone', 'ore', 'gold']),
      amount: z.number().int().positive(),
      intervalMs: z.number().int().positive(),
    })
    .optional(),
})

const cardEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HEAL_BUILDING'),
    amount: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('DAMAGE_AREA'),
    radius: z.number().int().nonnegative(),
    amount: z.number().int().positive(),
    metric: z.literal('CHEBYSHEV'),
  }),
  z.object({
    type: z.literal('ATTACK_BUFF'),
    amount: z.number().int(),
    durationTicks: z.number().int().positive(),
  }),
])

const cardDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['ENGINEERING', 'ATTACK', 'SUPPORT']),
  cost: z.number().int().nonnegative(),
  targetType: z.enum(['NONE', 'UNIT', 'BUILDING', 'CELL', 'AREA']),
  effects: z.array(cardEffectSchema).min(1),
})

const victoryRuleSchema = z.object({
  mode: z.enum(['ANY', 'ALL']),
  conditions: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('DESTROY_MAIN_BASE'), enabled: z.boolean() }),
      z.object({
        type: z.literal('CAPTURE_POINTS'),
        enabled: z.boolean(),
        target: z.number().int().positive(),
      }),
      z.object({
        type: z.literal('RESOURCE_SCORE'),
        enabled: z.boolean(),
        target: z.number().int().positive(),
      }),
      z.object({
        type: z.literal('SURVIVE_ROUNDS'),
        enabled: z.boolean(),
        rounds: z.number().int().positive(),
      }),
    ]),
  ),
})

export const matchConfigSchema = z.object({
  id: z.string().min(1),
  map: mapConfigSchema,
  units: z.record(unitDefinitionSchema),
  buildings: z.record(buildingDefinitionSchema),
  cards: z.record(cardDefinitionSchema),
  victory: victoryRuleSchema,
  repair: z.object({
    intervalMs: z.number().int().positive(),
    oreCost: z.number().int().nonnegative(),
    heal: z.number().int().positive(),
  }),
  populationCap: z.number().int().positive(),
  startingResources: resourcesSchema,
  maxEnergy: z.number().int().nonnegative(),
  energyPerRound: z.number().int().nonnegative(),
  handLimit: z.number().int().positive(),
  deckCardIds: z.array(z.string().min(1)),
})

export function parseMatchConfig(input: unknown): MatchConfig {
  return matchConfigSchema.parse(input)
}

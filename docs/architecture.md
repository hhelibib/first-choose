# 《战斗吧》一期架构设计说明书

版本：v0.2  
状态：已评审，产品决策已确认  
基准：v0.1 架构草案 + 2026-10-17 评审确认

本文是实现依据。玩家可见行为与验收见 `docs/requirements.md`。

## 0. 已确认决策

| 项 | 决定 |
| --- | --- |
| 仓库 | pnpm monorepo 放在本仓库根目录。`2048.html`、`Sudoku.html` 退出产品目录，历史仍在 `main` |
| 对局 | 本地单机：1 名人类 vs 1 个规则 AI |
| 联机 | 只保留 `RemoteMatchRunner` 与服务端房间接口，一期不实现匹配与权威对局 |
| 索敌 | 工人，以及正在执行 MOVE / GATHER / BUILD / REPAIR 的单位不自动攻击。战斗单位在 IDLE / PATROL 时按射程索敌。ATTACK 锁定目标 |
| 卡牌 | 紧急修缮、火力覆盖、战地鼓舞。能量上限 10，每轮 +3，固定牌序 |
| 胜利 | 只实现摧毁对方主基地。其余胜利条件只保留类型 |
| 本阶段交付 | M6 已完成 Vue + Pixi 本地对局竖切 |

## 1. 评审修订

以下修订写入 v0.2，避免确定性、指令目标和占位规则在实现时分叉。

1. `tick()` 不接收可变 `deltaMs`。一次调用推进一个逻辑 tick，固定 50ms。Runner 用时间累加器决定本帧调用几次。
2. 权威 `GameState` 不保存墙钟，也不保存浮点插值坐标。操作阶段倒计时放在 Runner。自走阶段使用 `phaseTicksRemaining`。状态哈希只覆盖权威字段。
3. 格间移动进度使用整数 `moveProgressMs`。渲染插值只存在于客户端。
4. 命令目标使用 `{ kind: 'unit' | 'building', id }`。`PRODUCE` 作用于建筑，其余一期指令作用于单位。
5. 标识由 `GameState` 内单调计数器生成。禁止随机 UUID 进入权威状态。
6. 占位提交分两段：先全部离开旧格，再按单位 ID 升序进入新格。失败者本 tick 等待，下一 tick 重新寻路。
7. 回放记录已提交命令，包含 AI 命令。回放不重新执行 AI。
8. 一期无弹道、无技能系统。维修只针对建筑。人口计入单位，建筑不占人口。
9. 每个兵种有固有 `moveRange`。单位状态保存本回合 `moveRemaining`，成功走一格减 1；进入下一轮操作时恢复为 `moveRange`。超出剩余格数的 MOVE 仍可下达，走完预算后指令保留。

## 2. 目标与范围

### 2.1 验证目标

玩家在 15 秒操作阶段内，给单位或建筑下达或清除一条指令，也可以打出卡牌。操作阶段结束进入自走阶段。单位按固定 tick 执行移动、攻击、采集、建造、维修和生产。玩家观察结果后进入下一轮操作。

### 2.2 一期包含

- 可配置方格地图，默认 16×16。
- 单位：工人、基础战斗单位。建筑：主基地、生产建筑、防御建筑。
- 地形：可通行、阻挡、资源点。
- 指令：移动、攻击、巡逻、采集、建造、维修、生产、停止。每个单位或建筑同时只有一条指令。
- 操作阶段 15 秒。自走阶段最多 600 tick（30 秒），胜利时提前结束。
- 卡牌三类各一张：工程、攻击、支援。
- 规则 AI，通过同一命令接口行动。
- 确定性模拟与基于命令日志的回放。
- 前端 Vue + PixiJS。模拟核心为纯 TypeScript 包。Node.js + WebSocket 只预留。

### 2.3 一期不包含

指令队列、战争迷雾、天气、随机事件、英雄、装备、等级、复活、复杂匹配、观战、排行榜、行为树、效用 AI、弹道、单位碰撞推挤、框选、单位维修、技能系统。

架构为这些能力留扩展点，一期不实现。

## 3. 核心循环

### 3.1 阶段

```text
LOBBY → ROUND_START → OPERATION → AUTO → ROUND_END
                         ↑                    │
                         └────────────────────┘
                                              ↓
                                          GAME_OVER
```

`ROUND_START` 与 `ROUND_END` 是瞬时阶段，由 Runner 在同一调用栈内完成结算后进入下一阶段。

### 3.2 操作阶段

- 时长 15000ms，由 Runner 用墙钟计时。模拟 tick 不前进。
- 人类可以选中一个单位或建筑、下达一条指令、清除指令、打出卡牌、提前结束操作。
- 新指令覆盖旧指令。合法性在提交时校验，失败返回原因，状态不变。
- 卡牌在操作阶段立即结算。
- AI 在进入操作阶段时一次性提交命令，并视为已准备。人类按下结束，或 15 秒到达，即进入自走阶段。

### 3.3 自走阶段

- 只调用无参 `tick()`。默认上限 600 tick。
- 一次性指令完成、目标死亡、资源枯竭或资源不足导致失败时清空指令。
- `PATROL` 与未完成的 `GATHER` 保留。
- 结束条件：tick 上限，或主基地被摧毁。一期不实现「全体玩家提前结束自走」。
- 未完成指令保留到下一轮操作阶段。

### 3.4 阶段切换

- 操作结束：冻结命令集，`phaseTicksRemaining = autoTickLimit`，进入 `AUTO`。
- 自走结束且未分胜负：进入下一轮 `ROUND_START`，回合数 +1，恢复能量，补牌，再进入 `OPERATION`。
- 分出胜负：进入 `GAME_OVER`，停止模拟。

## 4. 总体架构

```text
Client (Vue + Pinia + PixiJS)
  Lobby / GameView / HUD / CommandPanel / CardBar
  MatchGateway / InputController / Renderer
        │  LocalMatchRunner（一期）
        │  RemoteMatchRunner（仅接口）
        ▼
Pure TS Simulation Core
  GameState / Commands / Systems / Pathfinding / Hash / Replay
        ▲
Rule AI（只读状态，只发命令）

预留：Client ← WebSocket → Node GameRoom → 同一 sim 包
```

### 4.1 分层职责

| 层 | 职责 | 禁止 |
| --- | --- | --- |
| `packages/sim` | 权威状态、校验、tick、事件、哈希、回放重放 | DOM、Node API、Vue、PixiJS、`Math.random()` |
| `packages/ai` | 操作阶段读状态并调用命令接口 | 直接改状态、绕过校验 |
| `packages/shared` | 协议、枚举、常量、配置 Schema | 业务模拟 |
| `packages/client` | 输入、视图状态、渲染、本地 Runner | 自行结算伤害、资源、胜负 |
| `packages/server` | 一期仅保留房间与消息类型骨架 | 一期不要求可玩联机 |
| `configs` | 地图、单位、建筑、卡牌、胜利规则 | 在 sim 内硬编码具体兵种数值 |

### 4.2 技术选型

- 前端：Vue 3、Pinia、PixiJS 8。Vue 管理 UI，PixiJS 管理战场。开发服务器用 `esbuild-wasm`（本机拦截 Vite/Rollup 原生程序）。
- 模拟与 AI：TypeScript strict，纯包。
- 工程：pnpm workspace。sim 测试用 TypeScript 编译后的 `node:test`。本机 Application Control 拦截 rollup/esbuild 原生程序，故 sim 不用 Vitest，client 开发服务器用 `esbuild-wasm`。
- 后端预留：Node.js 22、`ws`。服务端持有同一 sim 包。
- 配置：JSON，配 Zod 或等价 Schema 校验。

包名：`@battle/shared`、`@battle/sim`、`@battle/ai`、`@battle/client`、`@battle/server`。

## 5. 目录

```text
package.json
pnpm-workspace.yaml
docs/
  architecture.md
  requirements.md
packages/
  shared/src/                 协议、类型、常量、配置 Schema
  sim/src/
    index.ts                  对外出口
    engine/                   阶段机、状态、配置、实体查询、事件工厂
    commands/                 指令校验与写入
    world/                    格子、占位、寻路、资源支付
    systems/                  移动/战斗/采集/建造/维修/生产/卡牌/清理/胜利
    replay/                   哈希与命令日志回放
    tests/                    按模块分子目录
  ai/src/                     规则 AI，只走命令接口
  server/src/                 预留
  client/src/
    gateway/                  MatchGateway、LocalMatchRunner、RemoteMatchRunner
    store/                    Pinia 选中、悬停、预览、快照
    render/                   Pixi 色块战场
    views/                    大厅与对局
    components/               HUD、指令面板、卡牌条
configs/                      预留 JSON
```

`packages/sim/src` 模块：`engine/`（`simulator`、`state`、`config`、`entities`、`events`）、`commands/`、`world/`（`grid`、`occupancy`、`pathfinding`、`resources`）、`systems/`、`replay/`（`hash`、`replay`）。

M6 已实现 Vue + Pixi 本地对局竖切：大厅开局、操作/自走循环、选中下令、出牌、色块渲染。`server` 与 `configs/` JSON 留到后续里程碑。

## 6. 数据模型

标识类型均为字符串。生成规则：`u{unitSeq}`、`b{buildingSeq}`、`c{cardSeq}`、`e{eventSeq}`。计数器存在 `GameState`。

### 6.1 阶段与状态

```ts
type GamePhase =
  | 'LOBBY'
  | 'ROUND_START'
  | 'OPERATION'
  | 'AUTO'
  | 'ROUND_END'
  | 'GAME_OVER';

interface GameState {
  matchId: string;
  phase: GamePhase;
  round: number;
  tick: number;
  phaseTicksRemaining: number;
  rngSeed: number;
  unitSeq: number;
  buildingSeq: number;
  cardSeq: number;
  eventSeq: number;
  map: GameMap;
  players: Record<PlayerId, PlayerState>;
  units: Record<UnitId, Unit>;
  buildings: Record<BuildingId, Building>;
  occupancy: OccupancyGrid;
  effects: TimedEffect[];
  victoryRule: VictoryRule;
  winnerId?: PlayerId;
  winnerCondition?: string;
  config: MatchConfig;
}
```

`MatchConfig` 持有单位、建筑、卡牌定义的只读快照。哈希包含配置标识与种子，不把函数或原型纳入哈希。

### 6.2 玩家

```ts
interface PlayerState {
  id: PlayerId;
  name: string;
  teamId: number;
  resources: { wood: number; ore: number; gold: number };
  hand: CardInstance[];
  deck: CardInstance[];
  discard: CardInstance[];
  energy: number;
  maxEnergy: number;
  isAI: boolean;
  eliminated: boolean;
  population: number;
  populationCap: number;
  stats: { unitsLost: number; unitsKilled: number; resourcesGathered: number };
}
```

### 6.3 单位

```ts
type UnitState =
  | 'IDLE'
  | 'MOVING'
  | 'ATTACKING'
  | 'GATHERING'
  | 'RETURNING'
  | 'BUILDING'
  | 'REPAIRING'
  | 'PATROLLING'
  | 'DEAD';

interface Unit {
  id: UnitId;
  ownerId: PlayerId;
  typeId: string;
  pos: GridPos;
  hp: number;
  maxHp: number;
  state: UnitState;
  command: Command | null;
  path: GridPos[];
  moveProgressMs: number;
  moveRemaining: number;
  cooldownMs: number;
  carry?: { resource: ResourceType; amount: number };
  gatherProgressMs: number;
  buildProgressMs: number;
  repairProgressMs: number;
  patrolIndex: number;
  buffs: Buff[];
  attackTarget: EntityRef | null;
}
```

`DEAD` 单位在 tick 开头清除，并释放占位。

### 6.4 建筑

```ts
interface Building {
  id: BuildingId;
  ownerId: PlayerId;
  typeId: string;
  role: 'MAIN_BASE' | 'PRODUCTION' | 'DEFENSE' | 'WAREHOUSE';
  origin: GridPos;
  size: { w: number; h: number };
  hp: number;
  maxHp: number;
  state: 'CONSTRUCTING' | 'ACTIVE' | 'DESTROYED';
  buildProgressMs: number;
  command: Command | null;
  cooldownMs: number;
  builderId: UnitId | null;
  productionRemainingMs: number;
}
```

一期仓库角色只作采集卸货点预留。默认地图只有主基地承担卸货。`CONSTRUCTING` 已占用全部占地。`DESTROYED` 在 tick 开头移除并释放占位。

### 6.5 地图与占位

```ts
interface GameMap {
  width: number;
  height: number;
  terrain: TerrainType[][];
  resourceNodes: ResourceNode[];
  startPositions: PlayerStart[];
}

interface OccupancyGrid {
  cells: Array<Array<{
    terrainBlocked: boolean;
    buildingId?: BuildingId;
    unitId?: UnitId;
  }>>;
}
```

坐标系：原点在左上，x 向右，y 向下，单位为格。

地图配置里的每位玩家除起点和队伍外，还带开局建筑与单位。建筑用绝对坐标 `origin`，单位用绝对坐标 `pos`。运行时资源点在配置总量之外再记 `remaining`。

规则：

- 一格最多一个地面单位。
- 建筑按 `size` 占用连续矩形，全部格子可走性与占位必须同时合法。
- 建造开始时预留全部格子。失败或取消时回滚预留。
- 单位不能进入阻挡、建筑格、已被占用的单位格。
- 生产出口从建筑四邻中按北、东、南、西寻找第一格空闲可通行格。没有则本 tick 等待，生产计时暂停。

### 6.6 指令

```ts
type EntityRef =
  | { kind: 'unit'; id: UnitId }
  | { kind: 'building'; id: BuildingId };

type Command =
  | { type: 'MOVE'; to: GridPos }
  | { type: 'ATTACK'; target: EntityRef }
  | { type: 'PATROL'; points: GridPos[] }
  | { type: 'GATHER'; resourceNodeId: string }
  | { type: 'BUILD'; buildingTypeId: string; origin: GridPos }
  | { type: 'REPAIR'; target: { kind: 'building'; id: BuildingId } }
  | { type: 'PRODUCE'; unitTypeId: string }
  | { type: 'STOP' };
```

| 指令 | 作用对象 | 完成条件 |
| --- | --- | --- |
| MOVE | 单位 | 到达目标格后清空 |
| ATTACK | 单位 | 目标死亡或消失后清空 |
| PATROL | 单位 | 持续保留，至少 2 个点 |
| GATHER | 工人 | 资源点枯竭后清空 |
| BUILD | 工人 | 建筑转为 ACTIVE 或失败后清空 |
| REPAIR | 工人 | 目标满血、被毁或资源不足后清空 |
| PRODUCE | 建筑 | 单位生成，或资源/人口不满足时失败清空 |
| STOP | 单位或建筑 | 立即清空指令并回到空闲 |

`clearCommand` 与 `STOP` 的状态结果相同。

### 6.7 胜利条件

```ts
type VictoryCondition =
  | { type: 'DESTROY_MAIN_BASE'; enabled: boolean }
  | { type: 'CAPTURE_POINTS'; enabled: boolean; target: number }
  | { type: 'RESOURCE_SCORE'; enabled: boolean; target: number }
  | { type: 'SURVIVE_ROUNDS'; enabled: boolean; rounds: number };
```

默认只有 `DESTROY_MAIN_BASE` 启用，`mode: 'ANY'`。同一 tick 双方主基地都摧毁时，`winnerId` 为空，`winnerCondition = 'MUTUAL_DESTRUCTION'`。后三种条件一期不计算。

## 7. 模拟核心

### 7.1 接口

```ts
interface Simulator {
  getState(): Readonly<GameState>;
  startMatch(): void;
  startOperationPhase(): void;
  submitCommand(playerId: PlayerId, target: EntityRef, command: Command): CommandResult;
  clearCommand(playerId: PlayerId, target: EntityRef): CommandResult;
  playCard(playerId: PlayerId, instanceId: string, target?: CardTarget): CommandResult;
  endOperationPhase(): void;
  tick(): TickResult;
  getSnapshot(): GameSnapshot;
  getStateHash(): string;
}
```

`submitCommand` / `clearCommand` / `playCard` 只在 `OPERATION` 生效。`tick` 只在 `AUTO` 且 `phaseTicksRemaining > 0` 时改变模拟。自走打满后调用 `startOperationPhase()` 进入下一轮。

### 7.2 Tick 顺序

1. `tick += 1`，`phaseTicksRemaining -= 1`。
2. 移除 `DEAD` 单位与 `DESTROYED` 建筑，释放占位。
3. 按单位 ID 升序执行单位意图：校验指令、寻路、累计移动/采集/建造/维修进度、生成攻击意图。本步不提交新占位，不结算伤害。
4. 按建筑 ID 升序执行生产进度、建造完成检查、防御建筑攻击意图。
5. 提交移动：先按确定性规则决定谁能走（对向换位可同时成功，同一格竞争时 ID 较小者进入）。成功者先离开旧格，再按 ID 升序进入新格。失败者本 tick 不离开，进度保留，下一 tick 重新寻路。
6. 按攻击者 ID 升序结算伤害意图。
7. 递减 Buff / Effect 的剩余 tick。操作阶段不调用 `tick`，因此 Buff 不计时。
8. 标记死亡、建筑摧毁、资源点枯竭。
9. 检查主基地胜利。
10. 写出 `DomainEvent`，更新哈希。

### 7.3 确定性

- 禁止 `Math.random()` 与墙钟进入权威状态。
- 遍历顺序固定为 ID 升序。
- A* 邻居顺序：北、东、南、西。tie-break：f 更小，其次 h 更小，其次路径字典序更小。
- 哈希输入为规范 JSON：对象键排序，不包含事件展示文案与渲染字段。
- 相同配置、种子和命令日志必须得到相同哈希序列。

### 7.4 事件

```ts
type DomainEvent =
  | { type: 'UNIT_MOVED'; unitId: string; from: GridPos; to: GridPos }
  | { type: 'ATTACK_STARTED'; attackerId: string; targetId: string }
  | { type: 'DAMAGE_APPLIED'; targetId: string; amount: number; sourceId?: string }
  | { type: 'UNIT_DIED'; unitId: string }
  | { type: 'RESOURCE_GATHERED'; playerId: string; resource: ResourceType; amount: number }
  | { type: 'BUILDING_PLACED'; buildingId: string }
  | { type: 'PRODUCTION_COMPLETED'; buildingId: string; unitId: string }
  | { type: 'CARD_PLAYED'; playerId: string; cardId: string }
  | { type: 'VICTORY'; winnerId: string; condition: string };
```

事件序号使用 `eventSeq`。客户端只用事件做表现。

### 7.5 回放

记录配置 ID、`rngSeed`、初始计数器、每次 `submitCommand`、`clearCommand`、`playCard`、`endOperationPhase`，以及每次阶段切换时的 tick。可选记录每 tick 哈希。

重放时创建同一 sim，按日志调用同一接口。AI 命令已经在日志中，重放过程不调用 AI。

## 8. 行为

### 8.1 移动

单位沿 A* 路径逐格移动。每个 tick 增加与移速对应的 `moveProgressMs`，达到 `moveMsPerCell` 才尝试进入下一格。被阻挡则等待或重寻路。一期不推挤。

每回合可走格数由兵种 `moveRange` 决定，实例字段 `moveRemaining` 记录剩余。`moveRemaining` 为 0 时不再累计进度、不再提交移动意图。成功进入一格后减 1。采集、建造、维修、攻击追击和巡逻同样消耗预算。`beginRound` 把存活单位的剩余格数恢复为兵种上限。新生产单位带满当前回合预算。

### 8.2 攻击与索敌

伤害：`max(1, attack + buffAttack - armor)`，整数。

攻击意图：

1. 指令为 `ATTACK` 且目标存活：锁定该目标。超出射程则向目标相邻可站立格移动。
2. 战斗单位处于 `IDLE` 或 `PATROLLING`，且本 tick 没有排他工作指令：在攻击距离内选择目标。
3. 工人，以及 `MOVE`、`GATHER`、`BUILD`、`REPAIR` 执行中的单位：不索敌。
4. 距离使用切比雪夫距离。优先级：正在攻击自己的敌人，其次距离更近，其次生命更低，其次目标 ID 更小。一期单位优先于建筑，防御建筑只打单位。
5. 进入射程后停止移动，按 `attackIntervalMs` 冷却。

### 8.3 采集

`GATHER` 内部顺序：移动到资源点相邻格 → 累计采集 → 装满携带量 → 返回最近卸货建筑的相邻格 → 卸载到玩家资源 → 资源点仍有剩余则重复。

卸货建筑为一期 `role = MAIN_BASE` 且属于己方、状态为 `ACTIVE` 的建筑。距离用曼哈顿距离，平局取建筑 ID 较小者。路径不通则等待并重寻路。

### 8.4 建造、维修、生产

- 建造：工人到达目标矩形相邻格，校验地形、占位、资源与人口无关项。通过后扣资源并预留占地，进度完成时建筑变为 `ACTIVE`。
- 维修：工人到达目标建筑相邻格，按配置消耗资源并恢复生命。只允许己方未摧毁建筑。
- 生产：建筑接受 `PRODUCE` 时校验资源与人口。通过后扣资源并计时。完成时在出口格生成单位。无出口则暂停计时。

### 8.5 巡逻

在 `points` 间循环。遇射程内敌人时插入攻击，目标死亡或离开射程后继续当前路点。自走结束不清除该指令。

## 9. 卡牌

```ts
type CardCategory = 'ENGINEERING' | 'ATTACK' | 'SUPPORT';
type CardTarget =
  | { type: 'NONE' }
  | { type: 'UNIT'; id: UnitId }
  | { type: 'BUILDING'; id: BuildingId }
  | { type: 'CELL'; pos: GridPos };
```

结算发生在操作阶段。目标非法、能量不足或实例不在手牌时拒绝。

| 卡牌 | 类别 | 费用 | 目标 | 效果 |
| --- | --- | --- | --- | --- |
| 紧急修缮 | ENGINEERING | 3 | 己方未摧毁建筑 | 立即回复 40 点生命，不超过上限 |
| 火力覆盖 | ATTACK | 4 | 地图格 | 切比雪夫距离 ≤ 1 的敌方单位受到 15 点伤害，不影响友军与建筑 |
| 战地鼓舞 | SUPPORT | 2 | 己方战斗单位 | 攻击 +3，持续 200 个自走 tick |

能量：`maxEnergy = 10`，开局 10。每个 `ROUND_START` `+3`，不超过上限。手牌上限 5。每位玩家牌组按固定列表复制：三种卡各 4 张，共 12 张，顺序固定。开局抽 5 张。打出进入弃牌。每轮开始把手牌补到 5 张或牌组耗尽。牌组空且弃牌非空时，弃牌按实例 ID 升序洗回，洗牌不使用随机数，只按 ID 排序。

Buff 只在自走 tick 递减。

## 10. 网络预留

一期运行 `LocalMatchRunner`：浏览器内加载 sim 与 AI。

`MatchGateway` 对 UI 暴露同一组方法：`submitCommand`、`clearCommand`、`playCard`、`endOperation`、订阅快照与事件。`RemoteMatchRunner` 实现同一接口，内部发送 WebSocket 消息，一期可以编译通过但不作为验收对局。

客户端消息与服务端消息保持 v0.1 的类型划分：`JOIN`、`READY`、`SUBMIT_COMMAND`、`CLEAR_COMMAND`、`PLAY_CARD`、`END_OPERATION`，以及 `MATCH_START`、`PHASE_CHANGED`、`COMMAND_ACK`、`SNAPSHOT`、`EVENTS`、`GAME_OVER`。

后续联机约定：操作阶段低频广播，自走阶段模拟 20Hz、全量快照 10Hz，渲染 60FPS 插值。客户端不预测权威结果。断线重连发完整快照与阶段剩余时间。这些约定现在写在协议类型中，一期不验收。

## 11. 前端

- `LobbyView`：开始本地对局、选择地图与 AI 难度。
- `GameView`：战场与 HUD。
- 单击选择一个单位或建筑。一期不做框选。
- 右键地面为移动，右键敌人或敌建筑为攻击，右键资源点为采集。建造、巡逻、维修、生产、停止放在命令面板。
- 选中单位或建筑时，命令面板上方展示资料卡：名称、简介、生命、攻击、护甲、射程、本回合剩余移动。
- 操作阶段显示本回合可达格、路径预览、射程和建造占地。路径超出剩余移动的格子用无效色。预览不写入 sim。
- 自走阶段不接受指令，可以查看状态。
- 一期表现使用色块、血条和文字，不依赖外部美术。

Pinia 保存快照、选中对象、悬停格、指令预览和卡牌目标模式。权威字段以 Gateway 推送为准。

渲染层：`TerrainLayer`、`OccupancyLayer`、`BuildingLayer`、`UnitLayer`、`EffectLayer`、`OverlayLayer`。

## 12. AI

规则 AI 在操作阶段开始时读取 `GameState`，通过命令接口行动。难度参数：指令条数上限、资源保留量、攻击性。一期默认难度使用全部可用工人与战斗单位。

优先级：

1. 工人：主基地受损且付得起维修则维修；有资源点且资源低于保留阈值则采集；资源足够则建造配置中的下一座建筑。
2. 生产建筑：人口未满且资源足够则生产。主基地补工人，兵营补战斗单位。
3. 战斗单位：攻击距离附近有敌人则 `ATTACK`；否则 `PATROL` 配置中的防守点。
4. 卡牌：己方主基地生命低于 50% 且能量足够则紧急修缮；存在成群敌人则火力覆盖；否则对一名战斗单位战地鼓舞。

AI 不修改状态。其命令写入回放日志。

## 13. 配置

模拟只读配置。默认数值放在 `docs/requirements.md` 第 6 节，实现时落入 `configs/`。地图、单位、建筑、卡牌、胜利规则都用 ID 引用。

## 14. 测试

- sim 单测：阶段机、移动、占位、哈希、攻击、采集、建造、维修、生产；后续补卡牌、主基地胜利、回放。
- 确定性：相同初始状态与命令日志，逐 tick 哈希一致。
- 回放：记录后重放，哈希序列一致。
- 协议：`packages/shared` 的消息类型被 client 与 server 共同引用。
- 玩法验收以 `docs/requirements.md` 第 8 节为准。

## 15. 里程碑

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | 架构、需求、Cursor rules | 完成 |
| M1 | pnpm workspace、共享类型、空 sim 包 | 完成 |
| M2 | 阶段机、移动、占位、哈希测试 | 完成 |
| M3 | 攻击、采集 | 完成 |
| M4 | 建造、维修、生产 | 完成 |
| M5 | 三张卡、主基地胜利、规则 AI、回放 | 完成 |
| M6 | Vue + Pixi 本地对局竖切 | 完成 |
| M7 | 服务端消息骨架，不作为可玩验收 | 未开始 |

## 16. 扩展点

后续若做这些能力，保持 sim 纯净与命令日志回放：

- 指令队列：`command` 扩展为 `commands: Command[]`，状态机只读队首。
- 英雄、天气、迷雾、随机事件、观战与排行榜按独立系统增加。随机事件必须使用可重放的种子序列，不能引入 `Math.random()`。
- 联机时由 GameRoom 持有 sim，客户端继续只提交意图。

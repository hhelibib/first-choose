/**
 * UI 只通过 Gateway 访问对局。生命、资源、占位、胜负以 runner 推送的快照为准。
 */
import type { CardTarget, Command, EntityRef, GameSnapshot, MatchConfig, PlayerId } from '@battle/shared'
import type { CommandResult } from '@battle/sim'
import { LocalMatchRunner } from './local-match-runner.js'
import { RemoteMatchRunner } from './remote-match-runner.js'
import type { MatchListener, MatchRunner, StartMatchOptions } from './types.js'

export class MatchGateway {
  constructor(private runner: MatchRunner) {}

  startMatch(options?: StartMatchOptions): void {
    this.runner.startMatch(options)
  }

  submitCommand(playerId: PlayerId, target: EntityRef, command: Command): CommandResult {
    return this.runner.submitCommand(playerId, target, command)
  }

  clearCommand(playerId: PlayerId, target: EntityRef): CommandResult {
    return this.runner.clearCommand(playerId, target)
  }

  playCard(playerId: PlayerId, instanceId: string, target?: CardTarget): CommandResult {
    return this.runner.playCard(playerId, instanceId, target)
  }

  endOperation(): void {
    this.runner.endOperation()
  }

  subscribe(listener: MatchListener): () => void {
    return this.runner.subscribe(listener)
  }

  getSnapshot(): GameSnapshot | null {
    return this.runner.getSnapshot()
  }

  getConfig(): MatchConfig | null {
    return this.runner.getConfig()
  }

  dispose(): void {
    this.runner.dispose()
  }
}

export function createLocalGateway(): MatchGateway {
  return new MatchGateway(new LocalMatchRunner())
}

export function createRemoteGateway(): MatchGateway {
  return new MatchGateway(new RemoteMatchRunner())
}

export { RemoteMatchRunner }

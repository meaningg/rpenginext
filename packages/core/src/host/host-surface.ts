import {
  err,
  failure,
  ok,
  type Failure,
  type JsonObject,
  type Result,
  type TurnContext,
  type WorldState,
} from "@rpengineext/contracts";

import type { ContributionIndex } from "../registry/contribution-index.ts";

export interface HostHelpTopic {
  readonly id: string;
  readonly body: string;
  readonly moduleId: string;
}

export interface HostCliCommand {
  readonly name: string;
  readonly description: string;
  readonly moduleId: string;
  handler(
    args: string[],
    ctx: TurnContext,
  ): Promise<Result<string, Failure>> | Result<string, Failure>;
}

/**
 * Aggregates host-facing module contributions (CLI/help/debug/save meta).
 */
export class HostSurface {
  /**
   * @param index - contribution index after boot
   */
  constructor(private readonly index: ContributionIndex) {}

  /**
   * Collects help topics from modules.
   *
   * @param ctx - turn/session context
   * @param topic - optional topic filter
   */
  async getHelp(
    ctx: TurnContext,
    topic?: string,
  ): Promise<Result<HostHelpTopic[], Failure>> {
    const topics: HostHelpTopic[] = [];
    for (const owned of this.index.helpProviders) {
      const result = await owned.value.provide({ topic }, ctx);
      if (!result.ok) return result;
      for (const item of result.value.topics) {
        if (topic && item.id !== topic && !item.id.includes(topic)) continue;
        topics.push({ ...item, moduleId: owned.moduleId });
      }
    }
    return ok(topics);
  }

  /**
   * Collects redacted debug dumps.
   *
   * @param state - world state
   * @param ctx - context
   */
  async getDebugDump(
    state: WorldState,
    ctx: TurnContext,
  ): Promise<Result<Record<string, JsonObject>, Failure>> {
    const out: Record<string, JsonObject> = {};
    for (const owned of this.index.debugDumpers) {
      const result = await owned.value.dump({ state }, ctx);
      if (!result.ok) return result;
      out[`${owned.moduleId}:${result.value.namespace}`] = result.value.data;
    }
    return ok(out);
  }

  /**
   * Lists CLI meta-commands from modules.
   *
   * @param ctx - context
   */
  async getCliCommands(
    ctx: TurnContext,
  ): Promise<Result<HostCliCommand[], Failure>> {
    const commands: HostCliCommand[] = [];
    for (const owned of this.index.cliCommandProviders) {
      const result = await owned.value.commands({}, ctx);
      if (!result.ok) return result;
      for (const command of result.value.commands) {
        commands.push({
          name: command.name,
          description: command.description,
          moduleId: owned.moduleId,
          handler: command.handler,
        });
      }
    }
    commands.sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.moduleId.localeCompare(b.moduleId),
    );
    return ok(commands);
  }

  /**
   * Aggregates save-list metadata fields.
   *
   * @param state - world state
   * @param ctx - context
   */
  async getSaveMetadata(
    state: WorldState,
    ctx: TurnContext,
  ): Promise<Result<Record<string, string | number | boolean>, Failure>> {
    const fields: Record<string, string | number | boolean> = {};
    for (const owned of this.index.saveMetadataProviders) {
      const result = await owned.value.provide({ state }, ctx);
      if (!result.ok) return result;
      for (const [key, value] of Object.entries(result.value.fields)) {
        fields[`${owned.moduleId}.${key}`] = value;
      }
    }
    return ok(fields);
  }

  /**
   * Resolves a read-model by id.
   *
   * @param id - read model id
   * @param state - world state
   * @param args - selector args
   */
  getReadModel(
    id: string,
    state: WorldState,
    args: JsonObject = {},
  ): Result<unknown, Failure> {
    const owned = this.index.readModels.get(id);
    if (!owned) {
      return err(failure("INTERNAL", `unknown read model: ${id}`));
    }
    try {
      return ok(owned.value.get(state, args));
    } catch (error) {
      return err(
        failure("MODULE_ERROR", `read model ${id} threw`, {
          details: String(error),
          causedBy: [owned.moduleId],
        }),
      );
    }
  }

  /**
   * Looks up a template string by id.
   *
   * @param id - template id
   */
  getTemplate(id: string): string | undefined {
    return this.index.templates.get(id)?.value.text;
  }
}

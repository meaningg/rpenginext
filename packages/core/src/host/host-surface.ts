import {
  err,
  failure,
  moduleFailure,
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
   * Resolves a read-model by id (fail-loud contract, specs/06 §6).
   *
   * @param id - read model id
   * @param state - world state
   * @param args - selector args (validated against provider argsSchema when present)
   * @param callerModuleId - calling module id (for failure details)
   */
  getReadModel(
    id: string,
    state: WorldState,
    args: JsonObject = {},
    callerModuleId?: string,
  ): Result<unknown, Failure> {
    const owned = this.index.readModels.get(id);
    if (!owned) {
      return err(
        moduleFailure(
          "MODULE_READ_MODEL_UNKNOWN",
          `unknown readModel "${id}"${callerModuleId ? ` (module: ${callerModuleId})` : ""}. Hint: check the provider public contract / readModels catalog.`,
          {
            ...(callerModuleId ? { moduleId: callerModuleId } : {}),
            name: id,
          },
        ),
      );
    }
    if (owned.value.argsSchema) {
      const parsed = owned.value.argsSchema.safeParse(args);
      if (!parsed.success) {
        return err(
          moduleFailure(
            "MODULE_READ_MODEL_ARGS_INVALID",
            `readModel "${id}" args failed provider schema${callerModuleId ? ` (module: ${callerModuleId})` : ""}. Hint: pass args per the provider public contract.`,
            {
              ...(callerModuleId ? { moduleId: callerModuleId } : {}),
              name: id,
              path: parsed.error.issues?.[0]?.path ?? [],
            },
          ),
        );
      }
      args = parsed.data;
    }
    try {
      return ok(owned.value.get(state, args));
    } catch (error) {
      return err(
        moduleFailure(
          "MODULE_ERROR",
          `readModel "${id}" threw (module: ${owned.moduleId}). Hint: fix the provider get() implementation.`,
          {
            moduleId: callerModuleId,
            name: id,
            providerModuleId: owned.moduleId,
          },
        ),
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

  /**
   * Lists registered memory kind ids (catalog vocabulary for modules/host).
   */
  listMemoryKinds(): readonly string[] {
    return [...this.index.memoryKinds.keys()].sort();
  }

  /**
   * Validates a memory payload against a registered kind schema when present.
   * Kinds without schema always pass (catalog-only entry).
   *
   * @param kind - memory kind id
   * @param data - candidate payload
   */
  validateMemory(
    kind: string,
    data: JsonObject,
  ): Result<void, Failure> {
    const owned = this.index.memoryKinds.get(kind);
    if (!owned) {
      return err(failure("INTERNAL", `unknown memory kind: ${kind}`));
    }
    const schema = owned.value.schema;
    if (!schema) return ok(undefined);
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      return err(
        failure("SCHEMA_INVALID", `memory kind ${kind} payload invalid`, {
          details: parsed.error.flatten(),
          causedBy: [owned.moduleId],
        }),
      );
    }
    return ok(undefined);
  }

  /**
   * Lists registered module config schema keys.
   */
  listConfigSchemaKeys(): readonly string[] {
    return [...this.index.configSchemas.keys()].sort();
  }
}

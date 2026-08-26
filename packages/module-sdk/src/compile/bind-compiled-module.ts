import {
  err,
  failure,
  isModuleCtxViolation,
  ModuleCtxViolation,
  ok,
  setModuleSystemSchedules,
  takeModuleOpProposals,
  takeModuleSystemSchedules,
  type AgentTask,
  type CommandDefinition,
  type CompiledModuleIR,
  type Failure,
  type JsonObject,
  type JsonValue,
  type ModuleRegisterContext,
  type NarrativePromptSection,
  type Result,
  type SliceDefinition,
  type StateCommand,
  type TurnContext,
  type TurnLogger,
  type WorldState,
} from "@rpengineext/contracts";
import { z } from "zod";

import { isModuleDenial } from "../deny.ts";
import type { NarrativeSectionInput } from "../types/capabilities.ts";
import { createTaskId } from "../util/ids.ts";
import { asJsonSchema } from "../util/zod-json.ts";
import type { ModuleBindings } from "./bindings.ts";
import {
  createModuleCtx,
  proposalsToCommands,
} from "./create-ctx.ts";

function parseSliceValue<T>(
  schema: { safeParse(v: unknown): { success: boolean; data?: unknown } },
  raw: unknown,
  initial: T,
): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data as T;
  return initial;
}

function readConfigSection(
  moduleConfig: JsonObject | undefined,
  key: string,
  defaults: JsonObject,
): JsonObject {
  const section = moduleConfig?.[key];
  if (section && typeof section === "object" && !Array.isArray(section)) {
    return { ...defaults, ...(section as JsonObject) };
  }
  return { ...defaults };
}

function normalizeSections(
  raw:
    | NarrativeSectionInput
    | NarrativeSectionInput[]
    | string
    | null
    | undefined,
  fallbackId: string,
  channel: "system" | "user",
): NarrativePromptSection[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    return [{ id: fallbackId, channel, text }];
  }
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item, index) => {
      const text = item.text?.trim() ?? "";
      if (!text) return null;
      return {
        id: item.id ?? `${fallbackId}.${index}`,
        channel: item.channel ?? channel,
        text,
        ...(item.title ? { title: item.title } : {}),
        ...(item.priority !== undefined ? { priority: item.priority } : {}),
      } satisfies NarrativePromptSection;
    })
    .filter((x): x is NarrativePromptSection => x !== null);
}

const noopLog: TurnLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLog;
  },
};

/**
 * Converts author ctx violations (forbidden moment misuse) into structured
 * failures preserving the stable module code. Returns undefined for other errors.
 */
function violationToFailure(e: unknown): Failure | undefined {
  if (!isModuleCtxViolation(e)) return undefined;
  return failure(e.code, e.message, {
    ...(e.details ? { details: e.details } : {}),
  });
}

/**
 * Structural bind: only catalogs/moments declared in IR are installed.
 * Bindings supply handlers; mismatch → throw (boot fail).
 *
 * @param ctx - contribution bus
 * @param ir - compiled IR
 * @param bindings - runtime handlers
 */
export function bindCompiledModule(
  ctx: ModuleRegisterContext,
  ir: CompiledModuleIR,
  bindings: ModuleBindings,
): void {
  const moduleId = ir.manifest.id;
  const sliceName = ir.slice?.name ?? moduleId.replace(/-/g, "_");
  const knownOps = bindings.knownOps;
  const m = ir.moments;

  // --- structural IR ↔ bindings ---
  if (ir.slice) {
    if (!bindings.state) {
      throw new Error(`${moduleId}: IR has slice but bindings.state missing`);
    }
    for (const op of ir.slice.ops) {
      if (!bindings.state.ops.has(op.name)) {
        throw new Error(`${moduleId}: IR op "${op.name}" missing binding`);
      }
    }
    for (const name of bindings.state.ops.keys()) {
      if (!ir.slice.ops.some((o) => o.name === name)) {
        throw new Error(`${moduleId}: binding op "${name}" not in IR`);
      }
    }
  } else if (bindings.state) {
    throw new Error(`${moduleId}: bindings.state without IR.slice`);
  }

  const has = {
    seed: bindings.seeds.length > 0,
    guard: bindings.rules.some((r) => Boolean(r.guard)),
    soft: bindings.rules.some((r) => Boolean(r.soft)),
    invariant: bindings.rules.some((r) => Boolean(r.invariant)),
    change: bindings.turns.some((t) => Boolean(t.change)),
    afterProse: bindings.turns.some((t) => Boolean(t.afterProse)),
    committed: bindings.turns.some((t) => Boolean(t.committed)),
    rejected: bindings.turns.some((t) => Boolean(t.rejected)),
    load: bindings.turns.some((t) => Boolean(t.load)),
    narrativeSystem: bindings.narratives.some((n) => Boolean(n.system)),
    narrativeUser: bindings.narratives.some((n) => Boolean(n.user)),
    narrativeBrief: bindings.narratives.some((n) => Boolean(n.brief)),
    narrativeHistory: bindings.narratives.some((n) => Boolean(n.history)),
    narrativeStyle: bindings.narratives.some((n) => Boolean(n.style)),
    hostStatus: bindings.host.some((h) => Boolean(h.status)),
    hostHelp: bindings.host.some((h) => Boolean(h.help?.length)),
  };

  const requireMoment = (flag: keyof typeof has, label: string) => {
    if (m[flag] && !has[flag]) {
      throw new Error(`${moduleId}: IR.moments.${label} without binding`);
    }
    if (!m[flag] && has[flag]) {
      throw new Error(`${moduleId}: binding ${label} but IR.moments.${label}=false`);
    }
  };

  requireMoment("seed", "seed");
  requireMoment("guard", "guard");
  requireMoment("soft", "soft");
  requireMoment("invariant", "invariant");
  requireMoment("change", "change");
  requireMoment("afterProse", "afterProse");
  requireMoment("committed", "committed");
  requireMoment("rejected", "rejected");
  requireMoment("load", "load");
  requireMoment("narrativeSystem", "narrativeSystem");
  requireMoment("narrativeUser", "narrativeUser");
  requireMoment("narrativeBrief", "narrativeBrief");
  requireMoment("narrativeHistory", "narrativeHistory");
  requireMoment("narrativeStyle", "narrativeStyle");
  requireMoment("hostStatus", "hostStatus");
  requireMoment("hostHelp", "hostHelp");

  for (const rmId of m.hostReadModels) {
    const found = bindings.host.some((h) => Boolean(h.readModels?.[rmId]));
    if (!found) {
      throw new Error(`${moduleId}: IR readModel ${rmId} missing binding`);
    }
  }
  for (const host of bindings.host) {
    for (const rmId of Object.keys(host.readModels ?? {})) {
      if (!m.hostReadModels.includes(rmId)) {
        throw new Error(
          `${moduleId}: binding readModel ${rmId} not listed in IR.hostReadModels`,
        );
      }
    }
  }

  for (const task of ir.aiTasks) {
    if (!bindings.aiTasks.has(task.localKey)) {
      throw new Error(`${moduleId}: IR ai task ${task.localKey} missing binding`);
    }
  }
  for (const key of bindings.aiTasks.keys()) {
    if (!ir.aiTasks.some((t) => t.localKey === key)) {
      throw new Error(`${moduleId}: binding ai task ${key} not in IR`);
    }
  }
  for (const tool of ir.aiTools) {
    if (!bindings.aiTools.has(tool.localKey)) {
      throw new Error(`${moduleId}: IR ai tool ${tool.localKey} missing binding`);
    }
  }
  for (const key of bindings.aiTools.keys()) {
    if (!ir.aiTools.some((t) => t.localKey === key)) {
      throw new Error(`${moduleId}: binding ai tool ${key} not in IR`);
    }
  }

  if (Boolean(bindings.config) !== Boolean(ir.configKey)) {
    throw new Error(`${moduleId}: config binding/IR.configKey mismatch`);
  }

  /**
   * Live host moduleConfig from register context, merged over factory defaults.
   * Captured at install time (boot) — foundation config path.
   */
  const bootModuleConfig = ctx.moduleConfig;
  const getConfig = (): JsonObject => {
    if (!bindings.config) return {};
    return readConfigSection(
      bootModuleConfig ?? bindings.config.hostModuleConfig,
      bindings.config.key,
      bindings.config.defaults,
    );
  };

  const resolveSlice = (world: WorldState | undefined) => {
    if (!bindings.state) return undefined;
    return parseSliceValue(
      bindings.state.schema,
      world?.slices[sliceName],
      bindings.state.initial,
    );
  };

  const baseCtx = (opts: {
    turnCtx?: Parameters<typeof createModuleCtx>[0]["turnCtx"];
    world?: WorldState;
    action?: Parameters<typeof createModuleCtx>[0]["action"];
    normalizedAction?: Parameters<typeof createModuleCtx>[0]["normalizedAction"];
    intent?: Parameters<typeof createModuleCtx>[0]["intent"];
    passage?: Parameters<typeof createModuleCtx>[0]["passage"];
    turnKind?: Parameters<typeof createModuleCtx>[0]["turnKind"];
    locale?: string;
    meta?: JsonObject;
    opMode: "collect" | "propose";
    log?: typeof ctx.log;
    momentName?: string;
    writeAllowed?: boolean;
    emitAllowed?: boolean;
    scheduleAllowed?: boolean;
  }) =>
    createModuleCtx({
      moduleId,
      sliceName,
      slice: resolveSlice(opts.world ?? opts.turnCtx?.stateView),
      config: getConfig(),
      meta: opts.meta,
      log: opts.log ?? opts.turnCtx?.log ?? ctx.log,
      turnCtx: opts.turnCtx,
      action: opts.action,
      normalizedAction: opts.normalizedAction,
      intent: opts.intent,
      passage: opts.passage,
      turnKind: opts.turnKind,
      locale: opts.locale,
      world: opts.world ?? opts.turnCtx?.stateView,
      allowedReadSlices: bindings.allowedReadSlices,
      knownOps,
      opMode: opts.opMode,
      momentName: opts.momentName,
      writeAllowed: opts.writeAllowed,
      emitAllowed: opts.emitAllowed,
      scheduleAllowed: opts.scheduleAllowed,
      knownEmitNames: bindings.events.emit.length > 0 ? new Set(bindings.events.emit.map((e) => e.name)) : undefined,
      emitSchemas: new Map(
        bindings.events.emit
          .filter((e) => e.schema)
          .map((e) => [e.name, e.schema!]),
      ),
    });

  // --- Layer A catalogs (from IR) ---
  if (ir.slice && bindings.state) {
    const sliceDef: SliceDefinition = {
      name: ir.slice.name,
      schemaVersion: ir.slice.schemaVersion,
      schema: asJsonSchema(bindings.state.schema),
      initialValue: bindings.state.initial as JsonObject,
    };
    ctx.registerSlice(sliceDef);

    // Prefer object payload; empty {} is valid for no-arg ops.
    const defaultPayloadSchema = asJsonSchema(z.object({}).passthrough());

    for (const opIr of ir.slice.ops) {
      const op = bindings.state.ops.get(opIr.name)!;
      const commandDef: CommandDefinition = {
        type: opIr.commandType,
        slice: ir.slice.name,
        payloadSchema: op.payloadSchema
          ? asJsonSchema(op.payloadSchema as never)
          : defaultPayloadSchema,
        apply(state, cmd): Result<WorldState, Failure> {
          try {
            let payload: unknown = cmd.payload ?? {};
            if (op.payloadSchema) {
              const parsed = op.payloadSchema.safeParse(payload);
              if (!parsed.success) {
                return err(
                  failure(
                    "SCHEMA_INVALID",
                    `invalid payload for ${opIr.commandType}`,
                    { details: parsed.error },
                  ),
                );
              }
              payload = parsed.data;
            }
            const current = parseSliceValue(
              bindings.state!.schema,
              state.slices[ir.slice!.name],
              bindings.state!.initial,
            );
            const next = op.apply(current, payload);
            const checked = bindings.state!.schema.safeParse(next);
            if (!checked.success) {
              return err(
                failure("SCHEMA_INVALID", `op ${opIr.name} produced invalid slice`, {
                  details: checked.error,
                }),
              );
            }
            return ok({
              ...state,
              slices: {
                ...state.slices,
                [ir.slice!.name]: checked.data as never,
              },
            });
          } catch (e) {
            if (isModuleDenial(e)) return err(failure(e.code, e.message));
            throw e;
          }
        },
      };
      ctx.registerCommand(commandDef);
    }

    if (ir.slice.hasMigrations && bindings.state.migrations) {
      for (const [fromRaw, migrate] of Object.entries(bindings.state.migrations)) {
        ctx.registerMigration({
          slice: ir.slice.name,
          fromVersion: Number(fromRaw),
          toVersion: ir.slice.schemaVersion,
          migrate(oldValue) {
            try {
              return ok(migrate(oldValue) as JsonObject);
            } catch (e) {
              if (isModuleDenial(e)) return err(failure(e.code, e.message));
              throw e;
            }
          },
        });
      }
    }
  }

  if (ir.configKey && bindings.config) {
    ctx.registerConfigSchema({
      key: ir.configKey,
      schema: asJsonSchema(bindings.config.schema),
    });
  }

  for (const capId of ir.manifest.provides) {
    if (capId.startsWith("capability:")) {
      ctx.registerCapability(capId);
    }
  }

  // --- moments (table-driven) ---
  if (m.seed) {
    ctx.addSessionBootstrap({
      async bootstrap({ isNewGame, meta }, turnCtx) {
        if (!isNewGame) return ok({ commands: [] });
        const commands: StateCommand[] = [];
        for (const seed of bindings.seeds) {
          const raw = meta[seed.fromMeta];
          if (raw === undefined || raw === null) continue;
          let value: unknown = raw;
          if (seed.parse) {
            const parsed = seed.parse.safeParse(raw);
            if (!parsed.success) continue;
            value = parsed.data;
          } else if (typeof raw === "string" && raw.trim() === "") {
            continue;
          }
          const { ctx: mctx, session } = baseCtx({
            turnCtx,
            meta,
            opMode: "collect",
            momentName: "seed.apply",
          });
          try {
            await seed.apply(value, mctx);
          } catch (e) {
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
          commands.push(...session.commands);
        }
        return ok({ commands });
      },
    });
  }

  if (m.guard) {
    for (const rules of bindings.rules) {
      if (!rules.guard) continue;
      ctx.addGuard({
        async check({ action, intent }, turnCtx) {
          try {
            const { ctx: mctx } = baseCtx({
              turnCtx,
              action: action as never,
              normalizedAction: action,
              intent,
              world: turnCtx.stateView,
              opMode: "collect",
              momentName: "rules.guard",
              writeAllowed: false,
            });
            await rules.guard!(mctx);
            return ok({ allow: true });
          } catch (e) {
            if (isModuleDenial(e)) {
              return ok({ allow: false, code: e.code, message: e.message });
            }
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        },
      });
    }
  }

  if (m.soft) {
    for (const rules of bindings.rules) {
      if (!rules.soft) continue;
      ctx.addSoftGuard({
        async check({ action, intent }, turnCtx) {
          const { ctx: mctx } = baseCtx({
            turnCtx,
            normalizedAction: action,
            intent,
            world: turnCtx.stateView,
            opMode: "collect",
            momentName: "rules.soft",
            writeAllowed: false,
          });
          const warnings = (await rules.soft!(mctx)) ?? [];
          return ok({ warnings: [...warnings] });
        },
      });
    }
  }

  if (m.invariant) {
    for (const rules of bindings.rules) {
      if (!rules.invariant) continue;
      ctx.addInvariantPort({
        async check({ draft }) {
          try {
            await rules.invariant!(resolveSlice(draft), draft);
            return ok({ ok: true as const });
          } catch (e) {
            if (isModuleDenial(e)) {
              return ok({ ok: false as const, reason: e.message });
            }
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        },
      });
    }
  }

  // change + deferred tool proposals
  if (m.change || ir.aiTools.length > 0) {
    ctx.addTransitionContributor({
      async contribute({ intent, rawAction, turnKind }, turnCtx) {
        const commands: StateCommand[] = [];
        const proposals = takeModuleOpProposals(
          turnCtx.extras as Record<string, unknown>,
          moduleId,
        );
        commands.push(...proposalsToCommands(proposals));

        if (m.change) {
          for (const turn of bindings.turns) {
            if (!turn.change) continue;
            try {
              const { ctx: mctx, session } = baseCtx({
                turnCtx,
                intent,
                action: rawAction,
                turnKind,
                world: turnCtx.stateView,
                opMode: "collect",
                momentName: "turn.change",
              });
              await turn.change(mctx);
              commands.push(...session.commands);
            } catch (e) {
              if (isModuleDenial(e)) return err(failure(e.code, e.message));
              const violation = violationToFailure(e);
              if (violation) return err(violation);
              throw e;
            }
          }
        }
        return ok({ commands });
      },
    });
  }

  if (m.afterProse) {
    ctx.addPostNarrativeContributor({
      async contribute(
        { passage, intent, draft, rawAction, turnKind },
        turnCtx,
      ) {
        const commands: StateCommand[] = [];
        for (const turn of bindings.turns) {
          if (!turn.afterProse) continue;
          try {
            const { ctx: mctx, session } = baseCtx({
              turnCtx,
              intent,
              action: rawAction,
              passage,
              turnKind,
              world: draft,
              opMode: "collect",
              momentName: "turn.afterProse",
            });
            await turn.afterProse(mctx);
            commands.push(...session.commands);
          } catch (e) {
            if (isModuleDenial(e)) return err(failure(e.code, e.message));
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        }
        return ok({ commands });
      },
    });
  }

  // committed: AfterCommit runs once; schedules drained by SystemTurnScheduler
  // Moment: post-outcome observe + scheduleSystem + emit (write-forbidden).
  if (m.committed) {
    ctx.addAfterCommitHook({
      async afterCommit({ passage, rawAction, turnKind }, turnCtx) {
        const schedules: {
          reason: string;
          payload?: JsonObject;
          mode?: "inline" | "background";
        }[] = [];
        for (const turn of bindings.turns) {
          if (!turn.committed) continue;
          try {
            const { ctx: mctx, session } = baseCtx({
              turnCtx,
              action: rawAction,
              passage,
              turnKind,
              world: turnCtx.stateView,
              opMode: "collect",
              momentName: "turn.committed",
              writeAllowed: false,
              emitAllowed: true,
              scheduleAllowed: true,
            });
            await turn.committed(mctx);
            for (const req of session.systemRequests) {
              schedules.push({
                reason: req.reason,
                ...(req.payload ? { payload: req.payload } : {}),
                ...(req.mode ? { mode: req.mode } : {}),
              });
            }
          } catch (e) {
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        }
        setModuleSystemSchedules(
          turnCtx.extras as Record<string, unknown>,
          moduleId,
          schedules,
        );
        return ok(undefined);
      },
    });

    ctx.addSystemTurnScheduler({
      schedule(_input, turnCtx) {
        const requests = takeModuleSystemSchedules(
          turnCtx.extras as Record<string, unknown>,
          moduleId,
        );
        return ok({ requests });
      },
    });
  }

  if (m.rejected) {
    ctx.addOnTurnRejected({
      async onRejected({ failure: fail }, turnCtx) {
        for (const turn of bindings.turns) {
          if (!turn.rejected) continue;
          try {
            const { ctx: mctx } = baseCtx({
              turnCtx,
              world: turnCtx.stateView,
              opMode: "collect",
              momentName: "turn.rejected",
              writeAllowed: false,
              emitAllowed: true,
            });
            await turn.rejected({ ...mctx, failureCode: fail.code });
          } catch (e) {
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        }
        return ok(undefined);
      },
    });
  }

  if (m.load) {
    ctx.addSessionHydrator({
      async hydrate({ state }, turnCtx) {
        for (const turn of bindings.turns) {
          if (!turn.load) continue;
          try {
            const { ctx: mctx } = baseCtx({
              turnCtx,
              world: state,
              opMode: "collect",
              momentName: "turn.load",
              writeAllowed: false,
              log: turnCtx?.log ?? ctx.log,
            });
            await turn.load(mctx);
          } catch (e) {
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        }
        return ok(undefined);
      },
    });
  }

  if (m.narrativeSystem || m.narrativeUser) {
    ctx.addNarrativePromptContributor({
      async contribute({ draft, intent, locale }, turnCtx) {
        const sections: NarrativePromptSection[] = [];
        for (const nar of bindings.narratives) {
          const { ctx: mctx } = baseCtx({
            turnCtx,
            intent,
            locale,
            world: draft,
            opMode: "collect",
            momentName: "narrative.*",
            writeAllowed: false,
          });
          try {
            if (m.narrativeSystem && nar.system) {
              const section = await nar.system(mctx);
              sections.push(
                ...normalizeSections(section, `${moduleId}.system`, "system"),
              );
            }
            if (m.narrativeUser && nar.user) {
              sections.push(
                ...normalizeSections(
                  await nar.user(mctx),
                  `${moduleId}.user`,
                  "user",
                ),
              );
            }
          } catch (e) {
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        }
        return ok({ sections });
      },
    });
  }

  if (m.narrativeBrief || m.narrativeHistory) {
    ctx.addNarrativeContextProvider({
      async provide({ draft, intent }, turnCtx) {
        let data: JsonObject = {};
        for (const nar of bindings.narratives) {
          const { ctx: mctx } = baseCtx({
            turnCtx,
            intent,
            world: draft,
            opMode: "collect",
            momentName: "narrative.*",
            writeAllowed: false,
          });
          try {
            if (m.narrativeBrief && nar.brief) {
              const brief = await nar.brief(mctx);
              if (brief) data = { ...data, ...brief };
            }
            if (m.narrativeHistory && nar.history) {
              const history = await nar.history(mctx);
              data = { ...data, history: history as unknown as JsonValue };
            }
          } catch (e) {
            const violation = violationToFailure(e);
            if (violation) return err(violation);
            throw e;
          }
        }
        return ok({ namespace: sliceName, data });
      },
    });
  }

  if (m.narrativeStyle) {
    ctx.addNarrativeStyleProvider({
      provide() {
        const style = bindings.narratives.find((n) => n.style)?.style ?? {};
        return ok({
          ...(style.tone ? { tone: style.tone } : {}),
          ...(style.rating ? { rating: style.rating } : {}),
          ...(style.voice ? { voice: style.voice } : {}),
          ...(style.constraints ? { constraints: [...style.constraints] } : {}),
        });
      },
    });
  }

  // AI catalogs + handlers from IR lists
  for (const taskIr of ir.aiTasks) {
    const taskDef = bindings.aiTasks.get(taskIr.localKey)!;
    ctx.registerAgentTaskType({
      type: taskIr.type,
      inputSchema: asJsonSchema(taskDef.input),
      outputSchema: asJsonSchema(taskDef.output),
      description: taskDef.description,
      defaultConstraints: {
        timeoutMs: taskDef.timeoutMs ?? 20_000,
        maxRepairAttempts: taskDef.maxRepairAttempts ?? 1,
        maxToolRounds: taskDef.maxToolRounds ?? 3,
        optional: taskDef.optional ?? false,
        ...(taskDef.temperature !== undefined
          ? { temperature: taskDef.temperature }
          : {}),
        ...(taskIr.tools.length ? { tools: [...taskIr.tools] } : {}),
      },
      buildMessages: taskDef.messages
        ? (task: AgentTask) => {
            const { ctx: mctx } = baseCtx({
              opMode: "collect",
              log: noopLog as never,
            });
            return taskDef.messages!(task.input, task, mctx);
          }
        : undefined,
    });
  }

  for (const toolIr of ir.aiTools) {
    const toolDef = bindings.aiTools.get(toolIr.localKey)!;
    ctx.registerAgentTool({
      id: toolIr.id,
      description: toolDef.description,
      argsSchema: asJsonSchema(toolDef.args),
      resultSchema: asJsonSchema(
        toolDef.result ?? z.record(z.string(), z.unknown()),
      ),
      ...(toolDef.parametersJsonSchema
        ? { parametersJsonSchema: toolDef.parametersJsonSchema }
        : {}),
    });
    ctx.addAgentToolHandler({
      id: toolIr.id,
      description: toolDef.description,
      async invoke(args, turnCtx) {
        try {
          const parsed = toolDef.args.safeParse(args);
          if (!parsed.success) {
            return err(
              failure("SCHEMA_INVALID", `invalid args for tool ${toolIr.id}`, {
                details: parsed.error,
              }),
            );
          }
          const { ctx: mctx } = baseCtx({
            turnCtx,
            world: turnCtx.stateView,
            opMode: "propose",
            momentName: "ai.tools.handler",
          });
          const result = await toolDef.handler(parsed.data as JsonObject, mctx);
          return ok(result);
        } catch (e) {
          if (isModuleDenial(e)) return err(failure(e.code, e.message));
          const violation = violationToFailure(e);
          if (violation) return err(violation);
          throw e;
        }
      },
    });
  }

  const runnableTasks = ir.aiTasks.filter((t) => t.systemReason);
  if (runnableTasks.length > 0) {
    ctx.addAgentTaskContributor({
      contribute({ stage, turnKind, rawAction }, turnCtx) {
        if (stage !== "plan") return ok({ tasks: [] });
        if (turnKind !== "system") return ok({ tasks: [] });
        if (rawAction?.kind !== "system") return ok({ tasks: [] });
        const tasks: AgentTask[] = [];
        for (const taskIr of runnableTasks) {
          if (rawAction.text !== taskIr.systemReason) continue;
          const taskDef = bindings.aiTasks.get(taskIr.localKey)!;
          const parsed = taskDef.input.safeParse(rawAction.payload ?? {});
          if (!parsed.success) {
            turnCtx.log.warn(
              { moduleId, task: taskIr.type },
              "system task payload invalid; skipping",
            );
            continue;
          }
          tasks.push({
            taskId: createTaskId(),
            type: taskIr.type,
            turnId: turnCtx.turnId,
            input: parsed.data as JsonObject,
            constraints: {
              timeoutMs: taskDef.timeoutMs ?? 20_000,
              maxRepairAttempts: taskDef.maxRepairAttempts ?? 1,
              maxToolRounds: taskDef.maxToolRounds ?? 3,
              optional: taskDef.optional ?? true,
              temperature: taskDef.temperature ?? 0.2,
              ...(taskIr.tools.length ? { tools: [...taskIr.tools] } : {}),
            },
            requester: { kind: "module", id: moduleId },
          });
        }
        return ok({ tasks });
      },
    });
  }

  if (m.hostStatus) {
    for (const host of bindings.host) {
      if (!host.status) continue;
      ctx.addStatusPanelProvider({
        async provide({ draft }, turnCtx) {
          const { ctx: mctx } = baseCtx({
            turnCtx,
            world: draft,
            opMode: "collect",
            momentName: "host.status",
            writeAllowed: false,
          });
          const lines = await host.status!(mctx);
          return ok({ lines });
        },
      });
    }
  }

  if (m.hostHelp) {
    for (const host of bindings.host) {
      if (!host.help?.length) continue;
      ctx.addHelpProvider({
        provide({ topic }) {
          const topics = host.help!.filter(
            (t) => !topic || t.id.includes(topic) || t.body.includes(topic),
          );
          return ok({
            topics: topics.map((t) => ({ id: t.id, body: t.body })),
          });
        },
      });
    }
  }

  for (const rmId of m.hostReadModels) {
    let def:
      | import("../types/capabilities.ts").HostReadModelDef
      | undefined;
    for (const host of bindings.host) {
      if (host.readModels?.[rmId]) {
        def = host.readModels[rmId];
        break;
      }
    }
    if (!def) {
      throw new Error(`${moduleId}: IR readModel ${rmId} missing binding`);
    }
    const get =
      typeof def === "function" ? def : def.get;
    const argsSchema =
      typeof def === "object" && def.args ? def.args : undefined;
    ctx.registerReadModel({
      id: rmId,
      ...(argsSchema ? { argsSchema: argsSchema as never } : {}),
      get(state, args) {
        return get(state, args as JsonObject, getConfig());
      },
    });
  }

  // --- events (specs/06 §7): declare publishers + static subscriptions ---
  for (const emit of bindings.events.emit) {
    ctx.registerEventPublisher({
      name: emit.name,
      moduleId,
      ...(emit.schema ? { schema: emit.schema } : {}),
    });
  }
  for (const sub of bindings.events.subscribe) {
    const priority = sub.priority;
    ctx.registerEventSubscription({
      name: sub.name,
      priority,
      moduleId,
      /** Handler wrapper: observe-only ctx (op/deny fail-loud → E15/E20). */
      handler: async (turnCtx, event) => {
        const { ctx: mctx, session } = baseCtx({
          turnCtx: turnCtx as TurnContext,
          world: (turnCtx as TurnContext).stateView,
          opMode: "collect",
          momentName: "event.dispatch",
          writeAllowed: false,
          emitAllowed: true,
          scheduleAllowed: true,
        });
        try {
          await sub.handler(mctx, event);
          if (session.systemRequests.length > 0) {
            setModuleSystemSchedules(
              (turnCtx as TurnContext).extras as Record<string, unknown>,
              moduleId,
              session.systemRequests.map((req) => ({
                reason: req.reason,
                ...(req.payload ? { payload: req.payload } : {}),
                ...(req.mode ? { mode: req.mode } : {}),
              })),
            );
          }
        } catch (e) {
          if (isModuleDenial(e)) {
            // deny() inside event dispatch → MODULE_EVENT_DENY_FORBIDDEN (E20)
            throw new ModuleCtxViolation(
              "MODULE_EVENT_DENY_FORBIDDEN",
              `[MODULE_EVENT_DENY_FORBIDDEN] deny() is forbidden in event handler (module: ${moduleId}, event: ${sub.name}). Hint: handlers are observe-only; follow-up work via scheduleSystem.`,
              { moduleId, event: sub.name },
            );
          }
          throw e;
        }
      },
    });
  }

  ctx.log.info(
    {
      moduleId,
      irVersion: ir.irVersion,
      loadPath: "bindCompiledModule",
      moments: m,
    },
    "compiled module bound from IR",
  );
}

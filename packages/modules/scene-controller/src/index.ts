import { defineModule, deny } from "@rpengineext/module-sdk";
import type { AgentTask, JsonObject, WorldState } from "@rpengineext/contracts";
import { z } from "zod";

import {
  FAILURE_REPEAT_CAP,
  MODULE_ID,
  READ_MODEL_HISTORY,
  READ_MODEL_STATUS,
  REQUIRES_WORKING_MEMORY,
  SLICE_NAME,
  SYSTEM_REASON_PROBE,
  TASK_PROBE,
  TOOL_REPORT_SCENE_LOCAL,
  WORKING_MEMORY_WINDOW_MODEL,
} from "./constants.ts";
import {
  resolveSceneControllerConfig,
  SceneControllerConfigSchema,
  type SceneControllerConfig,
  type SceneControllerModuleFactoryOptions,
} from "./config.ts";
import {
  buildSceneBrief,
  buildSceneControlSection,
  deriveGuidanceMode,
  effectiveUrgency,
  shouldDenyRepeatedAction,
} from "./guidance.ts";
import { buildProbeMessages } from "./probe-messages.ts";
import {
  ProbeInputSchema,
  ProbeOutputSchema,
  ProbeReportPayloadSchema,
  RecordTurnPayloadSchema,
  REPORT_SCENE_PARAMETERS_JSON,
  ReportSceneArgsSchema,
  ReportSceneResultSchema,
  SceneControllerSliceSchema,
  createEmptySceneControllerSlice,
  parseSceneControllerSlice,
  type ProbeReportPayload,
  type RecordTurnPayload,
  type SceneControllerSlice,
  type Verdict,
} from "./schema.ts";
import { applyProbeReport, applyRecordTurn, toVerdict } from "./transitions.ts";

export {
  CONFIG_KEY,
  FAILURE_REPEAT_CAP,
  MODULE_ID,
  NARRATIVE_SECTION_ID,
  NARRATIVE_SECTION_PRIORITY,
  NARRATIVE_SECTION_TITLE,
  READ_MODEL_HISTORY,
  READ_MODEL_STATUS,
  REQUIRES_WORKING_MEMORY,
  SLICE_NAME,
  SYSTEM_REASON_PROBE,
  TASK_PROBE,
  TOOL_IDS,
  TOOL_REPORT_SCENE_LOCAL,
  WORKING_MEMORY_WINDOW_MODEL,
} from "./constants.ts";
export type { GuidanceMode, LoopLevel, SceneType, Urgency } from "./constants.ts";
export * from "./schema.ts";
export type { SceneControllerConfig, SceneControllerModuleFactoryOptions } from "./config.ts";
export { resolveSceneControllerConfig } from "./config.ts";
export {
  buildSceneBrief,
  buildSceneControlSection,
  deriveDeterministicFloor,
  deriveGuidanceMode,
  DEFAULT_RESOLUTION_HINTS,
  effectiveUrgency,
  resolveResolutionHint,
  shouldDenyRepeatedAction,
} from "./guidance.ts";
export { buildProbeMessages } from "./probe-messages.ts";
export { applyProbeReport, applyRecordTurn, nextHighProgressBeats } from "./transitions.ts";

/**
 * Creates the scene-controller product module (sdk / CBMD).
 *
 * Requires `capability:working-memory`: recent-pairs context comes from the
 * `working_memory.window` readModel — the module keeps no pair buffer of its
 * own. After every player turn a background LLM probe runs; its verdict is
 * the single source of truth for scene state, escalation and the hard-stop
 * guard. The module itself has no content heuristics.
 *
 * @param options - factory options (validated; defaults in constants)
 */
export function createSceneControllerModule(
  options: SceneControllerModuleFactoryOptions = {},
) {
  const factoryConfig = resolveSceneControllerConfig(options);

  return defineModule(
    {
      id: MODULE_ID,
      version: "1.0.0",
      title: "Scene Controller",
      description:
        "Per-turn LLM scene judge: tracks scene progression, escalates resolution guidance, hard-stops recycled scenes",
      priority: 30,
      requires: [REQUIRES_WORKING_MEMORY],

      config: {
        key: "scene_controller",
        schema: SceneControllerConfigSchema,
        defaults: { ...factoryConfig } as JsonObject,
      },

      state: {
        name: SLICE_NAME,
        schemaVersion: 1,
        schema: SceneControllerSliceSchema,
        initial: createEmptySceneControllerSlice(),
        ops: {
          record_turn: {
            payload: RecordTurnPayloadSchema,
            apply: (s: SceneControllerSlice, p: RecordTurnPayload) =>
              applyRecordTurn(s, p),
          },
          probe_report: {
            payload: ProbeReportPayloadSchema,
            apply: (s: SceneControllerSlice, p: ProbeReportPayload) =>
              applyProbeReport(
                s,
                toVerdict(p),
                p.observedTurnId,
                p.historyCap,
                p.saturatedProgress,
              ),
          },
        },
      },

      turn: {
        afterProse(ctx) {
          if (ctx.turnKind !== "player") return;
          if (ctx.action?.kind !== "free_text") return;
          ctx.op(
            "record_turn",
            { turnId: ctx.passage!.turnId },
            "scene-controller player-turn counter",
          );
        },

        committed(ctx) {
          if (ctx.turnKind !== "player") return;
          if (ctx.action?.kind !== "free_text") return;
          const cfg = ctx.config as SceneControllerConfig;
          if (!cfg.probeEnabled) return;
          const slice = ctx.slice as SceneControllerSlice;
          const userText = ctx.action.text?.trim() ?? "";
          const prose = ctx.passage?.prose.trim() ?? "";
          if (!userText || !prose) return;
          // Recent-pairs context comes from working-memory, not from a local buffer.
          const wm = ctx.readModel<{
            history?: readonly {
              role: string;
              content: string;
            }[];
          }>(WORKING_MEMORY_WINDOW_MODEL);
          ctx.scheduleSystem({
            reason: SYSTEM_REASON_PROBE,
            mode: "background",
            payload: {
              userText,
              prose,
              currentScene: slice.current,
              history: wm.history ?? [],
            },
          });
        },
      },

      rules: {
        guard(ctx) {
          const cfg = ctx.config as SceneControllerConfig;
          const text =
            (ctx.normalizedAction as { text?: string } | undefined)?.text ??
            "";
          const slice = ctx.slice as SceneControllerSlice;
          // The previous turn's player text, from working-memory (declared via
          // requires). Last message with role "user" is the newest action.
          const wm = ctx.readModel<{
            history?: readonly {
              role: string;
              content: string;
            }[];
          }>(WORKING_MEMORY_WINDOW_MODEL);
          const lastUserText = [...(wm.history ?? [])]
            .reverse()
            .find((m) => m.role === "user")?.content;
          if (shouldDenyRepeatedAction(slice, text, lastUserText, cfg.hardStopEnabled)) {
            deny(
              FAILURE_REPEAT_CAP,
              "Это действие повторяет предыдущее, а текущая сцена уже исчерпана. История ждёт нового шага — опиши другой способ продвинуть её.",
            );
          }
        },
      },

      narrative: {
        system: ({ slice, config }) =>
          buildSceneControlSection(
            slice as SceneControllerSlice,
            config as SceneControllerConfig,
          ),
        brief: ({ slice, config }) =>
          buildSceneBrief(
            slice as SceneControllerSlice,
            config as SceneControllerConfig,
          ),
      },

      ai: {
        tasks: {
          [TASK_PROBE]: {
            description:
              "Judge the current scene state: continuation, progress, stall, recycling severity and conclusion urgency",
            input: ProbeInputSchema as unknown as z.ZodType<JsonObject>,
            output: ProbeOutputSchema as unknown as z.ZodType<JsonObject>,
            optional: true,
            timeoutMs: 20_000,
            maxRepairAttempts: 1,
            maxToolRounds: 3,
            temperature: 0.2,
            tools: [TOOL_REPORT_SCENE_LOCAL],
            runOn: { systemReason: SYSTEM_REASON_PROBE },
            messages: (input, task) =>
              buildProbeMessages({ ...task, input } as AgentTask),
          },
        },
        tools: {
          [TOOL_REPORT_SCENE_LOCAL]: {
            description:
              "Report the scene-director verdict for the current turn",
            args: ReportSceneArgsSchema as unknown as z.ZodType<JsonObject>,
            result: ReportSceneResultSchema as unknown as z.ZodType<JsonObject>,
            parametersJsonSchema: REPORT_SCENE_PARAMETERS_JSON,
            handler: (args, ctx) => {
              const verdict = args as unknown as Verdict;
              const cfg = ctx.config as SceneControllerConfig;
              const sceneSlice = ctx.slice as SceneControllerSlice;
              ctx.proposeOp(
                "probe_report",
                {
                  ...verdict,
                  // Bookkeeping ids are attached here from the slice (the most
                  // recent player turn), never by the model — no id echo, no
                  // chance of a mistyped id.
                  observedTurnId: sceneSlice.lastTurnId ?? ctx.turnId ?? "",
                  historyCap: cfg.historyCap,
                  saturatedProgress: cfg.saturatedProgress,
                } as unknown as JsonObject,
                SYSTEM_REASON_PROBE,
              );
              return { ok: true as const };
            },
          },
        },
      },

      host: {
        status: ({ slice, config }) => {
          const s = slice as SceneControllerSlice;
          if (!s.current) return [];
          const mode = deriveGuidanceMode(s, config as SceneControllerConfig);
          const label = s.current.label.trim() || s.current.id;
          const loop = s.loopLevel === "hard" ? " · loop hard" : "";
          return [
            {
              slot: "scene_controller.status",
              text: `Scene: ${label} · beat ${s.current.beat} · ${mode ?? "unknown"}${loop}`,
            },
          ];
        },
        readModels: {
          [READ_MODEL_STATUS]: (
            state: WorldState,
            _args: JsonObject,
            config: JsonObject,
          ) => {
            const s = parseSceneControllerSlice(state.slices[SLICE_NAME]);
            const cfg = config as SceneControllerConfig;
            const mode = deriveGuidanceMode(s, cfg);
            if (!s.current) {
              return {
                present: false,
                scene: null,
                tempo: null,
                counters: s.counters,
              };
            }
            return {
              present: true,
              scene: {
                id: s.current.id,
                label: s.current.label,
                type: s.current.type,
                beat: s.current.beat,
              },
              tempo: {
                mode,
                urgency: effectiveUrgency(s, cfg),
                loopLevel: s.loopLevel,
                consecutiveStalls: s.consecutiveStalls,
                highProgressBeats: s.highProgressBeats,
                progress: s.current.lastProgress,
              },
              counters: s.counters,
            };
          },
          [READ_MODEL_HISTORY]: (state: WorldState) => {
            const s = parseSceneControllerSlice(state.slices[SLICE_NAME]);
            return { history: s.history, resolvedScenes: s.counters.resolvedScenes };
          },
        },
      },
    },
    {
      factoryConfig: factoryConfig as JsonObject,
    },
  );
}
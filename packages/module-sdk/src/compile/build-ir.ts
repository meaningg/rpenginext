import {
  CORE_STATE_CAPABILITY,
  MODULE_IR_VERSION,
  type CompiledModuleIR,
  type ModuleManifest,
} from "@rpengineext/contracts";

import type {
  AiCapability,
  ConfigCapability,
  HostCapability,
  NarrativeCapability,
  RulesCapability,
  SeedCapability,
  StateCapability,
  TurnCapability,
} from "../types/capabilities.ts";
import type { NormalizedModuleDefinition } from "../types/definition.ts";
import { commandType, defaultSliceName } from "../util/ids.ts";
import {
  MODULE_SDK_VERSION,
  SDK_ENGINES_CONTRACTS,
  SDK_ENGINES_CORE,
} from "../version.ts";
import type { ModuleBindings } from "./bindings.ts";

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/**
 * Builds manifest + IR from normalized definition (no handlers).
 */
export function buildManifestAndIr(
  normalized: NormalizedModuleDefinition,
  bindings: ModuleBindings,
): { manifest: ModuleManifest; ir: CompiledModuleIR } {
  const stateCap = normalized.capabilities.find(
    (c): c is StateCapability => c.kind === "state",
  );
  const configCap = normalized.capabilities.find(
    (c): c is ConfigCapability => c.kind === "config",
  );
  const seedCaps = normalized.capabilities.filter(
    (c): c is SeedCapability => c.kind === "seed",
  );
  const rulesCaps = normalized.capabilities.filter(
    (c): c is RulesCapability => c.kind === "rules",
  );
  const turnCaps = normalized.capabilities.filter(
    (c): c is TurnCapability => c.kind === "turn",
  );
  const narrativeCaps = normalized.capabilities.filter(
    (c): c is NarrativeCapability => c.kind === "narrative",
  );
  const aiCaps = normalized.capabilities.filter(
    (c): c is AiCapability => c.kind === "ai",
  );
  const hostCaps = normalized.capabilities.filter(
    (c): c is HostCapability => c.kind === "host",
  );

  const sliceName = stateCap?.name ?? defaultSliceName(normalized.id);
  const schemaVersion = stateCap?.schemaVersion ?? 1;

  const registers: string[] = [];
  const contributes: string[] = [];
  const permissions: string[] = ["state:read"];
  const provides = [...normalized.provides];

  if (stateCap) {
    registers.push(`slice:${sliceName}`);
    permissions.push(`state:propose:${sliceName}`);
    for (const op of bindings.knownOps) {
      registers.push(`command:${commandType(sliceName, op)}`);
    }
    if (bindings.knownOps.size > 0) {
      registers.push(`command:${sliceName}.*`);
    }
    if (stateCap.migrations) {
      registers.push(`migration:${sliceName}`);
    }
  }

  if (configCap) {
    registers.push(`config:${bindings.config?.key ?? sliceName}`);
  }

  for (const p of provides) {
    if (!registers.includes(p)) registers.push(p);
  }

  const moments = {
    seed: seedCaps.length > 0,
    guard: rulesCaps.some((r) => Boolean(r.guard)),
    soft: rulesCaps.some((r) => Boolean(r.soft)),
    invariant: rulesCaps.some((r) => Boolean(r.invariant)),
    change: turnCaps.some((t) => Boolean(t.change)),
    afterProse: turnCaps.some((t) => Boolean(t.afterProse)),
    committed: turnCaps.some((t) => Boolean(t.committed)),
    rejected: turnCaps.some((t) => Boolean(t.rejected)),
    load: turnCaps.some((t) => Boolean(t.load)),
    narrativeSystem: narrativeCaps.some((n) => Boolean(n.system)),
    narrativeUser: narrativeCaps.some((n) => Boolean(n.user)),
    narrativeBrief: narrativeCaps.some((n) => Boolean(n.brief)),
    narrativeHistory: narrativeCaps.some((n) => Boolean(n.history)),
    narrativeStyle: narrativeCaps.some((n) => Boolean(n.style)),
    hostStatus: hostCaps.some((h) => Boolean(h.status)),
    hostHelp: hostCaps.some((h) => Boolean(h.help?.length)),
    hostReadModels: hostCaps.flatMap((h) => Object.keys(h.readModels ?? {})),
  };

  if (moments.seed) contributes.push("SessionBootstrap");
  if (moments.guard) contributes.push("Guard");
  if (moments.soft) contributes.push("SoftGuard");
  if (moments.invariant) contributes.push("Invariant");
  if (moments.change || bindings.aiTools.size > 0) {
    contributes.push("TransitionContributor");
  }
  if (moments.afterProse) contributes.push("PostNarrativeContributor");
  if (moments.committed) {
    contributes.push("AfterCommitHook");
    contributes.push("SystemTurnScheduler");
  }
  if (moments.rejected) contributes.push("OnTurnRejected");
  if (moments.load) contributes.push("SessionHydrator");
  if (moments.narrativeSystem || moments.narrativeUser) {
    contributes.push("NarrativePromptContributor");
  }
  if (moments.narrativeBrief || moments.narrativeHistory) {
    contributes.push("NarrativeContextProvider");
  }
  if (moments.narrativeStyle) contributes.push("NarrativeStyleProvider");
  if (moments.hostStatus) contributes.push("StatusPanelProvider");
  if (moments.hostHelp) contributes.push("HelpProvider");
  for (const rmId of moments.hostReadModels) {
    registers.push(`read-model:${rmId}`);
  }

  const aiTasksIr = [...bindings.aiTasks.entries()].map(([localKey, task]) => ({
    localKey,
    type: task.type,
    optional: task.optional ?? false,
    tools: [...task.toolIds],
    ...(task.runOn?.systemReason
      ? { systemReason: task.runOn.systemReason }
      : {}),
  }));
  const aiToolsIr = [...bindings.aiTools.entries()].map(([localKey, tool]) => ({
    localKey,
    id: tool.id,
  }));

  for (const task of aiTasksIr) {
    registers.push(`agent-task:${task.type}`);
    provides.push(`agent-task:${task.type}`);
    permissions.push(`agent:call:${task.type}`);
    contributes.push("AgentTaskContributor");
  }
  for (const tool of aiToolsIr) {
    registers.push(`agent-tool:${tool.id}`);
    contributes.push("AgentTool");
  }

  // access.read does not need extra permission tokens in v1 vocabulary

  const requires = normalized.requires.includes(CORE_STATE_CAPABILITY)
    ? [...normalized.requires]
    : [CORE_STATE_CAPABILITY, ...normalized.requires];

  const manifest: ModuleManifest = {
    id: normalized.id,
    version: normalized.version,
    displayName: normalized.title,
    description: normalized.description,
    engines: {
      core: SDK_ENGINES_CORE,
      contracts: SDK_ENGINES_CONTRACTS,
    },
    priority: normalized.priority,
    provides: unique(provides),
    requires: unique(requires),
    permissions: unique(permissions) as ModuleManifest["permissions"],
    stateSlices: stateCap
      ? [{ name: sliceName, schemaVersion }]
      : [],
    registers: unique(registers),
    contributes: unique(contributes) as ModuleManifest["contributes"],
    interceptors: [],
  };

  const ir: CompiledModuleIR = {
    irVersion: MODULE_IR_VERSION,
    sdkVersion: MODULE_SDK_VERSION,
    manifest,
    ...(stateCap
      ? {
          slice: {
            name: sliceName,
            schemaVersion,
            ops: [...bindings.knownOps].map((name) => ({
              name,
              commandType: commandType(sliceName, name),
              hasPayloadSchema: Boolean(bindings.state?.ops.get(name)?.payloadSchema),
            })),
            hasMigrations: Boolean(stateCap.migrations),
          },
        }
      : {}),
    ...(bindings.config ? { configKey: bindings.config.key } : {}),
    allowedReadSlices: [...bindings.allowedReadSlices],
    moments,
    aiTasks: aiTasksIr,
    aiTools: aiToolsIr,
    capabilityKinds: unique(normalized.capabilities.map((c) => c.kind)),
  };

  return { manifest, ir };
}

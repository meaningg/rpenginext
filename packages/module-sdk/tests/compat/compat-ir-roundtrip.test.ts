import { describe, expect, test } from "bun:test";
import {
  MODULE_IR_VERSION,
  parseModuleManifest,
} from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";
import { z } from "zod";

import { defineModule } from "../../src/index.ts";
import {
  createCompatConfigModule,
  createCompatGuardModule,
  createCompatScheduleModule,
  createCompatSeedNarrativeModule,
  createCompatToolModule,
} from "./fixtures.ts";

describe("compat IR (specs/01 §5.2–5.3)", () => {
  test("IR is fully JSON-serializable (no functions/closures/zod instances)", () => {
    const modules = [
      createCompatSeedNarrativeModule(),
      createCompatGuardModule(),
      createCompatConfigModule(),
      createCompatToolModule(),
      createCompatScheduleModule(),
    ];
    for (const mod of modules) {
      const round = JSON.parse(JSON.stringify(mod.ir));
      expect(round.irVersion).toBe(MODULE_IR_VERSION);
      expect(round.sdkVersion).toBe("1.0.0");
      expect(round.manifest.id).toBe(mod.manifest.id);
      // No function-valued fields survive serialization.
      const json = JSON.stringify(round);
      expect(json).not.toContain("(function");
      expect(json).not.toContain("=>");
      // Manifest re-parses from the round-tripped JSON (foreign IR producers
      // emit the same shape → same engines validation).
      const parsed = parseModuleManifest(round.manifest);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.engines.core).toBe("^1.0.0");
        expect(parsed.data.engines.contracts).toBe("^1.0.0");
      }
      // Round-tripped IR must carry the full declarative surface.
      expect(round.events).toBeDefined();
      expect(round.lifecycle).toBeDefined();
      expect(round.moments).toBeDefined();
    }
  });

  test("engines validation: module with unsupported engines fails boot with stable code (E11)", async () => {
    const mod = defineModule({
      id: "sdk-mod",
      version: "1.0.0",
      title: "SDK Mod",
    });
    // Tamper with the stamped manifest to simulate an unsupported engine range.
    const tampered = {
      ...mod,
      manifest: {
        ...mod.manifest,
        engines: { core: "^0.1.0", contracts: "^1.0.0" },
      },
    };
    const created = await createTestEngine({ modules: [tampered as never] });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("MODULE_ENGINES_INCOMPATIBLE");
  });

  test("IR access/readModel/events surface is declarative and bindable", () => {
    const mod = defineModule({
      id: "compat-events-mod",
      version: "1.0.0",
      title: "Events Mod",
      state: {
        schema: z.object({ schemaVersion: z.literal(1) }).strict(),
        initial: { schemaVersion: 1 as const },
      },
      host: {
        readModels: {
          "compat_events_mod.count": () => ({ n: 1 }),
        },
      },
      events: {
        emit: [{ name: "tick", schema: z.object({ n: z.number() }).strict() }],
        subscribe: [{ name: "other.thing", handler() {} }],
      },
      access: { read: ["other_slice"] },
    });
    const ir = mod.ir!;
    expect(ir.events.emit).toEqual([
      { name: "compat_events_mod.tick", hasSchema: true },
    ]);
    expect(ir.events.subscribe).toEqual([
      { name: "other.thing", priority: 100 },
    ]);
    expect(ir.allowedReadSlices).toEqual(["other_slice"]);
    expect(ir.moments.hostReadModels).toEqual(["compat_events_mod.count"]);
  });
});
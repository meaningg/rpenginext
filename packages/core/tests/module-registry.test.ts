import { describe, expect, test } from "bun:test";
import { createLogger } from "@rpengineext/logger";

import { ModuleRegistry } from "../src/registry/module-registry.ts";
import { createFixtureHelloModule } from "../src/testing/fixture-hello-module.ts";

const log = createLogger({ name: "registry-test", level: "error", json: true });

describe("ModuleRegistry", () => {
  test("boots with zero modules", async () => {
    const registry = new ModuleRegistry({ log });
    const boot = await registry.boot([]);
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(boot.value.modules).toHaveLength(0);
    expect(boot.value.providedCapabilities.has("capability:state-core")).toBe(
      true,
    );
  });

  test("loads fixture module and registers ports", async () => {
    const registry = new ModuleRegistry({ log });
    const boot = await registry.boot([createFixtureHelloModule()]);
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(boot.value.modules.map((m) => m.module.manifest.id)).toEqual([
      "fixture-hello",
    ]);
    expect(boot.value.index.guards.length).toBe(1);
    expect(boot.value.index.transitionContributors.length).toBe(1);
  });

  test("duplicate module id fails", async () => {
    const registry = new ModuleRegistry({ log });
    const boot = await registry.boot([
      createFixtureHelloModule(),
      createFixtureHelloModule(),
    ]);
    expect(boot.ok).toBe(false);
    if (boot.ok) return;
    expect(boot.error.code).toBe("DUPLICATE_MODULE");
  });

  test("missing capability fails", async () => {
    const registry = new ModuleRegistry({ log });
    const boot = await registry.boot([
      {
        manifest: {
          id: "needs-npc",
          version: "0.1.0",
          displayName: "Needs NPC",
          description: "",
          engines: { core: "^0.1.0", contracts: "^0.1.0" },
          priority: 10,
          provides: [],
          requires: ["capability:npc"],
          permissions: [],
          stateSlices: [],
          registers: [],
          contributes: [],
          interceptors: [],
        },
        register() {},
      },
    ]);
    expect(boot.ok).toBe(false);
    if (boot.ok) return;
    expect(boot.error.code).toBe("CAPABILITY_MISSING");
  });
});

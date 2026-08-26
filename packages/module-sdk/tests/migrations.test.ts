import { describe, expect, test } from "bun:test";
import { defineModule } from "../src/index.ts";
import {
  createEmptyWorldState,
  type SessionSnapshot,
} from "@rpengineext/contracts";
import { createTestEngine } from "@rpengineext/core/testing";
import { InMemoryPersistence } from "@rpengineext/core";
import { z } from "zod";

/**
 * Fixture module with a v1→v2 migration (specs/05 §6).
 * v1: `{ schemaVersion:1, oldName: string }` → v2: `{ schemaVersion:2, name }`.
 */
function migratingModule() {
  return defineModule({
    id: "migrating-mod",
    version: "1.0.0",
    title: "Migrating",
    state: {
      name: "migrating_mod",
      schemaVersion: 2,
      schema: z
        .object({ schemaVersion: z.literal(2), name: z.string() })
        .strict(),
      initial: { schemaVersion: 2 as const, name: "" },
      ops: {
        set_name: {
          payload: z.object({ name: z.string() }).strict(),
          apply: (s: { schemaVersion: 2; name: string }, p: { name: string }) => ({
            ...s,
            name: p.name,
          }),
        },
      },
      migrations: {
        1: (old: unknown) => {
          const v1 = old as { schemaVersion: 1; oldName?: string };
          return {
            schemaVersion: 2 as const,
            name: v1.oldName?.trim() || "migrated",
          };
        },
      },
    },
  });
}

function snapshotWithSlice(
  sessionId: string,
  sliceName: string,
  slice: Record<string, unknown>,
): SessionSnapshot {
  const state = createEmptyWorldState("2024-01-01T00:00:00.000Z");
  return {
    formatVersion: 1,
    sessionId,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    engine: { coreVersion: "1.0.0", contractsVersion: "1.0.0" },
    enabledModules: [{ id: "migrating-mod", version: "1.0.0" }],
    state: {
      ...state,
      slices: { [sliceName]: slice as never },
    },
    passages: [],
    meta: {},
  };
}

describe("slice migrations (specs/05 §6)", () => {
  test("v1→v2 load succeeds and migrates the slice", async () => {
    const persistence = new InMemoryPersistence();
    const saved = await persistence.save(
      snapshotWithSlice("mig-session", "migrating_mod", {
        schemaVersion: 1,
        oldName: "legacy lore",
      }),
    );
    expect(saved.ok).toBe(true);

    const created = await createTestEngine({
      modules: [migratingModule()],
      persistence,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const loaded = await created.value.engine.loadSession("mig-session");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const state = created.value.runtime.getSessionState("mig-session")!;
    expect(state.slices.migrating_mod).toEqual({
      schemaVersion: 2,
      name: "legacy lore",
    });
  });

  test("unmigratable version fails load with stable error (E14)", async () => {
    const mod = defineModule({
      id: "frozen-mod",
      version: "1.0.0",
      title: "Frozen",
      state: {
        name: "frozen_mod",
        schemaVersion: 2,
        schema: z
          .object({ schemaVersion: z.literal(2), n: z.number() })
          .strict(),
        initial: { schemaVersion: 2 as const, n: 0 },
      },
    });
    const persistence = new InMemoryPersistence();
    const saved = await persistence.save(
      snapshotWithSlice("frozen-session", "frozen_mod", {
        schemaVersion: 1,
        n: 5,
      }),
    );
    expect(saved.ok).toBe(true);

    const created = await createTestEngine({ modules: [mod], persistence });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const loaded = await created.value.engine.loadSession("frozen-session");
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.code).toBe("MODULE_SLICE_UNMIGRATABLE");
    expect(JSON.stringify(loaded.error.details)).toContain("frozen_mod");
  });

  test("migrated slice stays writable via ops", async () => {
    const persistence = new InMemoryPersistence();
    await persistence.save(
      snapshotWithSlice("mig-session-2", "migrating_mod", {
        schemaVersion: 1,
        oldName: "a",
      }),
    );
    const created = await createTestEngine({
      modules: [migratingModule()],
      persistence,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const loaded = await created.value.engine.loadSession("mig-session-2");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const turn = await loaded.value.submitAction({
      kind: "free_text",
      text: "rename",
    });
    expect(turn.status).toBe("committed");
    const state = created.value.runtime.getSessionState("mig-session-2")!;
    expect((state.slices.migrating_mod as { schemaVersion: number }).schemaVersion).toBe(2);
  });
});
import { describe, expect, test } from "bun:test";
import {
  CORE_COMMAND_TYPES,
  createEmptyWorldState,
  ok,
} from "@rpengineext/contracts";

import { createCoreCommandDefinitions } from "../src/state/core-commands.ts";
import { StateKernel } from "../src/state/state-kernel.ts";

function bootKernel() {
  const kernel = new StateKernel(
    createEmptyWorldState("2026-01-01T00:00:00.000Z"),
  );
  for (const def of createCoreCommandDefinitions()) {
    const reg = kernel.registerCommand(def);
    expect(reg.ok).toBe(true);
  }
  return kernel;
}

describe("StateKernel", () => {
  test("dry-apply + commit advances turn and revision", () => {
    const kernel = bootKernel();
    expect(kernel.beginTurn("trn_1").ok).toBe(true);
    const applied = kernel.dryApply([
      {
        commandId: "cmd_1",
        type: CORE_COMMAND_TYPES.bumpTurn,
        slice: "core",
        payload: { turnId: "trn_1" },
        source: { kind: "core", id: "test" },
      },
    ]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.draft.core.turnIndex).toBe(1);
    expect(applied.value.draft.meta.revision).toBe(1);

    const committed = kernel.commit();
    expect(committed.ok).toBe(true);
    expect(kernel.getAuthoritative().core.turnIndex).toBe(1);
  });

  test("invalid command discards without publishing", () => {
    const kernel = bootKernel();
    kernel.beginTurn("trn_2");
    const applied = kernel.dryApply([
      {
        commandId: "cmd_x",
        type: "unknown.command",
        slice: "core",
        payload: {},
        source: { kind: "core", id: "test" },
      },
    ]);
    expect(applied.ok).toBe(false);
    kernel.discard();
    expect(kernel.getAuthoritative().core.turnIndex).toBe(0);
    expect(kernel.getAuthoritative().meta.revision).toBe(0);
  });

  test("partial multi-command failure does not leave draft half-applied on discard", () => {
    const kernel = bootKernel();
    kernel.beginTurn("trn_3");
    const applied = kernel.dryApply([
      {
        commandId: "cmd_a",
        type: CORE_COMMAND_TYPES.setFlag,
        slice: "core",
        payload: { key: "a", value: true },
        source: { kind: "core", id: "test" },
      },
      {
        commandId: "cmd_b",
        type: CORE_COMMAND_TYPES.setFlag,
        slice: "core",
        payload: { key: "b" }, // invalid: missing value
        source: { kind: "core", id: "test" },
      },
    ]);
    expect(applied.ok).toBe(false);
    kernel.discard();
    expect(kernel.getAuthoritative().core.flags).toEqual({});
  });

  test("invariant failure rejects dry-apply", () => {
    const kernel = bootKernel();
    kernel.registerInvariant({
      id: "no-evil-flag",
      check(state) {
        if (state.core.flags.evil === true) {
          return {
            ok: false,
            error: {
              code: "INVARIANT_FAILED",
              message: "evil flag forbidden",
            },
          };
        }
        return ok(undefined);
      },
    });
    kernel.beginTurn("trn_4");
    const applied = kernel.dryApply([
      {
        commandId: "cmd_evil",
        type: CORE_COMMAND_TYPES.setFlag,
        slice: "core",
        payload: { key: "evil", value: true },
        source: { kind: "core", id: "test" },
      },
    ]);
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.error.code).toBe("INVARIANT_FAILED");
  });
});

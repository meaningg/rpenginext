import { describe, expect, test } from "bun:test";

import { parseStateCommand } from "../src/state/commands.ts";
import {
  createEmptyWorldState,
  WorldStateSchema,
} from "../src/state/world-state.ts";
import { parseProposal } from "../src/state/proposal.ts";

describe("state command & world state", () => {
  test("success: parses namespaced command and empty world", () => {
    const command = parseStateCommand({
      commandId: "cmd_1",
      type: "core.setFlag",
      slice: "core",
      payload: { key: "intro_seen", value: true },
      source: { kind: "core", id: "kernel" },
    });
    expect(command.success).toBe(true);

    const world = createEmptyWorldState("2026-08-17T00:00:00.000Z");
    const parsedWorld = WorldStateSchema.safeParse(world);
    expect(parsedWorld.success).toBe(true);
    if (parsedWorld.success) {
      expect(parsedWorld.data.core.turnIndex).toBe(0);
      expect(parsedWorld.data.meta.revision).toBe(0);
    }
  });

  test("error path: rejects unnamespaced type and bad payload", () => {
    const unnamespaced = parseStateCommand({
      commandId: "cmd_2",
      type: "setFlag",
      slice: "core",
      payload: {},
      source: { kind: "module", id: "x" },
    });
    expect(unnamespaced.success).toBe(false);

    const badPayload = parseStateCommand({
      commandId: "cmd_3",
      type: "core.setFlag",
      slice: "core",
      payload: null,
      source: { kind: "core", id: "kernel" },
    });
    expect(badPayload.success).toBe(false);
  });

  test("edge: proposal requires command list and optional confidence bounds", () => {
    const okProposal = parseProposal({
      proposalId: "prop_1",
      commands: [
        {
          commandId: "cmd_1",
          type: "example.setValue",
          slice: "example",
          payload: { value: 1 },
          source: { kind: "agent", id: "action.interpret" },
        },
      ],
      confidence: 0.5,
    });
    expect(okProposal.success).toBe(true);

    const badConfidence = parseProposal({
      proposalId: "prop_2",
      commands: [],
      confidence: 1.5,
    });
    expect(badConfidence.success).toBe(false);
  });
});

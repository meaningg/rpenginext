import { describe, expect, test } from "bun:test";

import { parsePlayerAction } from "../src/turn/action.ts";
import { parsePassage } from "../src/turn/passage.ts";
import { parseTurnResult } from "../src/turn/turn-result.ts";
import { STAGE_IDS } from "../src/turn/stages.ts";
import { parseTraceNote } from "../src/tracing/note.ts";

describe("turn result & passage", () => {
  test("success: committed turn with passage", () => {
    const result = parseTurnResult({
      status: "committed",
      turnId: "trn_1",
      sessionId: "ses_1",
      revision: 1,
      passage: {
        id: "pas_1",
        turnId: "trn_1",
        prose: "Hello, world.",
      },
      acceptedCommands: [],
      warnings: [],
    });
    expect(result.success).toBe(true);
  });

  test("error path: rejected requires failure; bad action rejected", () => {
    const rejected = parseTurnResult({
      status: "rejected",
      turnId: "trn_2",
      sessionId: "ses_1",
      failure: {
        turnId: "trn_2",
        code: "GUARD_REJECTED",
        message: "You cannot do that.",
      },
    });
    expect(rejected.success).toBe(true);

    const missingFailure = parseTurnResult({
      status: "rejected",
      turnId: "trn_2",
      sessionId: "ses_1",
    });
    expect(missingFailure.success).toBe(false);

    const badAction = parsePlayerAction({ kind: "unknown" });
    expect(badAction.success).toBe(false);

    const emptyPassage = parsePassage({
      id: "",
      turnId: "trn",
      prose: "x",
    });
    expect(emptyPassage.success).toBe(false);
  });

  test("edge: stage list is fixed length; trace note namespace rules", () => {
    expect(STAGE_IDS).toHaveLength(12);
    expect(STAGE_IDS[0]).toBe("begin");
    expect(STAGE_IDS[9]).toBe("commit");

    const note = parseTraceNote({
      namespace: "npc",
      title: "Salience",
      body: "3 actors",
      data: { count: 3 },
    });
    expect(note.success).toBe(true);

    const badNs = parseTraceNote({
      namespace: "npc notes",
      title: "x",
      body: "y",
    });
    expect(badNs.success).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";

import {
  buildSceneBrief,
  buildSceneControlSection,
  DEFAULT_RESOLUTION_HINTS,
  deriveDeterministicFloor,
  deriveGuidanceMode,
  effectiveUrgency,
  resolveResolutionHint,
  shouldDenyRepeatedAction,
} from "../src/guidance.ts";
import type { GuidanceMode, Urgency } from "../src/constants.ts";
import type { SceneControllerConfig } from "../src/config.ts";
import type { SceneControllerSlice, Verdict } from "../src/schema.ts";

/**
 * Builds a slice fixture with the given overrides.
 */
function makeSlice(
  overrides: Partial<SceneControllerSlice> = {},
): SceneControllerSlice {
  return {
    schemaVersion: 1,
    current: null,
    loopLevel: "none",
    consecutiveStalls: 0,
    highProgressBeats: 0,
    lastVerdict: null,
    window: [],
    history: [],
    counters: { playerTurns: 0, probes: 0, resolvedScenes: 0 },
    ...overrides,
  } as SceneControllerSlice;
}

const SCENE = {
  id: "scene-001",
  label: "Разговор в порту",
  type: "social" as const,
  beat: 4,
  startedAtTurnId: "t1",
  lastConfirmTurnId: "t4",
  lastProgress: 0.6,
};

function verdict(partial: Partial<Verdict>): Verdict {
  return {
    sameScene: true,
    label: null,
    type: null,
    progress: 0.5,
    stall: false,
    repeat: false,
    loop: "none",
    urgency: 0,
    resolved: false,
    resolutionHint: null,
    ...partial,
  };
}

const CONFIG: SceneControllerConfig = {
  historyCap: 10,
  probeEnabled: true,
  hardStopEnabled: true,
  saturatedProgress: 0.85,
  climaxSaturatedBeats: 3,
  hardSaturatedBeats: 6,
  resolutionHints: {},
};

describe("deriveGuidanceMode", () => {
  test("no active scene → null", () => {
    expect(deriveGuidanceMode(makeSlice())).toBeNull();
  });

  test("urgency 0/1 → develop", () => {
    const s = makeSlice({
      current: SCENE,
      lastVerdict: verdict({ urgency: 1 }),
    });
    expect(deriveGuidanceMode(s)).toBe("develop");
  });

  test("urgency 2 → climax", () => {
    const s = makeSlice({
      current: SCENE,
      lastVerdict: verdict({ urgency: 2 }),
    });
    expect(deriveGuidanceMode(s)).toBe("climax");
  });

  test("urgency 3 → hard", () => {
    const s = makeSlice({
      current: SCENE,
      lastVerdict: verdict({ urgency: 3 }),
    });
    expect(deriveGuidanceMode(s)).toBe("hard");
  });

  test("loop soft escalates to climax even at urgency 0", () => {
    const s = makeSlice({
      current: SCENE,
      loopLevel: "soft",
      lastVerdict: verdict({ urgency: 0 }),
    });
    expect(deriveGuidanceMode(s)).toBe("climax");
  });

  test("loop hard overrides everything → hard", () => {
    const s = makeSlice({
      current: SCENE,
      loopLevel: "hard",
      lastVerdict: verdict({ urgency: 0, loop: "none" }),
    });
    expect(deriveGuidanceMode(s)).toBe("hard");
  });

  test("boundary: all modes covered by the enum", () => {
    const modes = new Set<GuidanceMode | null>([
      "develop",
      "climax",
      "hard",
      null,
    ]);
    expect(modes.has(deriveGuidanceMode(makeSlice()))).toBe(true);
  });
});

describe("progress clock (deterministic escalation)", () => {
  test("floor 0 when below the climax threshold", () => {
    const s = makeSlice({ current: SCENE, highProgressBeats: 2 });
    expect(deriveDeterministicFloor(s, CONFIG)).toBe(0);
    expect(deriveGuidanceMode(s, CONFIG)).toBe("develop");
  });

  test("floor reaches climax after climaxSaturatedBeats saturated probes", () => {
    const s = makeSlice({
      current: SCENE,
      highProgressBeats: 3,
      lastVerdict: verdict({ urgency: 0 }),
    });
    expect(deriveDeterministicFloor(s, CONFIG)).toBe(2);
    expect(effectiveUrgency(s, CONFIG)).toBe(2);
    expect(deriveGuidanceMode(s, CONFIG)).toBe("climax");
  });

  test("floor reaches hard after hardSaturatedBeats saturated probes", () => {
    const s = makeSlice({
      current: SCENE,
      highProgressBeats: 6,
      lastVerdict: verdict({ urgency: 1 }),
    });
    expect(deriveDeterministicFloor(s, CONFIG)).toBe(3);
    expect(deriveGuidanceMode(s, CONFIG)).toBe("hard");
  });

  test("floor is a max — a model urgency 3 is never lowered", () => {
    const s = makeSlice({
      current: SCENE,
      highProgressBeats: 0,
      lastVerdict: verdict({ urgency: 3 }),
    });
    expect(effectiveUrgency(s, CONFIG)).toBe(3);
    expect(deriveGuidanceMode(s, CONFIG)).toBe("hard");
  });

  test("custom thresholds in config are honored", () => {
    const tight: SceneControllerConfig = {
      ...CONFIG,
      climaxSaturatedBeats: 2,
      hardSaturatedBeats: 4,
    };
    const s = makeSlice({ current: SCENE, highProgressBeats: 2, lastVerdict: verdict({ urgency: 0 }) });
    expect(deriveGuidanceMode(s, tight)).toBe("climax");
    const harder = makeSlice({
      current: SCENE,
      highProgressBeats: 4,
      lastVerdict: verdict({ urgency: 0 }),
    });
    expect(deriveGuidanceMode(harder, tight)).toBe("hard");
  });

  test("no active scene → floor 0, no guidance", () => {
    const s = makeSlice({ highProgressBeats: 9 });
    expect(deriveDeterministicFloor(s, CONFIG)).toBe(0);
    expect(deriveGuidanceMode(s, CONFIG)).toBeNull();
  });

  test("buildSceneBrief exposes effective urgency (clock floor wins over model 0)", () => {
    const s = makeSlice({
      current: SCENE,
      highProgressBeats: 3,
      lastVerdict: verdict({ urgency: 0 }),
    });
    const brief = buildSceneBrief(s, CONFIG);
    expect(brief?.tempo).toMatchObject({
      mode: "climax",
      urgency: 2 as Urgency,
      highProgressBeats: 3,
    });
  });

  test("progress clock never sways the hard-stop guard (loop-level only)", () => {
    const s = makeSlice({
      loopLevel: "none",
      current: SCENE,
      highProgressBeats: 9,
    });
    expect(shouldDenyRepeatedAction(s, "продолжаю", "продолжаю", true)).toBe(false);
  });
});

describe("resolveResolutionHint", () => {
  test("verdict hint wins over config and built-ins", () => {
    const s = makeSlice({
      current: SCENE,
      lastVerdict: verdict({ urgency: 2, resolutionHint: "капитан уходит в море" }),
    });
    const cfg = { ...CONFIG, resolutionHints: { social: "гильдия вмешивается" } };
    expect(resolveResolutionHint(s, cfg)).toBe("капитан уходит в море");
  });

  test("config hint used when verdict has none", () => {
    const s = makeSlice({ current: SCENE });
    const cfg = { ...CONFIG, resolutionHints: { social: "гильдия вмешивается" } };
    expect(resolveResolutionHint(s, cfg)).toBe("гильдия вмешивается");
  });

  test("built-in neutral template used as final fallback", () => {
    const s = makeSlice({ current: SCENE });
    expect(resolveResolutionHint(s, CONFIG)).toBe(
      DEFAULT_RESOLUTION_HINTS.social,
    );
  });

  test("no scene → null", () => {
    expect(resolveResolutionHint(makeSlice(), CONFIG)).toBeNull();
  });

  test("every built-in template is outcome-neutral (no conflict bias)", () => {
    const biased = [
      "противник",
      "враг",
      "сдаётся",
      "сдался",
      "теряет след",
      "погоня",
      "догон",
      "убива",
      "волна",
    ];
    for (const hint of Object.values(DEFAULT_RESOLUTION_HINTS)) {
      for (const word of biased) {
        expect(hint.toLowerCase()).not.toContain(word);
      }
    }
  });
});

describe("buildSceneControlSection", () => {
  test("no scene → null", () => {
    expect(buildSceneControlSection(makeSlice(), CONFIG)).toBeNull();
  });

  test("develop: scene status with beat", () => {
    const s = makeSlice({
      current: SCENE,
      lastVerdict: verdict({ urgency: 0 }),
    });
    const section = buildSceneControlSection(s, CONFIG);
    expect(section).not.toBeNull();
    const text = section?.text ?? "";
    expect(text).toContain("Активная сцена");
    expect(text).toContain("«Разговор в порту»");
    expect(text).toContain("ход 4");
    expect(section?.title).toBe("SCENE CONTROL");
  });

  test("climax: mandates conclusion, includes resolution hint", () => {
    const s = makeSlice({
      current: SCENE,
      lastVerdict: verdict({
        urgency: 2,
        resolutionHint: "договор подписан",
      }),
    });
    const section = buildSceneControlSection(s, CONFIG);
    const text = section?.text ?? "";
    expect(section?.id).toBe("scene_controller.control");
    expect(text).toContain("исчерпала развитие");
    expect(text).toContain("договор подписан");
  });

  test("hard: mandatory resolution this turn", () => {
    const s = makeSlice({
      current: SCENE,
      loopLevel: "hard",
      lastVerdict: verdict({ urgency: 3 }),
    });
    const text = buildSceneControlSection(s, CONFIG)?.text ?? "";
    expect(text).toContain("ЖЁСТКИЙ ПРЕДЕЛ");
    expect(text).toContain("обязательна в этом ходе");
  });

  test("sections never push toward conflict", () => {
    const biased = ["противник", "враг", "сдаётся", "погоня", "волна", "атаку"];
    for (const mode of ["develop", "climax", "hard"] as const) {
      const slice = makeSlice({
        current: SCENE,
        loopLevel: mode === "hard" ? "hard" : "none",
        lastVerdict: verdict({
          urgency: mode === "develop" ? 0 : mode === "climax" ? 2 : 3,
        }),
      });
      const text = buildSceneControlSection(slice, CONFIG)?.text ?? "";
      for (const word of biased) {
        expect(text.toLowerCase()).not.toContain(word);
      }
    }
  });
});

describe("buildSceneBrief", () => {
  test("no scene → null", () => {
    expect(buildSceneBrief(makeSlice(), CONFIG)).toBeNull();
  });

  test("carries scene + tempo projection", () => {
    const s = makeSlice({
      current: SCENE,
      loopLevel: "soft",
      lastVerdict: verdict({ urgency: 2, stall: true }),
    });
    const brief = buildSceneBrief(s, CONFIG);
    expect(brief).not.toBeNull();
    expect(brief?.scene).toMatchObject({ id: "scene-001", beat: 4 });
    expect(brief?.tempo).toMatchObject({ mode: "climax", loopLevel: "soft" });
    expect(brief?.resolutionHint).toBe(DEFAULT_RESOLUTION_HINTS.social);
  });
});

describe("shouldDenyRepeatedAction", () => {
  test("false when loop is not hard", () => {
    const s = makeSlice({});
    expect(shouldDenyRepeatedAction(s, "продолжаю погоню", "иду к двери", true)).toBe(false);
  });

  test("true on exact identical action under hard loop", () => {
    const s = makeSlice({ loopLevel: "hard" });
    expect(shouldDenyRepeatedAction(s, "продолжаю погоню", "продолжаю погоню", true)).toBe(true);
  });

  test("trims both sides before comparing", () => {
    const s = makeSlice({ loopLevel: "hard" });
    expect(shouldDenyRepeatedAction(s, "  продолжаю погоню  ", " продолжаю погоню ", true)).toBe(true);
  });

  test("false on a different action (semantic repetition is LLM's call)", () => {
    const s = makeSlice({ loopLevel: "hard" });
    expect(shouldDenyRepeatedAction(s, "отступаю в переулок", "продолжаю погоню", true)).toBe(false);
  });

  test("false when hard stop disabled", () => {
    const s = makeSlice({ loopLevel: "hard" });
    expect(shouldDenyRepeatedAction(s, "продолжаю погоню", "продолжаю погоню", false)).toBe(false);
  });

  test("false without action text or last user text", () => {
    const s = makeSlice({ loopLevel: "hard" });
    expect(shouldDenyRepeatedAction(s, undefined, "x", true)).toBe(false);
    expect(shouldDenyRepeatedAction(s, "x", undefined, true)).toBe(false);
    expect(shouldDenyRepeatedAction(s, "", "", true)).toBe(false);
  });
});
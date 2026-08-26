import { describe, expect, test } from "bun:test";

import {
  effectiveContributes,
  parseModuleManifest,
} from "../src/modules/manifest.ts";

const validManifest = {
  id: "example",
  version: "0.1.0",
  displayName: "Example Module",
  description: "Demonstrates the module contract",
  engines: {
    core: "^1.0.0",
    contracts: "^1.0.0",
  },
  priority: 500,
  provides: ["capability:example"],
  requires: ["capability:state-core"],
  permissions: ["state:read", "state:propose:example"],
  stateSlices: [{ name: "example", schemaVersion: 1 }],
  contributes: ["Guard", "TransitionContributor", "NarrativeContextProvider"],
  registers: ["slice:example", "command:example.*"],
  interceptors: [{ stage: "plan", when: "before" }],
};

describe("module manifest", () => {
  test("success: parses wide-surface manifest", () => {
    const parsed = parseModuleManifest(validManifest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe("example");
      expect(parsed.data.contributes).toContain("Guard");
      expect(effectiveContributes(parsed.data)).toEqual([
        "Guard",
        "TransitionContributor",
        "NarrativeContextProvider",
      ]);
    }
  });

  test("error path: rejects unknown permission and bad id", () => {
    const badPermission = parseModuleManifest({
      ...validManifest,
      permissions: ["state:write"],
    });
    expect(badPermission.success).toBe(false);

    const badId = parseModuleManifest({
      ...validManifest,
      id: "Not Valid",
    });
    expect(badId.success).toBe(false);

    const badPort = parseModuleManifest({
      ...validManifest,
      contributes: ["NotARealPort"],
    });
    expect(badPort.success).toBe(false);
  });

  test("edge: legacy extensionPoints merge and defaults", () => {
    const legacy = parseModuleManifest({
      id: "legacy-mod",
      version: "1.0.0",
      displayName: "Legacy",
      engines: { core: "^1.0.0", contracts: "^1.0.0" },
      priority: 100,
      extensionPoints: ["Guard", "AfterCommitHook"],
    });
    expect(legacy.success).toBe(true);
    if (legacy.success) {
      expect(legacy.data.permissions).toEqual([]);
      expect(legacy.data.requires).toEqual([]);
      expect(effectiveContributes(legacy.data)).toEqual([
        "Guard",
        "AfterCommitHook",
      ]);
    }
  });
});

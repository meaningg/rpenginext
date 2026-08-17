import { describe, expect, test } from "bun:test";

import {
  agentCallPermission,
  createPermissionChecker,
  hasPermission,
  isPermissionToken,
  permissionCovers,
  proposePermissionForSlice,
} from "../src/modules/permissions.ts";

describe("permissions", () => {
  test("success: exact and wildcard grants cover requirements", () => {
    expect(permissionCovers("state:read", "state:read")).toBe(true);
    expect(
      permissionCovers("state:propose:*", "state:propose:npc"),
    ).toBe(true);
    expect(
      permissionCovers("agent:call:*", "agent:call:narrative.write"),
    ).toBe(true);
    expect(
      hasPermission(
        ["state:read", "state:propose:npc"],
        "state:propose:npc",
      ),
    ).toBe(true);
  });

  test("error path: missing grant and invalid tokens", () => {
    expect(
      permissionCovers("state:propose:npc", "state:propose:plot"),
    ).toBe(false);
    expect(hasPermission(["state:read"], "memory:write")).toBe(false);
    expect(isPermissionToken("state:write")).toBe(false);
    expect(isPermissionToken("")).toBe(false);
    expect(isPermissionToken(null)).toBe(false);
  });

  test("edge: checker + helpers for slice/task tokens", () => {
    const checker = createPermissionChecker([
      "state:propose:*",
      "agent:call:action.interpret",
      "rng:use",
    ]);
    expect(checker.allows(proposePermissionForSlice("inventory"))).toBe(true);
    expect(checker.allows(agentCallPermission("action.interpret"))).toBe(true);
    expect(checker.allows(agentCallPermission("narrative.write"))).toBe(false);
    expect(checker.list()).toHaveLength(3);
    expect(isPermissionToken("rng:use")).toBe(true);
  });
});

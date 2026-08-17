# Module Template (current API)

Скопируйте и замените `example` → ваш id.  
Полный гайд: [writing-modules-for-core.md](./writing-modules-for-core.md).

## Manifest

```ts
import type { ModuleManifest } from "@rpengineext/contracts";

export const manifest: ModuleManifest = {
  id: "example",
  version: "0.1.0",
  displayName: "Example Module",
  description: "Demonstrates the module contract",
  engines: {
    core: "^0.1.0",
    contracts: "^0.1.0",
  },
  priority: 500,
  provides: ["capability:example"],
  requires: ["capability:state-core"],
  permissions: ["state:read", "state:propose:example"],
  stateSlices: [{ name: "example", schemaVersion: 1 }],
  registers: ["slice:example", "command:example.setValue"],
  contributes: [
    "Guard",
    "TransitionContributor",
    "NarrativeContextProvider",
  ],
  interceptors: [],
};
```

## Factory

```ts
import {
  ok,
  type Module,
  type ModuleRegisterContext,
  type StateCommand,
} from "@rpengineext/contracts";
import { z } from "zod";

import { manifest } from "./manifest.ts";

export function createExampleModule(): Module {
  return {
    manifest,
    register(ctx: ModuleRegisterContext) {
      ctx.registerSlice({
        name: "example",
        schemaVersion: 1,
        schema: z
          .object({
            schemaVersion: z.literal(1),
            flag: z.boolean().optional(),
          })
          .passthrough() as never,
        initialValue: { schemaVersion: 1 },
      });

      ctx.registerCommand({
        type: "example.setValue",
        slice: "example",
        payloadSchema: z
          .object({ flag: z.boolean() })
          .strict() as never,
        apply(state, command) {
          const prev = (state.slices.example ?? {}) as Record<string, unknown>;
          return ok({
            ...state,
            slices: {
              ...state.slices,
              example: {
                ...prev,
                schemaVersion: 1,
                flag: Boolean(command.payload.flag),
              },
            },
          });
        },
      });

      ctx.addGuard({
        check({ action }) {
          if (action.text?.trim().toLowerCase() === "nope") {
            return ok({
              allow: false,
              code: "GUARD_REJECTED",
              message: "not allowed",
            });
          }
          return ok({ allow: true });
        },
      });

      ctx.addTransitionContributor({
        contribute({ intent }) {
          const commands: StateCommand[] = [
            {
              commandId: crypto.randomUUID(),
              type: "example.setValue",
              slice: "example",
              payload: { flag: true },
              reason: `react to ${intent.intentType}`,
              source: { kind: "module", id: manifest.id },
            },
          ];
          return ok({ commands });
        },
      });

      ctx.addNarrativeContextProvider({
        provide({ draft }) {
          return ok({
            namespace: "example",
            data: { slice: draft.slices.example ?? {} },
          });
        },
      });
    },
  };
}
```

## Tests (minimum)

```ts
import { describe, expect, test } from "bun:test";
import { createTestEngine } from "@rpengineext/core/testing";
import { createExampleModule } from "../src/index.ts";

describe("example module", () => {
  test("success", async () => {
    const created = await createTestEngine({
      modules: [createExampleModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "hello",
    });
    expect(turn.status).toBe("committed");
  });

  test("error — guard reject, revision unchanged", async () => {
    const created = await createTestEngine({
      modules: [createExampleModule()],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = await created.value.engine.startSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const before = created.value.runtime.getSessionState(session.value.sessionId);
    const turn = await session.value.submitAction({
      kind: "free_text",
      text: "nope",
    });
    expect(turn.status).toBe("rejected");
    const after = created.value.runtime.getSessionState(session.value.sessionId);
    expect(after?.meta.revision).toBe(before?.meta.revision);
  });

  test("edge — boundary / empty extras", async () => {
    // your boundary case
  });
});
```

## Author README sections

1. What the player feels  
2. State slice fields  
3. Commands list  
4. Permissions required  
5. Agent tasks / tools (if any)  
6. Config options  
7. Limitations  

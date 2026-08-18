# Шаблон модуля (скопируй)

Полный гайд: [README.md](./README.md).  
Или сразу: `bun run create-module <id>`.

## `src/index.ts`

```ts
import { defineModule, deny } from "@rpengineext/module-sdk";
import { z } from "zod";

export const MODULE_ID = "example" as const;

/**
 * Фабрика модуля — её подключает host.
 */
export function createExampleModule() {
  return defineModule({
    id: MODULE_ID,
    version: "0.1.0",
    title: "Example",
    description: "Шаблон: state + guard + change + narrative",
    priority: 100,
    provides: ["capability:example"],

    state: {
      schema: z
        .object({
          schemaVersion: z.literal(1),
          flag: z.boolean(),
        })
        .strict(),
      initial: { schemaVersion: 1 as const, flag: false },
      ops: {
        set_flag: {
          payload: z.object({ flag: z.boolean() }).strict(),
          apply: (s, p: { flag: boolean }) => ({ ...s, flag: p.flag }),
        },
      },
    },

    rules: {
      guard(ctx) {
        const text = (
          ctx.normalizedAction as { text?: string } | undefined
        )?.text?.trim().toLowerCase();
        if (text === "nope") {
          deny("GUARD_REJECTED", "Действие запрещено.");
        }
      },
    },

    turn: {
      change(ctx) {
        ctx.op("set_flag", { flag: true }, "example reacted to turn");
      },
    },

    narrative: {
      system: ({ slice }) => {
        const s = slice as { flag: boolean };
        return s.flag
          ? "Флаг example включён — учти это в сцене."
          : null;
      },
      brief: ({ slice }) => ({ example: slice }),
    },

    host: {
      status: ({ slice }) => {
        const s = slice as { flag: boolean };
        return [
          {
            slot: "example.flag",
            text: `Example: ${s.flag ? "on" : "off"}`,
          },
        ];
      },
    },
  });
}
```

## `tests/example.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { createTestEngine } from "@rpengineext/core/testing";
import { createExampleModule } from "../src/index.ts";

describe("example module", () => {
  test("success: ход коммитится и ставит flag", async () => {
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

    const state = created.value.runtime.getSessionState(session.value.sessionId);
    const slice = state?.slices.example as { flag: boolean };
    expect(slice.flag).toBe(true);
  });

  test("error: guard отклоняет nope", async () => {
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

  test("edge: IR foundation", () => {
    const mod = createExampleModule();
    expect(mod.manifest.id).toBe("example");
    expect(mod.compiled).toBeTruthy();
    expect(mod.ir?.irVersion).toBe(1);
  });
});
```

## README модуля (коротко)

1. Что замечает игрок  
2. Поля slice  
3. Список ops  
4. Откуда seed (если есть)  
5. Ограничения v1  

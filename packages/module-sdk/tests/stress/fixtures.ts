import { defineModule } from "../../src/index.ts";
import { z } from "zod";

/**
 * Lightweight no-op / fixture stress module (specs/02 §5.4).
 * N=30 means thirty of these — boot/order/save pressure, not content coverage.
 *
 * Modules at even indexes declare an event subscription so P03/P04 exercise the
 * event graph at scale; odd indexes declare an emit.
 */
export function createNoopStressModule(i: number) {
  const id = `stress-${i.toString().padStart(2, "0")}`;
  const sliceName = `stress_${i.toString().padStart(2, "0")}`;
  const hasEvents = i % 2 === 0;
  const hasEmit = i % 2 === 1;
  return defineModule({
    id,
    version: "1.0.0",
    title: `Stress ${i}`,
    description: "no-op stress fixture",
    priority: i % 3 === 0 ? 10 : 100,
    state: {
      name: sliceName,
      schema: z
        .object({ schemaVersion: z.literal(1), touched: z.boolean() })
        .strict(),
      initial: { schemaVersion: 1 as const, touched: false },
      ops: {
        touch: (s) => ({ ...s, touched: true }),
      },
    },
    events:
      hasEvents || hasEmit
        ? {
            ...(hasEmit
              ? {
                  emit: [
                    {
                      name: `changed-${i}`,
                      schema: z.object({ i: z.number() }).strict(),
                    },
                  ],
                }
              : {}),
            ...(hasEvents
              ? {
                  subscribe: [
                    {
                      name: `stress_01.changed-1`,
                      priority: 100,
                      handler() {
                        /* observe only */
                      },
                    },
                  ],
                }
              : {}),
          }
        : undefined,
    turn: {
      change() {
        /* no-op */
      },
    },
  });
}

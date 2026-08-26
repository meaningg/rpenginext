import {
  CORE_COMMAND_TYPES,
  ok,
  type Module,
  type ModuleManifest,
  type StateCommand,
} from "@rpengineext/contracts";

import { createCommandId } from "../util/ids.ts";

/**
 * Test-only fixture module (not a product domain module).
 * Sets core flag helloSeen and rejects free text "nope".
 */
export function createFixtureHelloModule(): Module {
  const manifest: ModuleManifest = {
    id: "fixture-hello",
    version: "1.0.0",
    displayName: "Fixture Hello",
    description: "Phase 2 test fixture module",
    engines: {
      core: "^1.0.0",
      contracts: "^1.0.0",
    },
    priority: 50,
    provides: ["capability:fixture-hello"],
    requires: ["capability:state-core"],
    permissions: ["state:read", "state:propose:core"],
    stateSlices: [],
    registers: [],
    contributes: ["Guard", "TransitionContributor"],
    interceptors: [{ stage: "propose", when: "after" }],
  };

  return {
    manifest,
    register(ctx) {
      ctx.addGuard({
        check({ action }) {
          if (
            action.actionType === "free_text" &&
            action.text?.trim().toLowerCase() === "nope"
          ) {
            return ok({
              allow: false,
              code: "GUARD_REJECTED",
              message: "fixture rejects 'nope'",
            });
          }
          return ok({ allow: true });
        },
      });

      ctx.addTransitionContributor({
        contribute({ intent }) {
          const commands: StateCommand[] = [
            {
              commandId: createCommandId(),
              type: CORE_COMMAND_TYPES.setFlag,
              slice: "core",
              payload: { key: "helloSeen", value: true },
              reason: `fixture reaction to ${intent.intentType}`,
              source: { kind: "module", id: "fixture-hello" },
            },
          ];
          return ok({ commands });
        },
      });

      ctx.addInterceptor({
        stage: "propose",
        when: "after",
        handle(turnCtx) {
          turnCtx.trace.note({
            namespace: "fixturehello",
            title: "Propose after",
            body: "fixture-hello annotated propose stage",
          });
          return ok(undefined);
        },
      });
    },
  };
}

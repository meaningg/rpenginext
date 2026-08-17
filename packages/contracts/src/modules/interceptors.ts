import type { Result, Failure } from "../result.ts";
import type { StateCommand } from "../state/commands.ts";
import type { JsonObject } from "../json.ts";
import type { TurnContext } from "../turn/context.ts";
import type { AgentTask } from "../agents/task.ts";
import type {
  InterceptorStageId,
  InterceptorWhen,
} from "../turn/stages.ts";

/**
 * Limited effects an interceptor may return (never mutates authoritative state).
 * @see docs/architecture/12-extension-surface.md
 */
export type InterceptorEffect =
  | { readonly type: "reject"; readonly failure: Failure }
  | { readonly type: "warn"; readonly message: string }
  | {
      readonly type: "patchExtras";
      readonly namespace: string;
      readonly data: JsonObject;
    }
  | { readonly type: "enqueueAgentTask"; readonly task: AgentTask }
  | { readonly type: "enqueueCommands"; readonly commands: readonly StateCommand[] };

/**
 * Stage interceptor registration (layer B).
 */
export interface StageInterceptor {
  readonly stage: InterceptorStageId;
  readonly when: InterceptorWhen;
  /** Lower runs earlier; defaults to module priority. */
  readonly priority?: number;
  readonly permission?: string;
  handle(
    ctx: TurnContext,
    error?: Failure,
  ):
    | Promise<Result<void | InterceptorEffect | InterceptorEffect[], Failure>>
    | Result<void | InterceptorEffect | InterceptorEffect[], Failure>;
}

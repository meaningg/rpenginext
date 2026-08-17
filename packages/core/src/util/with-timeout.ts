import { err, failure, ok, type Failure, type Result } from "@rpengineext/contracts";

/**
 * Races a promise against a timeout budget.
 *
 * @param work - async work
 * @param timeoutMs - budget in milliseconds (non-positive disables timeout)
 * @param label - error label (stage/task id)
 */
export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<Result<T, Failure>> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    try {
      return ok(await work);
    } catch (error) {
      return err(
        failure("INTERNAL", `${label} threw`, { details: String(error) }),
      );
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      work.then((value) => ({ kind: "ok" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
    if (result.kind === "timeout") {
      return err(
        failure("TIMEOUT", `${label} timed out after ${timeoutMs}ms`, {
          details: { timeoutMs, label },
        }),
      );
    }
    return ok(result.value);
  } catch (error) {
    return err(
      failure("INTERNAL", `${label} threw`, { details: String(error) }),
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

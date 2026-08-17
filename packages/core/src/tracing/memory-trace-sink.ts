import {
  ok,
  type Failure,
  type Result,
  type TraceSinkPort,
} from "@rpengineext/contracts";

/**
 * In-memory TraceSinkPort for tests and Phase 2 CLI.
 */
export class MemoryTraceSink implements TraceSinkPort {
  readonly files = new Map<string, string>();

  /**
   * @inheritdoc
   */
  async write(path: string, markdown: string): Promise<Result<void, Failure>> {
    this.files.set(path, markdown);
    return ok(undefined);
  }

  /**
   * Returns the last written markdown or undefined.
   */
  last(): { path: string; markdown: string } | undefined {
    const entries = [...this.files.entries()];
    const last = entries[entries.length - 1];
    if (!last) return undefined;
    return { path: last[0], markdown: last[1] };
  }

  /**
   * Clears stored traces.
   */
  clear(): void {
    this.files.clear();
  }
}

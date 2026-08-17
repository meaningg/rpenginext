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
  private lastWrite: { path: string; markdown: string } | undefined;

  /**
   * @inheritdoc
   */
  async write(path: string, markdown: string): Promise<Result<void, Failure>> {
    this.files.set(path, markdown);
    this.lastWrite = { path, markdown };
    return ok(undefined);
  }

  /**
   * Returns the last written markdown or undefined.
   * Tracks explicit last write so rewriting the same path still updates "last".
   */
  last(): { path: string; markdown: string } | undefined {
    return this.lastWrite;
  }

  /**
   * Clears stored traces.
   */
  clear(): void {
    this.files.clear();
    this.lastWrite = undefined;
  }
}

import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  err,
  failure,
  ok,
  type Failure,
  type Result,
  type TraceSinkPort,
} from "@rpengineext/contracts";

/**
 * Filesystem TraceSinkPort — writes UTF-8 markdown dossiers under a root directory.
 *
 * Relative paths from the tracer are resolved against {@link rootDir} when they
 * are not absolute. Creates parent directories as needed.
 */
export class FilesystemTraceSink implements TraceSinkPort {
  readonly rootDir: string;
  private lastWrite: { path: string; markdown: string } | undefined;

  /**
   * @param rootDir - absolute or cwd-relative root (e.g. `data` or `data/traces`)
   */
  constructor(rootDir: string = "data") {
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * @inheritdoc
   */
  async write(
    relativeOrAbsolutePath: string,
    markdown: string,
  ): Promise<Result<void, Failure>> {
    try {
      const absolute = path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.resolve(process.cwd(), relativeOrAbsolutePath);

      await mkdir(path.dirname(absolute), { recursive: true });
      await Bun.write(absolute, markdown);
      this.lastWrite = { path: absolute, markdown };
      return ok(undefined);
    } catch (error) {
      return err(
        failure("INTERNAL", "failed to write turn trace file", {
          details: String(error),
        }),
      );
    }
  }

  /**
   * Last successfully written file (absolute path).
   */
  last(): { path: string; markdown: string } | undefined {
    return this.lastWrite;
  }
}

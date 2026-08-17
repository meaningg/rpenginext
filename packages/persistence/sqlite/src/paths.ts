import path from "node:path";

/** Default SQLite filename under the data directory. */
export const DEFAULT_SQLITE_FILENAME = "rpengine.sqlite" as const;

/**
 * Resolves the absolute database file path.
 *
 * @param options - data directory and optional explicit file
 */
export function resolveDatabaseFile(options: {
  readonly dataDir: string;
  readonly databaseFile?: string;
}): string {
  if (options.databaseFile && options.databaseFile.trim().length > 0) {
    return path.resolve(options.databaseFile);
  }
  return path.resolve(options.dataDir, DEFAULT_SQLITE_FILENAME);
}

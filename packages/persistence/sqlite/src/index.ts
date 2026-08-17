/**
 * `@rpengineext/persistence-sqlite` — bun:sqlite PersistencePort driver.
 *
 * @packageDocumentation
 */

export {
  SqlitePersistence,
  type SqlitePersistenceOptions,
} from "./sqlite-persistence.ts";
export { resolveDatabaseFile, DEFAULT_SQLITE_FILENAME } from "./paths.ts";

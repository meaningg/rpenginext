import fs from "node:fs";
import path from "node:path";

import { err, failure, ok, type Failure, type Result } from "@rpengineext/contracts";

import { parseStoryTemplate, type StoryTemplate } from "./types.ts";

/**
 * In-memory story template catalog loaded from a directory of JSON files.
 */
export class StoryCatalog {
  private readonly byId = new Map<string, StoryTemplate>();

  /**
   * @param templates - validated templates
   */
  constructor(templates: readonly StoryTemplate[] = []) {
    for (const template of templates) {
      this.byId.set(template.id, template);
    }
  }

  /**
   * Loads all `*.json` templates from a directory (non-recursive).
   *
   * @param directory - absolute or relative path
   */
  static loadFromDirectory(directory: string): Result<StoryCatalog, Failure> {
    const resolved = path.resolve(directory);
    if (!fs.existsSync(resolved)) {
      return err(
        failure("CONFIG_INVALID", `stories directory not found: ${resolved}`),
      );
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return err(
        failure(
          "CONFIG_INVALID",
          `stories path is not a directory: ${resolved}`,
        ),
      );
    }

    const files = fs
      .readdirSync(resolved)
      .filter((name) => name.endsWith(".json"))
      .sort();

    const templates: StoryTemplate[] = [];
    for (const file of files) {
      const full = path.join(resolved, file);
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(full, "utf8"));
      } catch (error) {
        return err(
          failure("CONFIG_INVALID", `failed to parse story file ${file}`, {
            details: String(error),
          }),
        );
      }
      const parsed = parseStoryTemplate(raw);
      if (!parsed.success) {
        return err(
          failure("CONFIG_INVALID", `invalid story template in ${file}`, {
            details: parsed.error.flatten(),
          }),
        );
      }
      templates.push(parsed.data);
    }

    const ids = new Set<string>();
    for (const template of templates) {
      if (ids.has(template.id)) {
        return err(
          failure(
            "CONFIG_INVALID",
            `duplicate story template id: ${template.id}`,
          ),
        );
      }
      ids.add(template.id);
    }
    return ok(new StoryCatalog(templates));
  }

  /**
   * Lists all templates (stable id order).
   */
  list(): StoryTemplate[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Returns a template by id.
   *
   * @param id - template id
   */
  get(id: string): StoryTemplate | undefined {
    return this.byId.get(id);
  }
}

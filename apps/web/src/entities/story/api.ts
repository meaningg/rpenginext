import { http } from "../../shared/api/http.ts";
import type { StoryTemplate } from "./model.ts";

/**
 * Lists story templates from the host catalog.
 */
export async function listTemplates(): Promise<StoryTemplate[]> {
  const data = await http<{ templates: StoryTemplate[] }>("/v1/templates");
  return data.templates;
}

/**
 * Loads one story template by id.
 *
 * @param templateId - template id
 */
export async function getTemplate(templateId: string): Promise<StoryTemplate> {
  const data = await http<{ template: StoryTemplate }>(
    `/v1/templates/${encodeURIComponent(templateId)}`,
  );
  return data.template;
}

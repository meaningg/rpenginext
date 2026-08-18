import type { z } from "zod";

import type { JsonObject } from "@rpengineext/contracts";

/**
 * Casts a Zod object schema to the contracts JsonObject boundary type.
 *
 * @param schema - zod schema
 */
export function asJsonSchema<T extends z.ZodType>(
  schema: T,
): z.ZodType<JsonObject> {
  return schema as unknown as z.ZodType<JsonObject>;
}

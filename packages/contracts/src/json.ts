import { z } from "zod";

/**
 * JSON-compatible value (no undefined, no functions, no bigint).
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * Mutable JSON object bag used in payloads before freeze.
 */
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * Recursive Zod schema for {@link JsonValue}.
 */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/**
 * Zod schema for a JSON object.
 */
export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  JsonValueSchema,
);

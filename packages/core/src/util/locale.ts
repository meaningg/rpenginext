import type { JsonObject } from "@rpengineext/contracts";

/** Default when neither session nor engine config provides a locale. */
export const DEFAULT_TURN_LOCALE = "en";

/**
 * Common non-BCP-47 aliases → preferred tags.
 * Unknown values are returned trimmed as-is.
 */
const LOCALE_ALIASES: Readonly<Record<string, string>> = {
  english: "en",
  "en-us": "en-US",
  "en-gb": "en-GB",
  russian: "ru",
  русский: "ru",
  "ru-ru": "ru-RU",
};

/**
 * Normalizes a locale tag or language name for prompts and localization.
 *
 * @param raw - user/template/config locale string
 */
export function normalizeLocale(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_TURN_LOCALE;
  const alias = LOCALE_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
}

/**
 * Reads a locale string from an unknown value.
 *
 * @param value - candidate locale
 */
export function readLocaleValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return normalizeLocale(trimmed);
}

/**
 * Resolves locale for a turn.
 * Priority: session meta.locale → engine config turn.locale → {@link DEFAULT_TURN_LOCALE}.
 *
 * @param sessionMeta - persisted session meta bag
 * @param configLocale - EngineConfig.turn.locale fallback
 */
export function resolveTurnLocale(
  sessionMeta: JsonObject | undefined,
  configLocale: string | undefined,
): string {
  const fromSession = readLocaleValue(sessionMeta?.locale);
  if (fromSession) return fromSession;
  const fromConfig = readLocaleValue(configLocale);
  if (fromConfig) return fromConfig;
  return DEFAULT_TURN_LOCALE;
}

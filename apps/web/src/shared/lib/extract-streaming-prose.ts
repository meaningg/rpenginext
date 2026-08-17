/**
 * Extracts player-facing narrative prose from a partial LLM output buffer.
 *
 * Live narrative.write streams JSON (`{"prose":"...","meta"?:{...}}`).
 * Mock streams may already emit plain prose. Both are supported.
 *
 * @param raw - cumulative stream text so far
 * @returns prose visible to the player (may be partial while streaming)
 */
export function extractStreamingProse(raw: string): string {
  if (!raw) return "";

  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("{")) {
    return raw;
  }

  const prose = extractPartialJsonStringField(trimmed, "prose");
  return prose ?? "";
}

/**
 * Reads a JSON string field value from a possibly incomplete object buffer.
 *
 * @param partialJson - JSON text that may still be streaming
 * @param field - object key to extract
 * @returns decoded string content so far, or null if the field has not started
 */
export function extractPartialJsonStringField(
  partialJson: string,
  field: string,
): string | null {
  const keyPattern = new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"`);
  const match = keyPattern.exec(partialJson);
  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index + match[0].length;
  let out = "";
  let i = start;

  while (i < partialJson.length) {
    const ch = partialJson[i];

    if (ch === "\\") {
      if (i + 1 >= partialJson.length) {
        break;
      }
      const next = partialJson[i + 1];
      switch (next) {
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case '"':
        case "\\":
        case "/":
          out += next;
          break;
        case "u": {
          const hex = partialJson.slice(i + 2, i + 6);
          if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
            return out;
          }
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
        default:
          out += next;
          break;
      }
      i += 2;
      continue;
    }

    if (ch === '"') {
      break;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

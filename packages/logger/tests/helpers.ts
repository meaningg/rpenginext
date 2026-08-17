import { Writable } from "node:stream";

/**
 * Captures NDJSON log lines written by pino for assertions.
 */
export function createLogCapture(): {
  destination: Writable;
  lines: () => Record<string, unknown>[];
  raw: () => string;
  waitForLines: (count: number, timeoutMs?: number) => Promise<Record<string, unknown>[]>;
} {
  let buffer = "";
  const parsed: Record<string, unknown>[] = [];

  const destination = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.trim().length === 0) {
          continue;
        }
        parsed.push(JSON.parse(part) as Record<string, unknown>);
      }
      callback();
    },
  });

  return {
    destination,
    lines: () => [...parsed],
    raw: () => buffer,
    async waitForLines(count, timeoutMs = 1000) {
      const started = Date.now();
      while (parsed.length < count) {
        if (Date.now() - started > timeoutMs) {
          throw new Error(
            `Timeout waiting for ${count} log lines (got ${parsed.length})`,
          );
        }
        await Bun.sleep(5);
      }
      return [...parsed];
    },
  };
}

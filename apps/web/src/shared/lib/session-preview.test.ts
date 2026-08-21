import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { clearTranscript, saveTranscript } from "./chat-transcript.ts";
import { getSessionPreview } from "./session-preview.ts";

const SID = "preview-test-session";

function installMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  const memory = {
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memory,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  installMemoryLocalStorage();
});

afterEach(() => {
  clearTranscript(SID);
});

describe("getSessionPreview", () => {
  test("returns null when transcript empty", () => {
    expect(getSessionPreview(SID)).toBeNull();
  });

  test("returns last durable message", () => {
    saveTranscript(SID, [
      {
        id: "1",
        role: "user",
        content: "Смотрю в окно",
        createdAt: "2020-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        role: "assistant",
        content: "За стеклом тихо идёт снег.",
        createdAt: "2020-01-01T00:00:01.000Z",
      },
    ]);
    expect(getSessionPreview(SID)).toBe("За стеклом тихо идёт снег.");
  });

  test("clamps long previews", () => {
    const long = "а".repeat(120);
    saveTranscript(SID, [
      {
        id: "1",
        role: "assistant",
        content: long,
        createdAt: "2020-01-01T00:00:00.000Z",
      },
    ]);
    const preview = getSessionPreview(SID, 40);
    expect(preview).not.toBeNull();
    expect(preview!.length).toBeLessThanOrEqual(40);
    expect(preview!.endsWith("…")).toBe(true);
  });
});

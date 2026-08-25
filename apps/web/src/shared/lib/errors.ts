import { ApiError } from "../api/http.ts";
import { COPY } from "../config/copy.ts";

/**
 * Maps technical failures to friendly Russian UI copy.
 *
 * @param err - unknown thrown value
 */
export function toUserMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (
      err.status === 0 ||
      err.code === "network_error" ||
      err.message.toLowerCase().includes("failed to fetch")
    ) {
      return COPY.errors.offline;
    }
    if (err.status === 401 || err.status === 403) {
      return COPY.errors.unauthorized;
    }
    if (err.status === 404) {
      return COPY.errors.notFound;
    }
    if (err.status === 409 || err.code === "session_busy") {
      return COPY.errors.busy;
    }
    if (err.status >= 500) {
      return COPY.errors.server;
    }
    if (err.message && !err.message.startsWith("HTTP ")) {
      return err.message;
    }
    return COPY.common.error;
  }

  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch") || msg.includes("network")) {
      return COPY.errors.offline;
    }
  }

  if (err instanceof Error && err.message.trim()) {
    const lower = err.message.toLowerCase();
    if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return COPY.errors.offline;
    }
    return err.message;
  }

  return COPY.common.error;
}

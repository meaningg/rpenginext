/**
 * Typed HTTP error from the host API.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface PlayerAuth {
  readonly playerId: string;
  readonly token: string;
}

export interface HttpOptions extends Omit<RequestInit, "body" | "headers"> {
  readonly player?: PlayerAuth;
  readonly body?: unknown;
  readonly headers?: HeadersInit;
  readonly accept?: string;
}

/**
 * Builds auth headers for a local player.
 *
 * @param player - credentials
 */
export function authHeaders(player: PlayerAuth): HeadersInit {
  return {
    Authorization: `Bearer ${player.token}`,
    "X-Player-Id": player.playerId,
  };
}

/**
 * Parses JSON and maps non-OK responses to ApiError.
 *
 * @param response - fetch response
 */
export async function parseJson<T>(response: Response): Promise<T> {
  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const err = data as { error?: { message?: string; code?: string } } | null;
    throw new ApiError(
      err?.error?.message ?? `HTTP ${response.status}`,
      response.status,
      err?.error?.code,
    );
  }

  return data as T;
}

/**
 * JSON fetch helper for `/v1` host API.
 *
 * @param path - absolute API path
 * @param options - request options
 */
export async function http<T>(
  path: string,
  options: HttpOptions = {},
): Promise<T> {
  const { player, body, headers, accept, ...rest } = options;
  const merged = new Headers(headers);
  if (player) {
    const auth = authHeaders(player);
    for (const [key, value] of Object.entries(auth)) {
      merged.set(key, value);
    }
  }
  if (body !== undefined && !merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }
  if (accept) {
    merged.set("Accept", accept);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: merged,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch";
    throw new ApiError(message, 0, "network_error");
  }
  return parseJson<T>(response);
}

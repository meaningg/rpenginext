import type { Failure } from "@rpengineext/contracts";

/**
 * JSON error envelope for the API.
 *
 * @param error - failure
 * @param status - HTTP status
 */
export function jsonError(error: Failure, status = 400): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    { status },
  );
}

/**
 * Maps common failure codes to HTTP statuses.
 *
 * @param error - failure
 */
export function statusForFailure(error: Failure): number {
  switch (error.code) {
    case "PERMISSION_DENIED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "CONFIG_INVALID":
    case "SCHEMA_INVALID":
    case "VALIDATION":
      return 400;
    case "INTERNAL":
      if (error.message.includes("SESSION_BUSY")) return 409;
      return 500;
    default:
      if (error.message.includes("SESSION_BUSY")) return 409;
      if (error.message.toLowerCase().includes("not found")) return 404;
      return 400;
  }
}

/**
 * Applies CORS headers for localhost dev.
 *
 * @param response - response
 * @param origin - allowed origin
 */
export function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Player-Id");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Preflight response.
 *
 * @param origin - allowed origin
 */
export function corsPreflight(origin: string): Response {
  return withCors(new Response(null, { status: 204 }), origin);
}

/**
 * Reads JSON body safely.
 *
 * @param request - request
 */
export async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    const value: unknown = await request.json();
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      response: jsonError(
        { code: "SCHEMA_INVALID", message: "invalid JSON body" },
        400,
      ),
    };
  }
}

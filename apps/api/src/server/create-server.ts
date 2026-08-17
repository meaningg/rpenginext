import { CONTRACTS_VERSION } from "@rpengineext/contracts";
import { CORE_VERSION } from "@rpengineext/core";
import type { HostRuntime } from "@rpengineext/host-bootstrap";
import type { Logger } from "@rpengineext/logger";

import {
  CreatePlayerBodySchema,
  CreateSessionBodySchema,
  SubmitActionBodySchema,
} from "../dto/schemas.ts";
import { requireAuth } from "../middleware/auth.ts";
import {
  corsPreflight,
  jsonError,
  readJson,
  statusForFailure,
  withCors,
} from "../middleware/http.ts";
import type { HostDb } from "../persistence/host-db.ts";
import type { SessionService } from "../services/session-service.ts";
import type { TurnService } from "../services/turn-service.ts";
import { SseHub } from "./sse-hub.ts";

export interface ApiServerDeps {
  readonly runtime: HostRuntime;
  readonly hostDb: HostDb;
  readonly sessions: SessionService;
  readonly turns: TurnService;
  readonly log: Logger;
}

/**
 * Starts Bun HTTP server for the game API.
 *
 * @param deps - wired services
 */
export function createApiServer(deps: ApiServerDeps) {
  const { runtime, hostDb, sessions, turns, log } = deps;
  const sse = new SseHub(runtime.events);
  const origin = runtime.env.corsOrigin;

  const server = Bun.serve({
    hostname: runtime.env.httpHost,
    port: runtime.env.httpPort,
    idleTimeout: 255,
    fetch: async (request, bunServer) => {
      try {
        if (request.method === "OPTIONS") {
          return corsPreflight(origin);
        }
        const response = await handle(request, bunServer);
        return withCors(response, origin);
      } catch (error) {
        log.error({ err: error }, "unhandled API error");
        return withCors(
          jsonError(
            { code: "INTERNAL", message: "internal server error" },
            500,
          ),
          origin,
        );
      }
    },
  });

  log.info(
    { url: String(server.url), origin },
    "API server listening",
  );

  return {
    server,
    sse,
    stop: async () => {
      sse.close();
      server.stop(true);
      hostDb.close();
      await runtime.stop();
    },
  };

  async function handle(
    request: Request,
    bunServer: { timeout: (req: Request, seconds: number) => void },
  ): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/health") {
      return Response.json({
        ok: true,
        coreVersion: CORE_VERSION,
        contractsVersion: CONTRACTS_VERSION,
        agentsMode: runtime.env.agentsMode,
        streaming: runtime.env.agentsStreaming,
      });
    }

    if (request.method === "POST" && pathname === "/v1/players") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const parsed = CreatePlayerBodySchema.safeParse(body.value ?? {});
      if (!parsed.success) {
        return jsonError(
          { code: "SCHEMA_INVALID", message: "invalid create player body" },
          400,
        );
      }
      const created = hostDb.createPlayer(parsed.data.displayName);
      if (!created.ok) {
        return jsonError(created.error, statusForFailure(created.error));
      }
      return Response.json(
        {
          playerId: created.value.player.playerId,
          displayName: created.value.player.displayName,
          createdAt: created.value.player.createdAt,
          token: created.value.token,
        },
        { status: 201 },
      );
    }

    if (request.method === "GET" && pathname === "/v1/templates") {
      return Response.json({
        templates: sessions.listTemplates().map(publicTemplate),
      });
    }

    if (request.method === "GET" && pathname.startsWith("/v1/templates/")) {
      const id = decodeURIComponent(pathname.slice("/v1/templates/".length));
      const template = sessions.getTemplate(id);
      if (!template) {
        return jsonError(
          { code: "NOT_FOUND", message: `template not found: ${id}` },
          404,
        );
      }
      return Response.json({ template: publicTemplate(template) });
    }

    // Remaining routes require auth
    const auth = requireAuth(request, hostDb);
    if (!auth.ok) return auth.response;
    const player = auth.value.player;

    if (request.method === "GET" && pathname === "/v1/sessions") {
      const list = sessions.listForPlayer(player);
      if (!list.ok) return jsonError(list.error, statusForFailure(list.error));
      return Response.json({ sessions: list.value });
    }

    if (request.method === "POST" && pathname === "/v1/sessions") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const parsed = CreateSessionBodySchema.safeParse(body.value);
      if (!parsed.success) {
        return jsonError(
          { code: "SCHEMA_INVALID", message: "invalid create session body" },
          400,
        );
      }
      const created = await sessions.createFromTemplate(player, parsed.data);
      if (!created.ok) {
        return jsonError(created.error, statusForFailure(created.error));
      }
      return Response.json(created.value, { status: 201 });
    }

    const sessionMatch = pathname.match(/^\/v1\/sessions\/([^/]+)(.*)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
      const rest = sessionMatch[2] ?? "";

      if (request.method === "GET" && rest === "") {
        const view = await sessions.getViewForOwner(player, sessionId);
        if (!view.ok) {
          return jsonError(view.error, statusForFailure(view.error));
        }
        return Response.json({ session: view.value });
      }

      if (request.method === "GET" && rest === "/passage") {
        const view = await sessions.getViewForOwner(player, sessionId);
        if (!view.ok) {
          return jsonError(view.error, statusForFailure(view.error));
        }
        return Response.json({ passage: view.value.passage });
      }

      if (request.method === "POST" && rest === "/save") {
        const saved = await sessions.save(player, sessionId);
        if (!saved.ok) {
          return jsonError(saved.error, statusForFailure(saved.error));
        }
        return Response.json(saved.value);
      }

      if (request.method === "POST" && rest === "/actions") {
        const body = await readJson(request);
        if (!body.ok) return body.response;
        const parsed = SubmitActionBodySchema.safeParse(body.value);
        if (!parsed.success) {
          return jsonError(
            { code: "SCHEMA_INVALID", message: "invalid action body" },
            400,
          );
        }
        const wait = url.searchParams.get("wait") === "1";
        const submitted = await sessions.submitAction(
          player,
          sessionId,
          parsed.data,
          wait,
        );
        if (!submitted.ok) {
          const status =
            submitted.error.message.includes("SESSION_BUSY")
              ? 409
              : statusForFailure(submitted.error);
          return jsonError(submitted.error, status);
        }
        if (submitted.value.mode === "sync") {
          return Response.json(submitted.value.result);
        }
        return Response.json(submitted.value, { status: 202 });
      }

      if (request.method === "GET" && rest.startsWith("/turns/")) {
        const turnId = decodeURIComponent(rest.slice("/turns/".length));
        const job = turns.getJob(turnId);
        if (!job || job.sessionId !== sessionId) {
          return jsonError(
            { code: "NOT_FOUND", message: `turn not found: ${turnId}` },
            404,
          );
        }
        const owned = await sessions.ensureAttached(player, sessionId);
        if (!owned.ok) {
          return jsonError(owned.error, statusForFailure(owned.error));
        }
        return Response.json({ job });
      }

      if (request.method === "GET" && rest === "/events") {
        const owned = await sessions.ensureAttached(player, sessionId);
        if (!owned.ok) {
          return jsonError(owned.error, statusForFailure(owned.error));
        }
        return sse.openStream(sessionId, request, bunServer);
      }
    }

    return jsonError({ code: "NOT_FOUND", message: "route not found" }, 404);
  }
}

function publicTemplate(template: {
  id: string;
  version: string;
  title: string;
  synopsis: string;
  tags: string[];
  locale?: string;
}) {
  return {
    id: template.id,
    version: template.version,
    title: template.title,
    synopsis: template.synopsis,
    tags: template.tags,
    locale: template.locale,
  };
}

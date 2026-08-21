import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { clearTranscript } from "../../shared/lib/chat-transcript.ts";
import { ensurePlayer } from "../player/api.ts";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  renameSession,
  saveSession,
} from "./api.ts";
import type { SessionSummary, SessionView } from "./model.ts";

export const sessionKeys = {
  root: ["sessions"] as const,
  list: () => [...sessionKeys.root, "list"] as const,
  detail: (sessionId: string) =>
    [...sessionKeys.root, "detail", sessionId] as const,
};

/**
 * Player session resume list.
 */
export function useSessionsQuery() {
  return useQuery<SessionSummary[]>({
    queryKey: sessionKeys.list(),
    queryFn: async () => {
      const player = await ensurePlayer();
      return listSessions(player);
    },
  });
}

/**
 * Single session hydrate for play.
 *
 * @param sessionId - session id
 */
export function useSessionQuery(sessionId: string) {
  return useQuery<SessionView>({
    queryKey: sessionKeys.detail(sessionId),
    queryFn: async () => {
      const player = await ensurePlayer();
      return getSession(player, sessionId);
    },
    enabled: Boolean(sessionId),
  });
}

/**
 * Create session from template and invalidate list cache.
 */
export function useCreateSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { templateId: string; title?: string }) => {
      const player = await ensurePlayer();
      return createSession(player, input.templateId, input.title);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: sessionKeys.list() });
      queryClient.setQueryData(
        sessionKeys.detail(result.session.sessionId),
        result.session,
      );
    },
  });
}

/**
 * Rename session and patch caches.
 */
export function useRenameSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId: string; title: string }) => {
      const player = await ensurePlayer();
      return renameSession(player, input.sessionId, input.title);
    },
    onSuccess: async (session) => {
      queryClient.setQueryData<SessionSummary[]>(sessionKeys.list(), (prev) =>
        prev?.map((row) =>
          row.sessionId === session.sessionId
            ? {
                ...row,
                title: session.title,
                updatedAt: session.updatedAt,
              }
            : row,
        ),
      );
      queryClient.setQueryData<SessionView>(
        sessionKeys.detail(session.sessionId),
        (prev) =>
          prev
            ? {
                ...prev,
                title: session.title,
                updatedAt: session.updatedAt,
              }
            : prev,
      );
    },
  });
}

/**
 * Delete session, clear local transcript, refresh list.
 */
export function useDeleteSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const player = await ensurePlayer();
      await deleteSession(player, sessionId);
      clearTranscript(sessionId);
      return sessionId;
    },
    onSuccess: async (sessionId) => {
      queryClient.setQueryData<SessionSummary[]>(sessionKeys.list(), (prev) =>
        prev?.filter((row) => row.sessionId !== sessionId),
      );
      queryClient.removeQueries({ queryKey: sessionKeys.detail(sessionId) });
    },
  });
}

/**
 * Explicit save mutation.
 */
export function useSaveSessionMutation() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const player = await ensurePlayer();
      return saveSession(player, sessionId);
    },
  });
}

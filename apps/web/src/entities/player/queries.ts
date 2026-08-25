import { useQuery } from "@tanstack/react-query";

import { ensurePlayer } from "./api.ts";
import type { PlayerCredentials } from "./model.ts";

export const playerKeys = {
  root: ["player"] as const,
  me: () => [...playerKeys.root, "me"] as const,
};

/**
 * Resolves (and caches) the local player identity.
 */
export function usePlayerQuery() {
  return useQuery<PlayerCredentials>({
    queryKey: playerKeys.me(),
    queryFn: () => ensurePlayer(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

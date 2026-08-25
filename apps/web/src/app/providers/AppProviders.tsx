import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import {
  ToastProvider,
  TooltipProvider,
} from "../../design-system/index.ts";
import { createQueryClient } from "./query-client.ts";

/**
 * Root app providers.
 */
export function AppProviders({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

import type { ReactNode } from "react";

import { ToastProvider } from "../../shared/ui/Toast.tsx";

/**
 * Root app providers.
 */
export function AppProviders({ children }: { readonly children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

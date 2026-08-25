import type { ReactNode } from "react";

import { AppShell } from "../app-shell/AppShell.tsx";

/**
 * Play mode uses the same product shell as browse for visual continuity.
 */
export function PlayShell({ children }: { readonly children: ReactNode }) {
  return <AppShell variant="immersive">{children}</AppShell>;
}

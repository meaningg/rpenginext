import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { cn } from "../lib/cn.ts";

type ToastTone = "info" | "success" | "error";

interface ToastItem {
  readonly id: string;
  readonly message: string;
  readonly tone: ToastTone;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Provides toast notifications to the tree.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rounded-full border px-4 py-2 text-sm shadow-lg shadow-black/40 backdrop-blur-md",
              item.tone === "success" &&
                "border-emerald-500/30 bg-emerald-500/15 text-emerald-50",
              item.tone === "error" &&
                "border-rose-500/30 bg-rose-500/15 text-rose-50",
              item.tone === "info" &&
                "border-white/10 bg-zinc-900/90 text-zinc-100",
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access toast API.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

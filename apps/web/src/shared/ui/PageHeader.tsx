import type { ReactNode } from "react";

/**
 * Browse page title block.
 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  action,
}: {
  readonly kicker?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {kicker ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-orange-300/80">
            {kicker}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-[2rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-xl text-[15px] leading-relaxed text-zinc-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

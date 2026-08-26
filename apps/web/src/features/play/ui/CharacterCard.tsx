import { ScrollArea } from "../../../design-system/index.ts";
import { COPY } from "../../../shared/config/copy.ts";
import type { CharacterProfile } from "../../../entities/session/model.ts";

/**
 * Character summary row: label + current value.
 */
function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="space-y-0.5 px-4 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-faint">
        {label}
      </p>
      <p className="text-[13px] leading-relaxed text-fg">
        {value || "—"}
      </p>
    </div>
  );
}

/**
 * Current player-character card (live `character.profile` read-model).
 * Shown inside the play inspector panel.
 */
export function CharacterCard({
  profile,
}: {
  readonly profile: CharacterProfile | null;
}) {
  if (!profile) {
    return (
      <p className="px-4 py-8 text-sm text-fg-faint">
        {COPY.character.unavailable}
      </p>
    );
  }

  if (!profile.present) {
    return (
      <div className="space-y-1 px-4 py-8">
        <p className="text-sm font-medium text-fg">{COPY.character.emptyTitle}</p>
        <p className="text-[13px] text-fg-muted">{COPY.character.emptyBody}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="border-b border-border px-4 pb-3 pt-4">
        <h2 className="text-base font-semibold tracking-tight text-fg">
          {profile.name}
        </h2>
        <p className="mt-0.5 text-[11px] text-fg-faint">
          {COPY.character.tab}
        </p>
      </div>
      <div className="divide-y divide-border">
        <Field label={COPY.character.appearance} value={profile.appearance} />
        <Field label={COPY.character.features} value={profile.features} />
        <Field label={COPY.character.outfit} value={profile.outfit} />
      </div>
    </ScrollArea>
  );
}
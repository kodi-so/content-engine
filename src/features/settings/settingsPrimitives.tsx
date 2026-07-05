import {
  BriefcaseBusiness,
  KeyRound,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AiGenerationMode } from "../../lib/providers/aiGenerationDefaults";

export type { AiGenerationMode } from "../../lib/providers/aiGenerationDefaults";

export const DEFAULT_MCP_KEY_NAME = "Codex";

export type SettingsTab = "profile" | "general" | "ai" | "members" | "access";
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type InviteRole = Exclude<WorkspaceRole, "owner">;

export const settingsTabs: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof BriefcaseBusiness;
}> = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "general", label: "General", icon: BriefcaseBusiness },
  { id: "ai", label: "AI providers", icon: Sparkles },
  { id: "members", label: "Members", icon: UsersRound },
  { id: "access", label: "Agent access", icon: KeyRound },
];

export const inviteRoleOptions: Array<{ value: InviteRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

export const memberRoleOptions: Array<{ value: WorkspaceRole; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

export const settingsInputClass =
  "min-h-[2.85rem] w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] text-[0.95rem] font-[520] text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.13)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)]";

export const generationModeLabels: Record<AiGenerationMode, string> = {
  image: "Image generation",
  video: "Video generation",
  audio: "Audio generation",
  lipsync: "Lip sync generation",
  videoAnalysis: "Video analysis",
};

export const generationModeNotes: Record<AiGenerationMode, string> = {
  image: "Sets the default provider and model for Create image generation.",
  video: "Sets the default provider and model for Create video generation.",
  audio: "Sets the default provider and model for Create audio generation.",
  lipsync: "Sets the default provider and model for Create lip sync generation.",
  videoAnalysis: "Sets which multimodal provider the Analyze tab uses for transcripts, scene reads, audio notes, and inspiration briefs.",
};

export function formatSettingsDate(timestamp?: number) {
  if (!timestamp) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function settingsErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function isWorkingStatus(message: string) {
  return /^(Saving|Updating|Removing|Creating)/.test(message);
}

export function SettingsTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof BriefcaseBusiness;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "inline-flex min-h-[2.65rem] items-center gap-[var(--space-2)] border-b-2 px-[var(--space-2)] text-[0.9rem] font-[720] transition",
        active
          ? "border-[var(--color-ink)] text-[var(--color-ink)]"
          : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]",
      ].join(" ")}
      type="button"
      onClick={onClick}
    >
      <Icon size={16} strokeWidth={1.9} />
      {label}
    </button>
  );
}

export function SettingRow({
  children,
  label,
  note,
}: {
  children: ReactNode;
  label: string;
  note: string;
}) {
  return (
    <div className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] py-[var(--space-4)] md:grid-cols-[13.5rem_minmax(0,1fr)] md:items-start">
      <div>
        <div className="text-[0.86rem] font-[780] leading-[1.25] text-[var(--color-ink)]">{label}</div>
        <p className="mt-[0.3rem] text-[0.8rem] leading-[1.45] text-[var(--color-muted)]">{note}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

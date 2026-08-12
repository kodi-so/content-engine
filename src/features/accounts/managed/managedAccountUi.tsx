import type { Doc } from "../../../../convex/_generated/dataModel";
import type { SocialAccount } from "../accountDisplay";

export type AccountDetail = {
  account: SocialAccount;
  insights: Doc<"accountInsights">[];
  pendingApprovalCount: number;
  posts: Doc<"accountPosts">[];
  publishedCount: number;
  references: Array<Doc<"accountReferences"> & { asset: Doc<"creativeAssets"> }>;
  runs: Doc<"accountAgentRuns">[];
};

export const managedInputClassName = "min-h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-2 text-[0.88rem] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.12)]";
export const managedTextareaClassName = `${managedInputClassName} min-h-24 resize-y leading-relaxed`;
export const managedLabelClassName = "grid gap-1.5 text-[0.74rem] font-[720] text-[var(--color-ink-muted)]";

export function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function joinLines(value: string[] | undefined) {
  return (value ?? []).join("\n");
}

export function formatAccountDate(value: number | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function statusTone(status: string) {
  if (status === "published" || status === "completed" || status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "failed" || status === "needs_revision") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (status === "awaiting_approval") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)]";
}

export function AccountStatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-[760] ${statusTone(status)}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ManagedSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1">
      <h3 className="m-0 text-[0.96rem] font-[780] text-[var(--color-ink)]">{title}</h3>
      <p className="m-0 max-w-3xl text-[0.8rem] leading-relaxed text-[var(--color-ink-muted)]">{description}</p>
    </div>
  );
}

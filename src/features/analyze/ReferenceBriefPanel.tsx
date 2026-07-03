import {
  AlertTriangle,
  Eye,
  FileText,
  Layers3,
  Lightbulb,
  type LucideIcon,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { ReferenceBrief } from "./referenceBriefModel";

function cleanRows(items?: string[]) {
  return items?.filter((item) => item.trim()) ?? [];
}

function BriefList({ items }: { items?: string[] }) {
  const rows = cleanRows(items);
  if (!rows.length) return null;

  return (
    <ul className="m-0 grid list-none gap-[var(--space-2)] p-0">
      {rows.slice(0, 8).map((item, index) => (
        <li
          className="grid grid-cols-[1.1rem_minmax(0,1fr)] gap-[var(--space-2)] text-[0.84rem] leading-[1.45] text-[var(--color-ink)]"
          key={`${item}-${index}`}
        >
          <span className="mt-[0.36rem] size-1.5 rounded-full bg-[var(--color-primary)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BriefField({
  children,
  icon: Icon,
  label,
}: {
  children?: string;
  icon: LucideIcon;
  label: string;
}) {
  if (!children?.trim()) return null;

  return (
    <div className="grid gap-[var(--space-1)]">
      <span className="inline-flex items-center gap-[var(--space-1)] text-[0.72rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
        <Icon size={13} strokeWidth={2} />
        {label}
      </span>
      <p className="m-0 text-[0.88rem] leading-[1.5] text-[var(--color-ink)]">
        {children}
      </p>
    </div>
  );
}

function BriefListField({
  icon: Icon,
  items,
  label,
}: {
  icon: LucideIcon;
  items?: string[];
  label: string;
}) {
  if (!cleanRows(items).length) return null;

  return (
    <div className="grid gap-[var(--space-2)]">
      <span className="inline-flex items-center gap-[var(--space-1)] text-[0.72rem] font-[820] uppercase tracking-[0.06em] text-[var(--color-muted)]">
        <Icon size={13} strokeWidth={2} />
        {label}
      </span>
      <BriefList items={items} />
    </div>
  );
}

export function ReferenceBriefPanel({
  brief,
  className = "",
  summary,
  title = "Reference brief",
  variant = "standalone",
}: {
  brief?: ReferenceBrief;
  className?: string;
  summary?: string;
  title?: string;
  variant?: "standalone" | "embedded";
}) {
  if (!brief) return null;

  const sourceType = brief.sourceType && brief.sourceType !== "unknown" ? brief.sourceType : undefined;
  const containerClass = variant === "embedded"
    ? "grid min-w-0 gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-3)]"
    : "border-t border-[var(--color-border)] py-[var(--space-5)]";

  return (
    <section className={`${containerClass} ${className}`.trim()}>
      <div className="mb-[var(--space-3)] flex flex-wrap items-start justify-between gap-[var(--space-2)]">
        <div className="flex min-w-0 items-center gap-[var(--space-2)]">
          <Sparkles size={17} className="shrink-0 text-[var(--color-primary)]" strokeWidth={1.9} />
          <h2 className="m-0 text-[1rem] font-[820] leading-[1.2] text-[var(--color-ink)]">
            {title}
          </h2>
        </div>
        {sourceType ? (
          <span className="rounded-full border border-[var(--color-border)] px-[var(--space-2)] py-[0.18rem] text-[0.7rem] font-[760] capitalize text-[var(--color-muted)]">
            {sourceType}
          </span>
        ) : null}
      </div>

      {brief.oneLineSummary || summary ? (
        <p className="m-0 max-w-[52rem] text-[0.94rem] leading-[1.55] text-[var(--color-ink)]">
          {brief.oneLineSummary ?? summary}
        </p>
      ) : null}

      <div className="mt-[var(--space-4)] grid gap-[var(--space-4)] lg:grid-cols-2">
        <BriefField icon={Lightbulb} label="Core idea">
          {brief.coreIdea}
        </BriefField>
        <BriefField icon={Sparkles} label="Hook">
          {brief.hook}
        </BriefField>
        <BriefField icon={Layers3} label="Reusable pattern">
          {brief.reusablePattern}
        </BriefField>
        <BriefField icon={Volume2} label="Audio role">
          {brief.audioRole}
        </BriefField>
      </div>

      <div className="mt-[var(--space-4)] grid gap-[var(--space-4)] lg:grid-cols-2">
        <BriefListField icon={Layers3} items={brief.structure} label="Structure" />
        <BriefListField icon={Eye} items={brief.keyVisuals} label="Key visuals" />
        <BriefListField icon={FileText} items={brief.visibleText} label="Visible text" />
        <BriefListField icon={AlertTriangle} items={brief.doNotCopy} label="Do not copy" />
        <BriefListField icon={Lightbulb} items={brief.suggestedUses} label="Suggested uses" />
      </div>
    </section>
  );
}

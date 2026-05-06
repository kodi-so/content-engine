import { Panel } from "../../components/ui";
import type { CreativePlan } from "./types";
import type { ContentRequestDoc } from "./viewTypes";

type CreativePlanPanelProps = {
  activeRequest?: ContentRequestDoc;
  plan?: CreativePlan;
};

function formatPlanValue(value?: string) {
  if (!value) return "";
  return value.replace(/_/g, " ");
}

export function CreativePlanPanel({ activeRequest, plan }: CreativePlanPanelProps) {
  const title = plan?.title || activeRequest?.prompt;
  const productionMode = formatPlanValue(
    plan?.renderingMode || activeRequest?.requestedRenderingMode,
  );
  const planStats = [
    activeRequest?.status && { label: "Status", value: activeRequest.status },
    plan?.slides && { label: "Slides", value: String(plan.slides.length) },
    productionMode && { label: "Production", value: productionMode },
    plan?.strategy?.narrativePattern && {
      label: "Pattern",
      value: plan.strategy.narrativePattern,
    },
    plan?.strategy?.tone && { label: "Tone", value: plan.strategy.tone },
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const creativeBrief =
    plan?.creativeBrief ||
    activeRequest?.summary ||
    (activeRequest ? "The creative plan will appear here once planning finishes." : undefined);
  const hookIsTitle =
    plan?.hook && title && plan.hook.trim().toLowerCase() === title.trim().toLowerCase();
  const planNotes = [
    creativeBrief && { label: "Brief", value: creativeBrief },
    plan?.visualSystem && { label: "Visual", value: plan.visualSystem },
    plan?.hook && !hookIsTitle && { label: "Hook", value: plan.hook },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <Panel className="gap-[var(--space-3)]" title="Creative Plan">
      {!activeRequest && <p className="muted">Generate a preview to see the agent's plan.</p>}
      {activeRequest && (
        <div className="grid gap-[var(--space-3)]">
          <h3 className="m-0 text-[1.08rem] font-[680] leading-[1.22] [overflow-wrap:anywhere]">
            {title}
          </h3>
          {planStats.length > 0 && (
            <div className="flex flex-wrap gap-[var(--space-2)]">
              {planStats.map((item) => (
                <span
                  className="inline-flex max-w-full items-center gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-[0.62rem] py-[0.38rem] text-[0.78rem] leading-[1.15] text-[var(--color-ink-muted)]"
                  key={item.label}
                >
                  <span className="font-bold text-[var(--color-ink-faint)]">
                    {item.label}
                  </span>
                  <strong className="min-w-0 font-[680] text-[var(--color-ink)] [overflow-wrap:anywhere]">
                    {item.value}
                  </strong>
                </span>
              ))}
            </div>
          )}
          <div className="grid gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-3)]">
            <span className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
              Original prompt
            </span>
            <p className="m-0 text-[0.86rem] leading-[1.35] text-[var(--color-ink)] [overflow-wrap:anywhere]">
              {activeRequest.prompt}
            </p>
          </div>
          {activeRequest.errorMessage && (
            <p className="error-note">{activeRequest.errorMessage}</p>
          )}
          {planNotes.length > 0 && (
            <div className="grid gap-[var(--space-2)]">
              {planNotes.map((item) => (
                <p
                  className="m-0 line-clamp-2 text-[0.84rem] leading-[1.35] text-[var(--color-ink-muted)] [overflow-wrap:anywhere]"
                  key={item.label}
                  title={item.value}
                >
                  <span className="mr-[var(--space-1)] font-bold text-[var(--color-ink-soft)]">
                    {item.label}
                  </span>
                  {item.value}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

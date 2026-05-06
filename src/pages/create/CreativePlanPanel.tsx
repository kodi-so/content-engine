import { Panel } from "../../components/ui";
import type { CreativePlan } from "./types";
import type { ContentRequestDoc } from "./viewTypes";

type CreativePlanPanelProps = {
  activeRequest?: ContentRequestDoc;
  plan?: CreativePlan;
};

export function CreativePlanPanel({ activeRequest, plan }: CreativePlanPanelProps) {
  return (
    <Panel title="Creative Plan">
      {!activeRequest && <p className="muted">Generate a preview to see the agent's plan.</p>}
      {activeRequest && (
        <div className="grid gap-[var(--space-3)]">
          <div className="entity-eyebrow">{activeRequest.status}</div>
          <h3 className="m-0 text-[1.12rem] font-[650] leading-[1.25] [overflow-wrap:anywhere]">
            {plan?.title || activeRequest.prompt}
          </h3>
          <div className="grid gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-[var(--space-3)]">
            <span className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
              Original prompt
            </span>
            <p className="m-0 text-[0.92rem] leading-[1.45] text-[var(--color-ink)] [overflow-wrap:anywhere]">
              {activeRequest.prompt}
            </p>
          </div>
          <p className="m-0 leading-[1.5] text-[var(--color-ink-muted)]">
            {plan?.creativeBrief ||
              activeRequest.summary ||
              "The creative plan will appear here once planning finishes."}
          </p>
          {activeRequest.errorMessage && (
            <p className="error-note">{activeRequest.errorMessage}</p>
          )}
          {plan?.slides && (
            <div className="status-row">
              <span>Planned slides</span>
              <strong>{plan.slides.length}</strong>
            </div>
          )}
          {(plan?.renderingMode || activeRequest.requestedRenderingMode) && (
            <div className="status-row">
              <span>Production</span>
              <strong>{plan?.renderingMode || activeRequest.requestedRenderingMode}</strong>
            </div>
          )}
          {plan?.visualSystem && (
            <div className="status-row">
              <span>Visual system</span>
              <strong>{plan.visualSystem}</strong>
            </div>
          )}
          {plan?.hook && (
            <div className="status-row">
              <span>Hook</span>
              <strong>{plan.hook}</strong>
            </div>
          )}
          {plan?.strategy && (
            <>
              <div className="status-row">
                <span>Pattern</span>
                <strong>{plan.strategy.narrativePattern}</strong>
              </div>
              <div className="status-row">
                <span>Tone</span>
                <strong>{plan.strategy.tone}</strong>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

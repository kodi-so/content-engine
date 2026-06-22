import { AlertCircle, CheckCircle2, ChevronRight, Circle, PauseCircle, RotateCcw } from "lucide-react";
import { LoadingSignal } from "../../components/ui";
import { AgentCreateMediaResultGrid } from "./AgentCreateArtifactCard";
import type {
  AgentCreateArtifact,
  AgentCreateToolProgressStep,
  AgentCreateToolStatus,
} from "./agentCreateTypes";
import { agentCreateClassNames } from "./agentCreateUi";

function statusTone(status: AgentCreateToolStatus) {
  switch (status) {
    case "succeeded":
      return "border-[oklch(70%_0.105_155_/_0.45)] bg-[oklch(94%_0.045_155)] text-[oklch(34%_0.105_155)]";
    case "failed":
      return "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]";
    case "running":
      return "border-[var(--color-accent)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]";
    case "blocked":
      return "border-[var(--color-border)] bg-[var(--color-page-quiet)] text-[var(--color-ink-muted)]";
    case "canceled":
      return "border-[var(--color-border)] bg-[var(--color-page-quiet)] text-[var(--color-ink-muted)]";
    case "queued":
      return "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]";
  }
}

function ToolStatusIcon({ status }: { status: AgentCreateToolStatus }) {
  if (status === "running") return <LoadingSignal label="Running" size="sm" />;
  if (status === "succeeded") return <CheckCircle2 size={16} />;
  if (status === "failed") return <AlertCircle size={16} />;
  if (status === "blocked") return <PauseCircle size={16} />;
  if (status === "canceled") return <PauseCircle size={16} />;
  return <Circle size={14} />;
}

function splitModelDetail(detail: string) {
  const separator = " - ";
  const index = detail.indexOf(separator);
  if (index < 0) return { prompt: detail };
  return {
    model: detail.slice(0, index).trim(),
    prompt: detail.slice(index + separator.length).trim(),
  };
}

export function ToolProgressTimeline({
  className,
  isRetrying,
  onArtifactOpen,
  onArtifactPreview,
  onRetry,
  steps,
  title = "Production timeline",
}: {
  className?: string;
  isRetrying?: (step: AgentCreateToolProgressStep) => boolean;
  onArtifactOpen?: (artifact: AgentCreateArtifact) => void;
  onArtifactPreview?: (artifact: AgentCreateArtifact) => void;
  onRetry?: (step: AgentCreateToolProgressStep) => void;
  steps: AgentCreateToolProgressStep[];
  title?: string;
}) {
  if (!steps.length) return null;

  return (
    <section className={agentCreateClassNames("grid min-w-0 gap-[var(--space-3)]", className)}>
      <div className="flex min-w-0 items-center justify-between gap-[var(--space-3)]">
        <h3 className="m-0 text-[0.86rem] font-[820] text-[var(--color-ink)]">{title}</h3>
        <span className="text-[0.72rem] font-[720] text-[var(--color-ink-muted)]">
          {steps.filter((step) => step.status === "succeeded").length} / {steps.length} complete
        </span>
      </div>

      <ol className="grid min-w-0 gap-[var(--space-2)]">
        {steps.map((step, index) => {
          const detail = step.detail ? splitModelDetail(step.detail) : null;
          const resultArtifacts = (step.artifacts ?? []).filter((artifact) =>
            artifact.status === "ready" &&
            !artifact.id.startsWith("studio:") &&
            artifact.url !== undefined &&
            !artifact.url.startsWith("/studio")
          );

          return (
            <li
              className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-[var(--space-2)]"
              key={step.id}
            >
            <div className="grid justify-items-center">
              <span
                className={agentCreateClassNames(
                  "grid size-7 place-items-center rounded-full border",
                  statusTone(step.status)
                )}
              >
                <ToolStatusIcon status={step.status} />
              </span>
              {index < steps.length - 1 ? (
                <span className="h-full min-h-5 w-px bg-[var(--color-border)]" />
              ) : null}
            </div>

            <div className="min-w-0 pb-[var(--space-3)]">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-2)] gap-y-1">
                <strong className="text-[0.84rem] font-[780] text-[var(--color-ink)]">
                  {step.label}
                </strong>
                {step.costLabel ? (
                  <span className="text-[0.7rem] font-[700] text-[var(--color-ink-muted)]">
                    {step.costLabel}
                  </span>
                ) : null}
              </div>
              {detail ? (
                <div className="mt-1 grid min-w-0 justify-items-start gap-1">
                  {detail.model ? (
                    <span className="inline-flex max-w-full items-center rounded-full border border-[var(--color-border)] bg-[var(--color-page-quiet)] px-2 py-0.5 text-[0.68rem] font-[760] leading-[1.2] text-[var(--color-ink-soft)]">
                      <span className="truncate">{detail.model}</span>
                    </span>
                  ) : null}
                  <p className="m-0 whitespace-normal break-words text-[0.76rem] leading-[1.4] text-[var(--color-ink-muted)]">
                    {detail.prompt}
                  </p>
                </div>
              ) : null}
              {step.errorMessage ? (
                <p
                  className="m-0 mt-1 max-h-[4.2rem] overflow-hidden break-words text-[0.76rem] leading-[1.4] text-[var(--color-danger)]"
                  title={step.errorMessage}
                >
                  {step.errorMessage}
                </p>
              ) : null}
              {step.status === "failed" && onRetry ? (
                <button
                  className="secondary-button mt-2 min-h-8 px-2 py-1 text-[0.76rem]"
                  disabled={isRetrying?.(step)}
                  onClick={() => onRetry(step)}
                  type="button"
                >
                  {isRetrying?.(step) ? (
                    <LoadingSignal label="Retrying" size="sm" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  Retry
                </button>
              ) : null}
              {resultArtifacts.length ? (
                <details className="group/result mt-2 grid min-w-0 justify-items-start">
                  <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[0.72rem] font-[780] text-[var(--color-ink-soft)] transition hover:bg-[var(--color-page-quiet)] marker:hidden">
                    <ChevronRight
                      className="transition-transform group-open/result:rotate-90"
                      size={13}
                    />
                    Result
                  </summary>
                  <div className="mt-2 w-full max-w-[min(24rem,100%)]">
                    <AgentCreateMediaResultGrid
                      artifacts={resultArtifacts}
                      onPreview={onArtifactPreview ?? onArtifactOpen}
                    />
                  </div>
                </details>
              ) : null}
            </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

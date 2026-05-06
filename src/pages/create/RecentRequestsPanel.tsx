import type { CSSProperties } from "react";
import { Panel } from "../../components/ui";
import type { ContentRequestDoc } from "./viewTypes";

type RecentRequestsPanelProps = {
  activeRequest?: ContentRequestDoc;
  contentRequests?: ContentRequestDoc[];
  maxDesktopHeight?: number;
  onSelectRequest: (requestId: string) => void;
};

export function RecentRequestsPanel({
  activeRequest,
  contentRequests,
  maxDesktopHeight,
  onSelectRequest,
}: RecentRequestsPanelProps) {
  return (
    <Panel
      className="min-[901px]:grid-rows-[auto_minmax(0,1fr)] min-[901px]:overflow-hidden min-[901px]:max-h-[var(--recent-requests-max-height)]"
      style={
        maxDesktopHeight
          ? ({ "--recent-requests-max-height": `${maxDesktopHeight}px` } as CSSProperties)
          : undefined
      }
      title="Recent Requests"
    >
      {!contentRequests && <p className="muted">Loading requests...</p>}
      {contentRequests?.length === 0 && (
        <p className="muted">No one-off content requests yet.</p>
      )}
      <div className="grid min-h-0 gap-[var(--space-2)] min-[901px]:overflow-y-auto min-[901px]:pr-[var(--space-1)] min-[901px]:[-webkit-overflow-scrolling:touch]">
        {contentRequests?.map((request) => (
          <button
            className={[
              "grid w-full min-w-0 cursor-pointer gap-[var(--space-2)] rounded-[var(--radius-md)] border p-[var(--space-3)] text-left text-[var(--color-ink)] transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-[180ms] ease-[var(--ease-out)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-tinted)]",
              activeRequest?._id === request._id
                ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-[var(--focus-ring)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-raised)]",
            ].join(" ")}
            key={request._id}
            type="button"
            onClick={() => onSelectRequest(String(request._id))}
          >
            <span className="w-fit max-w-full rounded-full bg-[var(--color-primary-soft)] px-[0.58rem] py-[0.32rem] text-[0.72rem] font-bold leading-[1.1] text-[var(--color-primary-strong)] [overflow-wrap:anywhere]">
              {request.status}
            </span>
            <strong className="min-w-0 text-[0.92rem] font-[650] leading-[1.35] text-[var(--color-ink)] [overflow-wrap:anywhere]">
              {request.summary || request.prompt}
            </strong>
            {request.summary && (
              <p className="m-0 line-clamp-2 text-[0.84rem] leading-[1.4] text-[var(--color-ink-muted)] [overflow-wrap:anywhere]">
                {request.prompt}
              </p>
            )}
            <small className="text-[0.78rem] text-[var(--color-ink-muted)]">
              {new Date(request.createdAt).toLocaleString()}
            </small>
          </button>
        ))}
      </div>
    </Panel>
  );
}

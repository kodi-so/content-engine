import { BarChart3, CalendarClock, Megaphone, RefreshCw, Trash2 } from "lucide-react";
import { Panel } from "../ui";
import type { DistributionPlanDoc } from "../../types";

export function DistributionPlansPanel({
  plans,
  planStatus,
  publishPlan,
  syncPlanStatus,
  syncPlanMetrics,
  removePlan,
}: {
  plans?: DistributionPlanDoc[];
  planStatus: string;
  publishPlan: (plan: DistributionPlanDoc) => Promise<void>;
  syncPlanStatus: (plan: DistributionPlanDoc) => Promise<void>;
  syncPlanMetrics: (plan: DistributionPlanDoc) => Promise<void>;
  removePlan: (plan: DistributionPlanDoc) => Promise<void>;
}) {
  return (
    <Panel title="Distribution Plans">
      {planStatus && <p className="muted">{planStatus}</p>}
      <div className="entity-grid">
        {plans?.map((plan) => {
          const canPublish = plan.status === "draft" || plan.status === "failed";
          const publishBlockedLabel =
            plan.status === "waiting_for_approval"
              ? "Awaiting approval"
              : plan.status === "needs_revision"
                ? "Needs revision"
                : plan.status === "published"
                  ? "Published"
                  : plan.status === "scheduled"
                    ? "Scheduled"
                    : "Publish";

          return (
            <article className="entity-card" key={plan._id}>
              <div className="entity-eyebrow">{plan.provider}</div>
              <h3>{plan.caption || "Distribution plan"}</h3>
              <p>{plan.errorMessage || `${plan.artifactIds.length} artifacts to ${plan.socialAccountIds.length} accounts.`}</p>
              <span>{plan.status}</span>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canPublish}
                  onClick={() => void publishPlan(plan)}
                >
                  {plan.scheduledFor ? <CalendarClock size={16} /> : <Megaphone size={16} />}
                  {canPublish ? (plan.scheduledFor ? "Schedule" : "Publish") : publishBlockedLabel}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void syncPlanStatus(plan)}
                >
                  <RefreshCw size={16} />
                  Status
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void syncPlanMetrics(plan)}
                >
                  <BarChart3 size={16} />
                  Metrics
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void removePlan(plan)}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {plans?.length === 0 && <div className="empty-state">No distribution plans yet.</div>}
    </Panel>
  );
}

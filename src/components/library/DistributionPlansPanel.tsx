import { BarChart3, CalendarClock, Megaphone, RefreshCw, Trash2 } from "lucide-react";
import { Panel } from "../ui";
import { artifactImageUrl, slideNumber } from "../../lib/artifactUtils";
import type { ArtifactDoc, DistributionPlanDoc } from "../../types";

function planArtifacts(plan: DistributionPlanDoc, artifacts?: ArtifactDoc[]) {
  const artifactsById = new Map((artifacts ?? []).map((artifact) => [String(artifact._id), artifact]));
  return plan.artifactIds
    .map((artifactId) => artifactsById.get(String(artifactId)))
    .filter((artifact): artifact is ArtifactDoc => Boolean(artifact))
    .sort((first, second) => slideNumber(first) - slideNumber(second));
}

function removePlanLabel(plan: DistributionPlanDoc) {
  if (plan.status === "published") return "Archive";
  if (plan.status === "scheduled") return "Cancel";
  return "Delete draft";
}

export function DistributionPlansPanel({
  plans,
  planStatus,
  publishPlan,
  syncPlanStatus,
  syncPlanMetrics,
  removePlan,
  artifacts,
}: {
  plans?: DistributionPlanDoc[];
  planStatus: string;
  publishPlan: (plan: DistributionPlanDoc) => Promise<void>;
  syncPlanStatus: (plan: DistributionPlanDoc) => Promise<void>;
  syncPlanMetrics: (plan: DistributionPlanDoc) => Promise<void>;
  removePlan: (plan: DistributionPlanDoc) => Promise<void>;
  artifacts?: ArtifactDoc[];
}) {
  return (
    <Panel title="Distribution Plans">
      {planStatus && <p className="muted">{planStatus}</p>}
      <div className="entity-grid">
        {plans?.map((plan) => {
          const canPublish = plan.status === "draft" || plan.status === "failed";
          const isManual = plan.provider === "manual";
          const hasExternalPosts = (plan.externalPostIds?.length ?? 0) > 0;
          const publishArtifacts = planArtifacts(plan, artifacts);
          const previewArtifacts = publishArtifacts.slice(0, 6);
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
              {previewArtifacts.length > 0 && (
                <div className="publish-bundle-preview">
                  {previewArtifacts.map((artifact) => {
                    const imageUrl = artifactImageUrl(artifact);
                    return imageUrl ? (
                      <img
                        alt={artifact.title || "Publish asset"}
                        key={artifact._id}
                        src={imageUrl}
                      />
                    ) : (
                      <div key={artifact._id}>{artifact.type}</div>
                    );
                  })}
                </div>
              )}
              <p>{plan.errorMessage || `${plan.artifactIds.length} publish-ready assets${plan.socialAccountIds.length ? ` to ${plan.socialAccountIds.length} accounts` : ""}.`}</p>
              <span>{plan.status}</span>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!canPublish}
                  onClick={() => void publishPlan(plan)}
                >
                  {plan.scheduledFor ? <CalendarClock size={16} /> : <Megaphone size={16} />}
                  {canPublish
                    ? isManual
                      ? "Mark published"
                      : plan.scheduledFor
                        ? "Schedule"
                        : "Publish"
                    : publishBlockedLabel}
                </button>
                {!isManual && hasExternalPosts && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void syncPlanStatus(plan)}
                  >
                    <RefreshCw size={16} />
                    Status
                  </button>
                )}
                {!isManual && hasExternalPosts && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void syncPlanMetrics(plan)}
                  >
                    <BarChart3 size={16} />
                    Metrics
                  </button>
                )}
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void removePlan(plan)}
                >
                  <Trash2 size={16} />
                  {removePlanLabel(plan)}
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

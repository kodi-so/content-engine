import { Check, CheckCircle2, RefreshCw, Trash2, X } from "lucide-react";
import { ArtifactPreview } from "../ArtifactPreview";
import {
  artifactSummary,
  latestRevisionNote,
  providerErrorSummary,
  supportsRegeneration,
} from "../../lib/artifactUtils";
import type { ArtifactDoc, DistributionPlanId } from "../../types";

export function ArtifactCard({
  artifact,
  debug = false,
  revisionNotes,
  setRevisionNotes,
  promotableTarget,
  approveArtifact,
  requestRevision,
  regenerateReviewedArtifact,
  promoteArtifactToPlan,
  removeArtifact,
}: {
  artifact: ArtifactDoc;
  debug?: boolean;
  revisionNotes: Record<string, string>;
  setRevisionNotes: (
    updater: (current: Record<string, string>) => Record<string, string>
  ) => void;
  promotableTarget?: { planId: DistributionPlanId; oldArtifactId: ArtifactDoc["_id"] };
  approveArtifact: (artifactId: ArtifactDoc["_id"]) => Promise<void>;
  requestRevision: (artifactId: ArtifactDoc["_id"]) => Promise<void>;
  regenerateReviewedArtifact: (artifact: ArtifactDoc) => Promise<void>;
  promoteArtifactToPlan: (
    artifact: ArtifactDoc,
    target: { planId: DistributionPlanId; oldArtifactId: ArtifactDoc["_id"] }
  ) => Promise<void>;
  removeArtifact: (artifact: ArtifactDoc) => Promise<void>;
}) {
  const providerError = providerErrorSummary(artifact);

  return (
    <article className="artifact-card" key={artifact._id}>
      <ArtifactPreview artifact={artifact} />
      <div className="artifact-copy">
        <div className="entity-eyebrow">{artifact.type}</div>
        <h3>{artifact.title || artifact.type}</h3>
        <p>{artifactSummary(artifact)}</p>
        {providerError && <p className="error-note">Provider error: {providerError}</p>}
        {debug && artifact.workflowRunId && (
          <p className="debug-note">Run artifact: {String(artifact.workflowRunId)}</p>
        )}
        {latestRevisionNote(artifact) && (
          <p className="revision-note">Latest revision note: {latestRevisionNote(artifact)}</p>
        )}
        <span>{artifact.reviewStatus}</span>
      </div>
      <label className="revision-field">
        <span>Revision note</span>
        <textarea
          value={revisionNotes[artifact._id] ?? ""}
          onChange={(event) =>
            setRevisionNotes((current) => ({
              ...current,
              [artifact._id]: event.target.value,
            }))
          }
          placeholder="What should the agent change next time?"
          rows={3}
        />
      </label>
      <div className="button-row">
        <button
          className="secondary-button"
          type="button"
          onClick={() => void approveArtifact(artifact._id)}
        >
          <Check size={16} />
          Approve
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void requestRevision(artifact._id)}
        >
          <X size={16} />
          Request revision
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={
            artifact.reviewStatus !== "needs_revision" ||
            !supportsRegeneration(artifact)
          }
          onClick={() => void regenerateReviewedArtifact(artifact)}
        >
          <RefreshCw size={16} />
          Regenerate
        </button>
        {promotableTarget && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => void promoteArtifactToPlan(artifact, promotableTarget)}
          >
            <CheckCircle2 size={16} />
            Promote to plan
          </button>
        )}
        <button
          className="danger-button"
          type="button"
          onClick={() => void removeArtifact(artifact)}
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </article>
  );
}

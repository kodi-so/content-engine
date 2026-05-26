import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { getActiveSlides, getSlideshowSpec, SavedSlideshowCard } from "../components/SlideshowPreview";
import { ArtifactCard } from "../components/library/ArtifactCard";
import { DistributionPlansPanel } from "../components/library/DistributionPlansPanel";
import { Page, Panel, Select } from "../components/ui";
import {
  findPromotablePlanTarget,
  isPrimaryReviewArtifact,
} from "../lib/artifactUtils";
import { DEFAULT_PUBLISHING_PROVIDER } from "../lib/publishingRouting";
import { renderSlideshowToBlobs } from "../lib/slideshowCanvas";
import type { ArtifactDoc, DistributionPlanDoc, DistributionPlanId, SlideshowDoc } from "../types";
import type { Id } from "../../convex/_generated/dataModel";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read rendered slide"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read rendered slide"));
    reader.readAsDataURL(blob);
  });
}

export function LibraryPage() {
  const artifacts = useQuery(api.artifacts.records.list, {});
  const brands = useQuery(api.accounts.brands.list);
  const accounts = useQuery(api.accounts.socialAccounts.list);
  const workflows = useQuery(api.workflows.definitions.list);
  const slideshows = useQuery(api.content.slideshows.list, {});
  const plans = useQuery(api.publishing.distributionPlans.list);
  const setReviewStatus = useMutation(api.artifacts.records.setReviewStatus);
  const requestArtifactRevision = useMutation(api.artifacts.records.requestRevision);
  const deleteArtifact = useMutation(api.artifacts.records.remove);
  const deleteSlideshow = useMutation(api.content.slideshows.remove);
  const createDraftPostFromSlideshow = useMutation(api.content.slideshows.createDraftDistributionPlanFromRenderedSlides);
  const replacePlanArtifact = useMutation(api.publishing.distributionPlans.replaceArtifact);
  const deletePlan = useMutation(api.publishing.distributionPlans.remove);
  const regenerateArtifact = useAction(api.artifacts.regeneration.regenerate);
  const uploadRenderedSlide = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const publishPlan = useAction(api.publishing.distributionPlans.publish);
  const syncPlanStatus = useAction(api.publishing.distributionPlans.syncStatus);
  const syncPlanMetrics = useAction(api.publishing.distributionPlans.syncMetrics);
  const [planStatus, setPlanStatus] = useState("");
  const [reviewStatus, setReviewStatusMessage] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showDebugArtifacts, setShowDebugArtifacts] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({});

  const filteredArtifacts = useMemo(() => {
    if (!artifacts) return undefined;

    const workflowsById = new Map(workflows?.map((workflow) => [workflow._id, workflow]));

    return artifacts.filter((artifact) => {
      if (
        artifact.lifecycle === "debug" ||
        artifact.lifecycle === "preview" ||
        artifact.lifecycle === "discarded"
      ) {
        return false;
      }

      const workflow = artifact.workflowId
        ? workflowsById.get(artifact.workflowId)
        : undefined;

      if (brandFilter && artifact.brandId !== brandFilter) return false;
      if (accountFilter && workflow?.socialAccountId !== accountFilter) return false;
      if (reviewFilter && artifact.reviewStatus !== reviewFilter) return false;
      if (typeFilter && artifact.type !== typeFilter) return false;

      return true;
    });
  }, [accountFilter, artifacts, brandFilter, reviewFilter, typeFilter, workflows]);

  const artifactTypes = useMemo(
    () => Array.from(new Set((artifacts ?? []).map((artifact) => artifact.type))).sort(),
    [artifacts]
  );

  const activeFilterCount = [
    brandFilter,
    accountFilter,
    reviewFilter,
    typeFilter,
  ].filter(Boolean).length;

  const reviewArtifacts = useMemo(
    () => filteredArtifacts?.filter(isPrimaryReviewArtifact),
    [filteredArtifacts]
  );
  const savedSlideshows = useMemo(
    () => {
      const artifactsById = new Map((artifacts ?? []).map((artifact) => [String(artifact._id), artifact]));
      const slideshowIdsWithDistributionPlans = new Set<string>();

      for (const plan of plans ?? []) {
        for (const artifactId of plan.artifactIds) {
          const artifact = artifactsById.get(String(artifactId));
          const data = artifact?.data;
          if (!data || typeof data !== "object") continue;
          const slideshowId = (data as Record<string, unknown>).slideshowId;
          if (typeof slideshowId === "string") {
            slideshowIdsWithDistributionPlans.add(slideshowId);
          }
        }
      }

      return (slideshows ?? []).filter((slideshow) => {
        if (slideshow.status !== "saved") return false;
        if (slideshowIdsWithDistributionPlans.has(String(slideshow._id))) return false;
        if (brandFilter && slideshow.brandId !== brandFilter) return false;
        if (accountFilter && slideshow.socialAccountId !== accountFilter) return false;
        return true;
      });
    },
    [accountFilter, artifacts, brandFilter, plans, slideshows]
  );
  const standaloneReviewArtifacts = useMemo(
    () => reviewArtifacts,
    [reviewArtifacts]
  );
  const debugArtifacts = useMemo(
    () => filteredArtifacts?.filter((artifact) => !isPrimaryReviewArtifact(artifact)),
    [filteredArtifacts]
  );

  const approveArtifact = async (artifactId: ArtifactDoc["_id"]) => {
    setReviewStatusMessage("Approving artifact");
    try {
      await setReviewStatus({
        id: artifactId,
        reviewStatus: "approved",
      });
      setReviewStatusMessage("Artifact approved");
    } catch (error) {
      setReviewStatusMessage(error instanceof Error ? error.message : "Approval failed");
    }
  };

  const requestRevision = async (artifactId: ArtifactDoc["_id"]) => {
    const note = revisionNotes[artifactId]?.trim();
    setReviewStatusMessage("Requesting revision");
    try {
      await requestArtifactRevision({
        id: artifactId,
        note: note || undefined,
      });
      setRevisionNotes((current) => ({
        ...current,
        [artifactId]: "",
      }));
      setReviewStatusMessage("Revision request saved");
    } catch (error) {
      setReviewStatusMessage(error instanceof Error ? error.message : "Revision request failed");
    }
  };

  const regenerateReviewedArtifact = async (artifact: ArtifactDoc) => {
    setReviewStatusMessage("Regenerating artifact");
    try {
      const result = await regenerateArtifact({ id: artifact._id });
      setReviewStatusMessage(`Created ${result.artifactIds.length} regenerated artifacts`);
    } catch (error) {
      setReviewStatusMessage(error instanceof Error ? error.message : "Regeneration failed");
    }
  };

  const promoteArtifactToPlan = async (
    artifact: ArtifactDoc,
    target: { planId: DistributionPlanId; oldArtifactId: ArtifactDoc["_id"] }
  ) => {
    setReviewStatusMessage("Promoting regenerated artifact");
    try {
      await replacePlanArtifact({
        id: target.planId,
        oldArtifactId: target.oldArtifactId,
        newArtifactId: artifact._id,
      });
      setReviewStatusMessage("Regenerated artifact promoted into distribution plan");
    } catch (error) {
      setReviewStatusMessage(error instanceof Error ? error.message : "Promotion failed");
    }
  };

  const removeArtifact = async (artifact: ArtifactDoc) => {
    const label = artifact.title || artifact.type;
    if (!window.confirm(`Delete "${label}" from the library?`)) return;

    setReviewStatusMessage("Deleting artifact");
    try {
      await deleteArtifact({ id: artifact._id });
      setReviewStatusMessage("Artifact deleted");
    } catch (error) {
      setReviewStatusMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const removeSlideshow = async (slideshow: SlideshowDoc) => {
    if (!window.confirm(`Delete "${slideshow.title}" from the library?`)) {
      return;
    }

    setReviewStatusMessage("Deleting slideshow");
    try {
      await deleteSlideshow({ id: slideshow._id });
      setReviewStatusMessage("Slideshow deleted");
    } catch (error) {
      setReviewStatusMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const createDraftPost = async (slideshow: SlideshowDoc) => {
    setReviewStatusMessage("Rendering publish assets");
    try {
      const spec = getSlideshowSpec(slideshow);
      const slides = getActiveSlides(slideshow);
      const blobs = await renderSlideshowToBlobs(spec, {
        mimeType: spec.exportSettings?.publishMimeType === "image/jpeg"
          ? "image/jpeg"
          : spec.exportSettings?.publishMimeType === "image/webp"
            ? "image/webp"
            : "image/png",
      });
      const uploadedSlides = await Promise.all(
        blobs.map(async (blob, index) => {
          const slide = slides[index];
          if (!slide) throw new Error("Rendered slide did not match slideshow state");
          const uploaded = await uploadRenderedSlide({
            base64Data: await blobToDataUrl(blob),
            filename: `${slideshow._id}-slide-${slide.index}.png`,
          });
          return {
            slideId: slide.slideId,
            index: slide.index,
            storageId: uploaded.storageId,
            storageUrl: uploaded.storageUrl,
            mimeType: uploaded.mimeType,
            fileSize: uploaded.byteLength,
            width: spec.dimensions?.width ?? slide.dimensions?.width ?? 1080,
            height: spec.dimensions?.height ?? slide.dimensions?.height ?? 1920,
            sourceImageArtifactId: slide.sourceImageArtifactId
              ? (slide.sourceImageArtifactId as Id<"artifacts">)
              : undefined,
          };
        })
      );
      const account = slideshow.socialAccountId
        ? accounts?.find((item) => item._id === slideshow.socialAccountId)
        : undefined;
      await createDraftPostFromSlideshow({
        slideshowId: slideshow._id,
        slides: uploadedSlides,
        socialAccountIds: slideshow.socialAccountId ? [slideshow.socialAccountId] : undefined,
        provider: account?.provider ?? DEFAULT_PUBLISHING_PROVIDER,
        caption: slideshow.title,
      });
      setReviewStatusMessage("Draft post created in Distribution Plans");
    } catch (error) {
      setReviewStatusMessage(error instanceof Error ? error.message : "Draft post creation failed");
    }
  };

  const runPlanAction = async (
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    setPlanStatus("Working");
    try {
      await action();
      setPlanStatus(successMessage);
    } catch (error) {
      setPlanStatus(error instanceof Error ? error.message : "Action failed");
    }
  };

  const removePlan = async (plan: DistributionPlanDoc) => {
    const isPublished = plan.status === "published";
    const isScheduled = plan.status === "scheduled";
    const label = isPublished
      ? "Archive this published record? This only removes it from Content Engine history; it does not delete anything from a social platform."
      : isScheduled
        ? "Cancel this scheduled distribution plan? Provider-side cancellation is not implemented yet, so this only removes the local plan."
        : "Delete this draft distribution plan and its synced metrics?";

    if (!window.confirm(label)) {
      return;
    }

    setPlanStatus(isPublished ? "Archiving published record" : isScheduled ? "Canceling plan" : "Deleting draft");
    try {
      await deletePlan({ id: plan._id });
      setPlanStatus(isPublished ? "Published record archived" : isScheduled ? "Plan canceled" : "Draft deleted");
    } catch (error) {
      setPlanStatus(error instanceof Error ? error.message : "Action failed");
    }
  };

  const renderArtifactCard = (artifact: ArtifactDoc, debug = false) => {
    const promotableTarget = findPromotablePlanTarget(artifact, plans ?? []);

    return (
      <ArtifactCard
        key={artifact._id}
        artifact={artifact}
        debug={debug}
        revisionNotes={revisionNotes}
        setRevisionNotes={setRevisionNotes}
        promotableTarget={promotableTarget}
        approveArtifact={approveArtifact}
        requestRevision={requestRevision}
        regenerateReviewedArtifact={regenerateReviewedArtifact}
        promoteArtifactToPlan={promoteArtifactToPlan}
        removeArtifact={removeArtifact}
      />
    );
  };

  return (
    <Page title="Artifact Library" description="Generated prompts, captions, images, slides, videos, and publish payloads.">
      <Panel title="Library Filters">
        <div className="filter-grid">
          <Select label="Brand" value={brandFilter} onChange={setBrandFilter}>
            <option value="">All brands</option>
            {brands?.map((brand) => (
              <option key={brand._id} value={brand._id}>
                {brand.name}
              </option>
            ))}
          </Select>
          <Select label="Account" value={accountFilter} onChange={setAccountFilter}>
            <option value="">All accounts</option>
            {accounts?.map((account) => (
              <option key={account._id} value={account._id}>
                {account.username}
              </option>
            ))}
          </Select>
          <Select label="Review" value={reviewFilter} onChange={setReviewFilter}>
            <option value="">All review states</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="needs_revision">Needs revision</option>
            <option value="not_required">Not required</option>
          </Select>
          <Select label="Type" value={typeFilter} onChange={setTypeFilter}>
            <option value="">All artifact types</option>
            {artifactTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setBrandFilter("");
              setAccountFilter("");
              setReviewFilter("");
              setTypeFilter("");
            }}
          >
            Clear filters
          </button>
        </div>
        <p className="muted">
          Showing {filteredArtifacts?.length ?? 0} of {artifacts?.length ?? 0} artifacts
          {activeFilterCount ? ` across ${activeFilterCount} active filters.` : "."}
        </p>
      </Panel>

      <DistributionPlansPanel
        plans={plans}
        artifacts={artifacts}
        planStatus={planStatus}
        publishPlan={(plan) =>
          runPlanAction(
            () =>
              publishPlan({
                id: plan._id as DistributionPlanId,
                mode: plan.scheduledFor ? "schedule" : "now",
              }),
            plan.scheduledFor ? "Plan scheduled" : "Plan published"
          )
        }
        syncPlanStatus={(plan) =>
          runPlanAction(
            () => syncPlanStatus({ id: plan._id as DistributionPlanId }),
            "Status synced"
          )
        }
        syncPlanMetrics={(plan) =>
          runPlanAction(
            () => syncPlanMetrics({ id: plan._id as DistributionPlanId }),
            "Metrics synced"
          )
        }
        removePlan={removePlan}
      />

      <Panel title="Review Queue">
        {reviewStatus && <p className="muted">{reviewStatus}</p>}
        {(!filteredArtifacts || !slideshows) && <div className="empty-state">Loading...</div>}
        {filteredArtifacts?.length === 0 && savedSlideshows.length === 0 && (
          <div className="empty-state">
            {artifacts?.length === 0 ? "No artifacts yet." : "No artifacts match these filters."}
          </div>
        )}
        {filteredArtifacts && (filteredArtifacts.length > 0 || savedSlideshows.length > 0) && (
          <div className="section-toolbar">
            <p className="muted">
              Showing {savedSlideshows.length} slideshow bundles and{" "}
              {standaloneReviewArtifacts?.length ?? 0} standalone review artifacts. Raw prompts,
              provider jobs, and publish payloads stay in pipeline debug.
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowDebugArtifacts((current) => !current)}
            >
              {showDebugArtifacts ? "Hide pipeline debug" : "Show pipeline debug"}
            </button>
          </div>
        )}
        {savedSlideshows.length === 0 &&
          standaloneReviewArtifacts?.length === 0 &&
          filteredArtifacts &&
          (filteredArtifacts.length > 0 || savedSlideshows.length > 0) && (
          <div className="empty-state">
            No final review artifacts match these filters. Turn on pipeline debug to inspect
            intermediate artifacts.
          </div>
        )}
        <div className="grid gap-[var(--space-4)]">
          {savedSlideshows.map((slideshow) => (
            <SavedSlideshowCard
              key={slideshow._id}
              slideshow={slideshow}
              createDraftPost={createDraftPost}
              removeSlideshow={removeSlideshow}
            />
          ))}
        </div>
        <div className="artifact-grid">
          {standaloneReviewArtifacts?.map((artifact) => renderArtifactCard(artifact))}
        </div>
      </Panel>
      {showDebugArtifacts && (
        <Panel title="Pipeline Debug">
          <p className="muted">
            Intermediate artifacts are useful while we tune the pipeline, but they are hidden
            from the normal review queue so the library does not feel duplicated.
          </p>
          {debugArtifacts?.length === 0 && (
            <div className="empty-state">No debug artifacts match these filters.</div>
          )}
          <div className="artifact-grid">
            {debugArtifacts?.map((artifact) => renderArtifactCard(artifact, true))}
          </div>
        </Panel>
      )}
    </Page>
  );
}

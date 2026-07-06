import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { isRecord } from "../references/referenceResolution";
import { optionalText } from "../../lib/mediaTextOverlays";
import { latestThreadTargets } from "./mediaOverlayEditing";
import { buildAutoCaptionsForVoiceover } from "./studioComposition";

async function voiceoverScriptForDraft(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  draft: Record<string, unknown>
) {
  const audioTracks = Array.isArray(draft.audioTracks) ? draft.audioTracks.filter(isRecord) : [];
  // Prefer explicit voiceover-role tracks; fall back to any audio track with a
  // script, since older drafts predate track roles.
  const ordered = [
    ...audioTracks.filter((track) => track.role === "voiceover" || track.role === undefined),
    ...audioTracks.filter((track) => track.role === "music" || track.role === "sfx"),
  ];
  for (const track of ordered) {
    const artifactIdValue = optionalText(track.artifactId) ?? optionalText(track.sourceId);
    if (!artifactIdValue) continue;
    const artifactId = ctx.db.normalizeId("artifacts", artifactIdValue);
    if (!artifactId) continue;
    const artifact = await ctx.db.get(artifactId);
    if (!artifact) continue;
    if (thread.workspaceId ? artifact.workspaceId !== thread.workspaceId : artifact.userId !== thread.userId) {
      continue;
    }
    const script = artifact.prompt?.trim();
    if (script) {
      const durationSeconds = typeof track.durationSeconds === "number" && Number.isFinite(track.durationSeconds)
        ? track.durationSeconds
        : undefined;
      return { script, durationSeconds };
    }
  }
  return null;
}

export async function updateVideoProjectCaptionsForToolCall(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  input: unknown
) {
  const record = isRecord(input) ? input : {};

  if (record.source === "transcribe") {
    throw new Error(
      "Transcribing arbitrary audio is not available yet. Captions currently come from the voiceover script generated in this thread; generate the voiceover with Create Audio first."
    );
  }

  const targetId = optionalText(record.projectId) ?? optionalText(record.targetId);
  let project: Doc<"videoProjects"> | null = null;
  if (targetId) {
    const projectId = ctx.db.normalizeId("videoProjects", targetId);
    project = projectId ? await ctx.db.get(projectId) : null;
  } else {
    const targets = await latestThreadTargets(ctx, thread);
    project = targets.videoProject ?? null;
  }
  if (!project) throw new Error("No Studio video project found to caption.");
  if (thread.workspaceId ? project.workspaceId !== thread.workspaceId : project.userId !== thread.userId) {
    throw new Error("Video project not found");
  }

  const draft = isRecord(project.draft) ? project.draft : {};

  if (record.remove === true) {
    const { captions: _removed, ...rest } = draft;
    await ctx.db.patch(project._id, { draft: rest, updatedAt: Date.now() });
    return {
      projectId: project._id,
      captionSegmentCount: 0,
      removed: true,
    };
  }

  const scriptSource = await voiceoverScriptForDraft(ctx, thread, draft);
  if (!scriptSource) {
    throw new Error(
      "No voiceover script found on this project's audio tracks. Generate the voiceover in this thread first, or add text overlays instead."
    );
  }

  const captions = buildAutoCaptionsForVoiceover({
    request: {
      stylePreset: record.stylePreset,
      zone: record.zone,
    },
    script: scriptSource.script,
    voiceoverDurationSeconds: scriptSource.durationSeconds,
  });
  if (!captions) throw new Error("Caption generation produced no segments.");

  await ctx.db.patch(project._id, {
    draft: { ...draft, captions },
    updatedAt: Date.now(),
  });

  return {
    projectId: project._id,
    captionSegmentCount: captions.segments.length,
    stylePreset: captions.stylePreset,
    zone: captions.zone,
  };
}

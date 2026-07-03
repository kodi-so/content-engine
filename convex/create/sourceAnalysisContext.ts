import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isRecord } from "./referenceResolution";

export function analysisJobIdFromToolOutput(output: unknown): Id<"videoAnalysisJobs"> | null {
  if (!isRecord(output) || typeof output.analysisJobId !== "string") return null;
  return output.analysisJobId as Id<"videoAnalysisJobs">;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function arrayLine(label: string, items: string[]) {
  return items.length ? `${label}: ${items.join(" | ")}` : undefined;
}

function referenceBriefContext(result: Record<string, unknown>) {
  const referenceBrief = isRecord(result.referenceBrief) ? result.referenceBrief : {};
  const transcript = isRecord(result.transcript) ? result.transcript : {};
  const visuals = isRecord(result.visuals) ? result.visuals : {};
  const audio = isRecord(result.audio) ? result.audio : {};
  const creativeAnalysis = isRecord(result.creativeAnalysis) ? result.creativeAnalysis : {};
  const reuseBrief = isRecord(result.reuseBrief) ? result.reuseBrief : {};
  const slideshow = isRecord(result.slideshow) ? result.slideshow : {};
  const slides = Array.isArray(slideshow.slides) ? slideshow.slides.filter(isRecord).slice(0, 8) : [];
  const slideText = slides.flatMap((slide) => stringArrayValue(slide.visibleText));
  const slideVisuals = slides.map((slide, index) => {
    const description = stringValue(slide.imageDescription);
    return description ? `Slide ${index + 1}: ${description}` : "";
  }).filter(Boolean);
  const visibleText = [
    ...stringArrayValue(referenceBrief.visibleText),
    ...stringArrayValue(visuals.onScreenText),
    ...slideText,
  ].filter(Boolean);
  const keyVisuals = [
    ...stringArrayValue(referenceBrief.keyVisuals),
    ...stringArrayValue(visuals.subjects),
    ...slideVisuals,
  ].filter(Boolean);
  const lines = [
    stringValue(referenceBrief.sourceType) ? `Source type: ${stringValue(referenceBrief.sourceType)}` : undefined,
    stringValue(referenceBrief.oneLineSummary)
      ? `Reference brief: ${stringValue(referenceBrief.oneLineSummary)}`
      : stringValue(result.summary)
        ? `Reference brief: ${stringValue(result.summary)}`
        : undefined,
    stringValue(referenceBrief.coreIdea) ? `Core idea: ${stringValue(referenceBrief.coreIdea)}` : undefined,
    stringValue(referenceBrief.hook) || stringValue(creativeAnalysis.hook)
      ? `Hook: ${stringValue(referenceBrief.hook) || stringValue(creativeAnalysis.hook)}`
      : undefined,
    arrayLine("Structure", [
      ...stringArrayValue(referenceBrief.structure),
      ...stringArrayValue(creativeAnalysis.structure),
    ]),
    arrayLine("Key visuals", keyVisuals),
    arrayLine("Visible text", visibleText),
    stringValue(referenceBrief.audioRole) ||
      stringValue(audio.musicAndSound) ||
      stringValue(audio.speechDelivery)
      ? `Audio role: ${stringValue(referenceBrief.audioRole) || stringValue(audio.musicAndSound) || stringValue(audio.speechDelivery)}`
      : undefined,
    stringValue(referenceBrief.reusablePattern) || stringValue(reuseBrief.copyablePattern)
      ? `Reusable pattern: ${stringValue(referenceBrief.reusablePattern) || stringValue(reuseBrief.copyablePattern)}`
      : undefined,
    arrayLine("Do not copy", [
      ...stringArrayValue(referenceBrief.doNotCopy),
      ...stringArrayValue(creativeAnalysis.risksToAvoid),
    ]),
    arrayLine("Suggested uses", stringArrayValue(referenceBrief.suggestedUses)),
    stringValue(transcript.text) ? `Transcript: ${stringValue(transcript.text).slice(0, 1800)}` : undefined,
  ].filter(Boolean);

  return lines.join("\n");
}

function analysisResultContext(result: Record<string, unknown>) {
  const referenceContext = referenceBriefContext(result);
  if (referenceContext.trim()) return referenceContext;

  const transcript = isRecord(result.transcript) ? result.transcript : {};
  const visuals = isRecord(result.visuals) ? result.visuals : {};
  const audio = isRecord(result.audio) ? result.audio : {};
  const creativeAnalysis = isRecord(result.creativeAnalysis) ? result.creativeAnalysis : {};
  const reuseBrief = isRecord(result.reuseBrief) ? result.reuseBrief : {};
  const sceneBreakdown = Array.isArray(visuals.sceneBreakdown)
    ? visuals.sceneBreakdown.filter(isRecord).slice(0, 8)
    : [];

  return [
    stringValue(result.platformRead) ? `Platform/style read: ${stringValue(result.platformRead)}` : undefined,
    stringValue(result.durationEstimate) ? `Duration estimate: ${stringValue(result.durationEstimate)}` : undefined,
    stringValue(creativeAnalysis.hook) ? `Hook: ${stringValue(creativeAnalysis.hook)}` : undefined,
    stringArrayValue(creativeAnalysis.structure).length
      ? `Structure: ${stringArrayValue(creativeAnalysis.structure).join(" | ")}`
      : undefined,
    stringValue(creativeAnalysis.pacing) ? `Pacing: ${stringValue(creativeAnalysis.pacing)}` : undefined,
    stringArrayValue(creativeAnalysis.whyItWorks).length
      ? `Why it works: ${stringArrayValue(creativeAnalysis.whyItWorks).join(" | ")}`
      : undefined,
    stringArrayValue(creativeAnalysis.risksToAvoid).length
      ? `Risks to avoid: ${stringArrayValue(creativeAnalysis.risksToAvoid).join(" | ")}`
      : undefined,
    stringValue(visuals.style) ? `Visual style: ${stringValue(visuals.style)}` : undefined,
    stringValue(visuals.setting) ? `Setting: ${stringValue(visuals.setting)}` : undefined,
    stringArrayValue(visuals.subjects).length
      ? `Subjects: ${stringArrayValue(visuals.subjects).join(", ")}`
      : undefined,
    stringValue(visuals.cameraAndEditing)
      ? `Camera/editing: ${stringValue(visuals.cameraAndEditing)}`
      : undefined,
    stringArrayValue(visuals.onScreenText).length
      ? `On-screen text: ${stringArrayValue(visuals.onScreenText).join(" | ")}`
      : undefined,
    sceneBreakdown.length
      ? `Scene breakdown: ${sceneBreakdown.map((scene) => {
          const timestamp = stringValue(scene.timestamp);
          const description = stringValue(scene.description);
          const visualNotes = stringValue(scene.visualNotes);
          const audioNotes = stringValue(scene.audioNotes);
          return [timestamp, description, visualNotes, audioNotes].filter(Boolean).join(" - ");
        }).filter(Boolean).join(" | ")}`
      : undefined,
    stringValue(audio.speechDelivery) ? `Speech delivery: ${stringValue(audio.speechDelivery)}` : undefined,
    stringValue(audio.musicAndSound) ? `Music/sound: ${stringValue(audio.musicAndSound)}` : undefined,
    stringValue(reuseBrief.copyablePattern)
      ? `Reusable pattern: ${stringValue(reuseBrief.copyablePattern)}`
      : undefined,
    stringArrayValue(reuseBrief.shotList).length
      ? `Suggested shot list: ${stringArrayValue(reuseBrief.shotList).join(" | ")}`
      : undefined,
    stringValue(reuseBrief.scriptTemplate)
      ? `Script template: ${stringValue(reuseBrief.scriptTemplate)}`
      : undefined,
    stringValue(reuseBrief.generationPrompt)
      ? `Source-grounded generation prompt: ${stringValue(reuseBrief.generationPrompt)}`
      : undefined,
    stringValue(transcript.text) ? `Transcript: ${stringValue(transcript.text).slice(0, 1800)}` : undefined,
  ].filter(Boolean).join("\n");
}

export async function analysisContextForThreadToolOutputs(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const contextParts: string[] = [];

  for (const candidate of threadToolCalls) {
    if (excludeToolCallId && candidate._id === excludeToolCallId) continue;
    const jobId = analysisJobIdFromToolOutput(candidate.output);
    if (!jobId) continue;
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== "completed") continue;
    if (thread.workspaceId ? job.workspaceId !== thread.workspaceId : job.userId !== thread.userId) {
      continue;
    }

    const result = isRecord(job.result) ? job.result : {};
    contextParts.push([
      job.title ? `Source title: ${job.title}` : undefined,
      job.summary ? `Source summary: ${job.summary}` : undefined,
      job.transcript ? `Transcript: ${job.transcript.slice(0, 1800)}` : undefined,
      analysisResultContext(result),
    ].filter(Boolean).join("\n"));
  }

  return contextParts.filter(Boolean).join("\n\n");
}

export function briefWithAnalysisContext(brief: string, analysisContext: string) {
  if (!analysisContext.trim()) return brief;
  return [
    brief,
    "Use this source analysis as creative context. Adapt the structure and relevant cues while following the user's requested changes:",
    analysisContext,
  ].join("\n\n");
}

export async function hasPendingAnalysisContextForThreadToolOutputs(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  excludeToolCallId?: Id<"createToolCalls">
) {
  const threadToolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();

  for (const candidate of threadToolCalls) {
    if (excludeToolCallId && candidate._id === excludeToolCallId) continue;
    const jobId = analysisJobIdFromToolOutput(candidate.output);
    if (!jobId) continue;
    const job = await ctx.db.get(jobId);
    if (!job || job.status === "completed" || job.status === "failed") continue;
    if (thread.workspaceId ? job.workspaceId !== thread.workspaceId : job.userId !== thread.userId) {
      continue;
    }
    return true;
  }

  return false;
}

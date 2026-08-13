import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  estimateGenerationCost,
  rosterModelForCostEstimate,
  type GenerationCostEstimate,
} from "../../src/lib/generation/costEstimation";
import {
  falModelIdForRosterModel,
  normalizeRosterOptionValue,
  rosterOptionsForModel,
  type RosterModelMode,
  type RosterModelOptionKey,
} from "../../src/lib/generation/modelRoster";

type DbReader = MutationCtx | QueryCtx;

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finitePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function modeForToolName(toolName: string): RosterModelMode | undefined {
  if (toolName === "media.generateImage") return "image";
  if (toolName === "media.generateVideo") return "video";
  if (toolName === "media.generateAudio") return "audio";
  if (toolName === "media.lipsync") return "lipsync";
  return undefined;
}

function providerForMode(workspace: Doc<"workspaces"> | null, mode: RosterModelMode) {
  const settings = workspace?.aiGenerationSettings;
  if (mode === "image") return settings?.imageProvider ?? "fal";
  if (mode === "video") return settings?.videoProvider ?? "fal";
  if (mode === "audio") return settings?.audioProvider ?? "fal";
  return settings?.lipsyncProvider ?? "fal";
}

function configuredModelForMode(
  workspace: Doc<"workspaces"> | null,
  mode: RosterModelMode,
  accountDefaults: Record<string, unknown>
) {
  if (mode === "image" && typeof accountDefaults.imageModel === "string") return accountDefaults.imageModel;
  if (mode === "video" && typeof accountDefaults.videoModel === "string") return accountDefaults.videoModel;
  const settings = workspace?.aiGenerationSettings;
  if (mode === "image") return settings?.imageModel;
  if (mode === "video") return settings?.videoModel;
  if (mode === "audio") return settings?.audioModel;
  return settings?.lipsyncModel;
}

function plannedReferenceCount(input: Record<string, unknown>, kind: "image" | "video") {
  const keys = kind === "image"
    ? ["referenceImages", "imageReferences", "referenceAssets", "localReferenceImages"]
    : ["referenceVideos", "videoReferences", "localReferenceVideos"];
  const explicit = keys.reduce((sum, key) => sum + (Array.isArray(input[key]) ? input[key].length : 0), 0);
  const usesPrior = kind === "image"
    ? input.usePriorImageOutputs === true || Array.isArray(input.priorImageOutputIndexes)
    : input.usePriorVideoOutputs === true || Array.isArray(input.priorVideoOutputIndexes);
  return explicit + (usesPrior ? 1 : 0);
}

function resolvedOptions(args: {
  accountDefaults: Record<string, unknown>;
  input: Record<string, unknown>;
  mode: RosterModelMode;
  modelId?: string;
  workspace: Doc<"workspaces"> | null;
}) {
  const model = rosterModelForCostEstimate(args.mode, args.modelId);
  if (!model) return recordFromUnknown(args.input.options);
  const explicitOptions = recordFromUnknown(args.input.options);
  const result: Record<string, string | boolean> = {};

  for (const [key, option] of Object.entries(rosterOptionsForModel(model)) as Array<[
    RosterModelOptionKey,
    NonNullable<ReturnType<typeof rosterOptionsForModel>[RosterModelOptionKey]>
  ]>) {
    const explicit = normalizeRosterOptionValue(option, explicitOptions[key]);
    if (explicit !== undefined) {
      result[key] = explicit;
      continue;
    }
    const accountDefault = normalizeRosterOptionValue(
      option,
      key === "resolution" ? args.accountDefaults.imageResolution : args.accountDefaults[key]
    );
    if (accountDefault !== undefined) {
      result[key] = accountDefault;
      continue;
    }
    const workspaceDefault = normalizeRosterOptionValue(
      option,
      key === "resolution" && args.mode === "image"
        ? args.workspace?.aiGenerationSettings?.imageResolution
        : undefined
    );
    result[key] = workspaceDefault ?? option.default;
  }

  return result;
}

async function currentUnitPrice(
  ctx: DbReader,
  endpointId: string | undefined
) {
  if (!endpointId) return undefined;
  const candidates = [...new Set([
    endpointId,
    endpointId.replace(/\/edit$/, ""),
    endpointId.replace(/\/image-to-image$/, ""),
    endpointId === "fal-ai/xai/tts/v1" ? "xai/tts/v1" : endpointId,
    endpointId.startsWith("fal-ai/seedance-2.0")
      ? endpointId.replace(/^fal-ai\//, "bytedance/")
      : endpointId,
  ])];
  for (const candidate of candidates) {
    const snapshot = await ctx.db
      .query("providerPriceSnapshots")
      .withIndex("by_provider_and_endpoint", (q) =>
        q.eq("provider", "fal").eq("endpointId", candidate)
      )
      .unique();
    if (snapshot) return snapshot.unitPriceUsd;
  }
  return undefined;
}

export async function estimateToolCallCost(
  ctx: DbReader,
  thread: Doc<"createThreads">,
  toolName: string,
  inputValue: unknown
): Promise<GenerationCostEstimate | undefined> {
  const mode = modeForToolName(toolName);
  if (!mode) return undefined;
  const input = recordFromUnknown(inputValue);
  const workspace = thread.workspaceId ? await ctx.db.get(thread.workspaceId) : null;
  const account = thread.socialAccountId ? await ctx.db.get(thread.socialAccountId) : null;
  const accountDefaults = recordFromUnknown(account?.autopilot?.generationDefaults);
  const provider = typeof input.provider === "string"
    ? input.provider
    : providerForMode(workspace, mode);
  if (provider !== "fal") return undefined;

  const requestedModel = typeof input.model === "string"
    ? input.model
    : configuredModelForMode(workspace, mode, accountDefaults);
  const rosterModel = rosterModelForCostEstimate(mode, requestedModel);
  if (!rosterModel) return undefined;
  const imageReferenceCount = plannedReferenceCount(input, "image");
  const videoReferenceCount = plannedReferenceCount(input, "video");
  const endpointId = falModelIdForRosterModel(rosterModel, {
    referenceImageCount: imageReferenceCount,
  }) ?? requestedModel;
  const options = resolvedOptions({
    accountDefaults,
    input,
    mode,
    modelId: endpointId,
    workspace,
  });
  const text = typeof input.text === "string"
    ? input.text
    : typeof input.prompt === "string"
      ? input.prompt
      : typeof input.brief === "string"
        ? input.brief
        : "";

  return estimateGenerationCost({
    provider,
    mode,
    modelId: endpointId,
    count: finitePositiveNumber(input.count),
    durationSeconds: finitePositiveNumber(input.durationSeconds),
    nativeAudio: input.nativeAudio === true,
    options,
    referenceCount: imageReferenceCount + videoReferenceCount,
    referenceVideoCount: videoReferenceCount,
    textLength: text.length,
    liveUnitPriceUsd: await currentUnitPrice(ctx, endpointId),
  });
}

export async function estimateResolvedGenerationCost(
  ctx: DbReader,
  args: {
    allowBatchCount?: boolean;
    count?: number;
    durationSeconds?: number;
    mode: RosterModelMode;
    modelId?: string;
    nativeAudio?: boolean;
    options?: Record<string, unknown>;
    provider: string;
    referenceCount?: number;
    referenceVideoCount?: number;
    textLength?: number;
  }
) {
  return estimateGenerationCost({
    ...args,
    liveUnitPriceUsd: await currentUnitPrice(ctx, args.modelId),
  });
}

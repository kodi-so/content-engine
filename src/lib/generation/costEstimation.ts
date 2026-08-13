import {
  defaultRosterModelForMode,
  resolveRosterModelAlias,
  rosterModelByProviderModelId,
  rosterOptionsForModel,
  type RosterModel,
  type RosterModelMode,
} from "./modelRoster";

export type GenerationCostEstimate = {
  accuracy: "exact" | "approximate";
  costUsd: number;
  currency: "USD";
  modelId: string;
  modelLabel: string;
  parameters: Record<string, string | number | boolean>;
  pricingVersion: string;
  quantity: number;
  source: "pricing_snapshot" | "static_pricing";
  unit: string;
  unitPriceUsd: number;
};

export type GenerationCostEstimateInput = {
  allowBatchCount?: boolean;
  count?: number;
  durationSeconds?: number;
  liveUnitPriceUsd?: number;
  mode: RosterModelMode;
  modelId?: string;
  nativeAudio?: boolean;
  options?: Record<string, unknown>;
  provider?: string;
  referenceCount?: number;
  referenceVideoCount?: number;
  textLength?: number;
};

export const GENERATION_PRICING_VERSION = "fal-marketplace-2026-08-13";

function finitePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizedFalModelId(modelId: string | undefined) {
  if (!modelId) return undefined;
  return modelId
    .replace(/\/edit$/, "")
    .replace(/\/image-to-image$/, "")
    .replace(/^fal-ai\/gpt-image-2$/, "openai/gpt-image-2");
}

export function rosterModelForCostEstimate(
  mode: RosterModelMode,
  modelId?: string
): RosterModel | undefined {
  const normalized = normalizedFalModelId(modelId);
  const resolved = resolveRosterModelAlias(normalized) ?? rosterModelByProviderModelId(normalized);
  if (resolved?.mode === mode) return resolved;
  return modelId ? undefined : defaultRosterModelForMode(mode);
}

function optionValue(
  model: RosterModel,
  options: Record<string, unknown> | undefined,
  key: "quality" | "resolution" | "webSearch"
) {
  const option = rosterOptionsForModel(model)[key];
  return options?.[key] ?? option?.default;
}

function roundedCost(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function estimateImageCost(
  model: RosterModel,
  input: GenerationCostEstimateInput
): Omit<GenerationCostEstimate, "currency" | "modelId" | "modelLabel" | "pricingVersion" | "source"> | undefined {
  const count = Math.max(
    1,
    Math.min(input.allowBatchCount ? 100 : 4, Math.floor(finitePositiveNumber(input.count) ?? 1))
  );
  const resolution = String(optionValue(model, input.options, "resolution") ?? "1K");
  const webSearch = optionValue(model, input.options, "webSearch") === true;
  const hasReferences = (input.referenceCount ?? 0) > 0;

  if (model.id === "nano-banana-2") {
    const baseRate = finitePositiveNumber(input.liveUnitPriceUsd) ?? 0.08;
    const multiplier = resolution === "0.5K" ? 0.75 : resolution === "2K" ? 1.5 : resolution === "4K" ? 2 : 1;
    const unitPriceUsd = baseRate * multiplier + (webSearch ? 0.015 : 0);
    return {
      accuracy: "exact",
      costUsd: roundedCost(unitPriceUsd * count),
      parameters: { count, resolution, ...(webSearch ? { webSearch } : {}) },
      quantity: count,
      unit: "image",
      unitPriceUsd: roundedCost(unitPriceUsd),
    };
  }

  if (model.id === "nano-banana-pro") {
    const baseRate = finitePositiveNumber(input.liveUnitPriceUsd) ?? 0.15;
    const unitPriceUsd = baseRate * (resolution === "4K" ? 2 : 1) + (webSearch ? 0.015 : 0);
    return {
      accuracy: "exact",
      costUsd: roundedCost(unitPriceUsd * count),
      parameters: { count, resolution, ...(webSearch ? { webSearch } : {}) },
      quantity: count,
      unit: "image",
      unitPriceUsd: roundedCost(unitPriceUsd),
    };
  }

  if (model.id === "gpt-image-2") {
    const qualityValue = String(optionValue(model, input.options, "quality") ?? "high");
    const quality = qualityValue === "auto" ? "high" : qualityValue;
    const size = typeof input.options?.size === "string"
      ? input.options.size
      : typeof input.options?.imageSize === "string"
        ? input.options.imageSize
        : "1024x1024";
    const rates: Record<string, Record<string, number>> = {
      "1024x768": { low: 0.005, medium: 0.037, high: 0.145 },
      "1024x1024": { low: 0.006, medium: 0.053, high: 0.211 },
      "1024x1536": { low: 0.005, medium: 0.042, high: 0.165 },
      "1920x1080": { low: 0.005, medium: 0.04, high: 0.158 },
      "2560x1440": { low: 0.007, medium: 0.056, high: 0.222 },
      "3840x2160": { low: 0.012, medium: 0.101, high: 0.401 },
    };
    const editRates: Record<string, Record<string, number>> = {
      "1024x768": { low: 0.011, medium: 0.043, high: 0.151 },
      "1024x1024": { low: 0.015, medium: 0.061, high: 0.219 },
      "1024x1536": { low: 0.018, medium: 0.054, high: 0.178 },
      "1920x1080": { low: 0.017, medium: 0.053, high: 0.158 },
      "2560x1440": { low: 0.019, medium: 0.068, high: 0.234 },
      "3840x2160": { low: 0.024, medium: 0.113, high: 0.413 },
    };
    const table = hasReferences ? editRates : rates;
    const staticUnitPriceUsd = table[size]?.[quality] ?? table["1024x1024"].high;
    const staticBasePriceUsd = hasReferences ? 0.011 : 0.005;
    const unitPriceUsd = finitePositiveNumber(input.liveUnitPriceUsd)
      ? staticUnitPriceUsd * (input.liveUnitPriceUsd! / staticBasePriceUsd)
      : staticUnitPriceUsd;
    return {
      accuracy: "approximate",
      costUsd: roundedCost(unitPriceUsd * count),
      parameters: { count, quality, size, ...(hasReferences ? { edit: true } : {}) },
      quantity: count,
      unit: "image",
      unitPriceUsd,
    };
  }

  return undefined;
}

function videoRate(
  modelId: string,
  resolution: string,
  nativeAudio: boolean,
  hasVideoInput: boolean
) {
  if (modelId === "kling-v3-pro") return nativeAudio ? 0.168 : 0.112;
  if (modelId === "kling-o3-pro") return nativeAudio ? 0.14 : 0.112;
  if (modelId === "seedance-v1-pro") return 0.124;
  if (modelId === "seedance-2-reference") {
    const base = resolution === "1080p" ? 0.682 : 0.3034;
    return hasVideoInput ? base * 0.6 : base;
  }
  if (modelId === "sora-2") return 0.1;
  if (modelId === "veo-3-1") {
    if (resolution.toLowerCase() === "4k") return nativeAudio ? 0.6 : 0.4;
    return nativeAudio ? 0.4 : 0.2;
  }
  if (modelId === "pixverse-v6") {
    const rates: Record<string, [number, number]> = {
      "360p": [0.025, 0.035],
      "540p": [0.035, 0.045],
      "720p": [0.045, 0.06],
      "1080p": [0.09, 0.115],
    };
    const pair = rates[resolution] ?? rates["720p"];
    return nativeAudio ? pair[1] : pair[0];
  }
  return undefined;
}

function estimateVideoCost(
  model: RosterModel,
  input: GenerationCostEstimateInput
): Omit<GenerationCostEstimate, "currency" | "modelId" | "modelLabel" | "pricingVersion" | "source"> | undefined {
  const durationSeconds = finitePositiveNumber(input.durationSeconds) ?? model.durationConstraint?.defaultValue ?? 5;
  const nativeAudio = input.nativeAudio === true;
  const resolution = String(optionValue(model, input.options, "resolution") ?? (
    model.id === "seedance-2-reference" ? "720p" :
    model.id === "pixverse-v6" ? "720p" :
    "default"
  ));

  if (model.id === "ltx-2-19b") {
    const width = finitePositiveNumber(input.options?.width) ?? 1248;
    const height = finitePositiveNumber(input.options?.height) ?? 704;
    const frames = Math.max(1, Math.round(durationSeconds * 25));
    const videoMegapixels = Math.ceil((width * height * frames) / 1_000_000);
    const unitPriceUsd = finitePositiveNumber(input.liveUnitPriceUsd) ?? 0.0018;
    return {
      accuracy: "approximate",
      costUsd: roundedCost(videoMegapixels * unitPriceUsd),
      parameters: { durationSeconds, frames, height, width },
      quantity: videoMegapixels,
      unit: "video megapixel",
      unitPriceUsd,
    };
  }

  const staticUnitPriceUsd = videoRate(
    model.id,
    resolution,
    nativeAudio,
    (input.referenceVideoCount ?? 0) > 0
  );
  if (staticUnitPriceUsd === undefined) return undefined;
  const staticBaseResolution = model.id === "seedance-2-reference"
    ? "720p"
    : model.id === "pixverse-v6"
      ? "360p"
      : "default";
  const staticBaseUnitPriceUsd = videoRate(
    model.id,
    staticBaseResolution,
    false,
    false
  ) ?? staticUnitPriceUsd;
  const unitPriceUsd = finitePositiveNumber(input.liveUnitPriceUsd)
    ? input.liveUnitPriceUsd! * (staticUnitPriceUsd / staticBaseUnitPriceUsd)
    : staticUnitPriceUsd;
  return {
    accuracy: model.id === "seedance-v1-pro" ? "approximate" : "exact",
    costUsd: roundedCost(durationSeconds * unitPriceUsd),
    parameters: {
      durationSeconds,
      ...(resolution !== "default" ? { resolution } : {}),
      ...(model.nativeAudio ? { nativeAudio } : {}),
    },
    quantity: durationSeconds,
    unit: "second",
    unitPriceUsd,
  };
}

function estimateAudioCost(
  model: RosterModel,
  input: GenerationCostEstimateInput
): Omit<GenerationCostEstimate, "currency" | "modelId" | "modelLabel" | "pricingVersion" | "source"> | undefined {
  const rates: Record<string, number> = {
    "xai-tts": 0.015,
    "seed-speech-v2": 0.03,
    "elevenlabs-turbo": 0.05,
  };
  const unitPriceUsd = finitePositiveNumber(input.liveUnitPriceUsd) ?? rates[model.id];
  if (!unitPriceUsd) return undefined;
  const characterCount = Math.max(1, input.textLength ?? 0);
  const quantity = Math.max(0.001, characterCount / 1000);
  return {
    accuracy: "exact",
    costUsd: roundedCost(quantity * unitPriceUsd),
    parameters: { characterCount },
    quantity,
    unit: "1K characters",
    unitPriceUsd,
  };
}

export function estimateGenerationCost(
  input: GenerationCostEstimateInput
): GenerationCostEstimate | undefined {
  if (input.provider && input.provider !== "fal") return undefined;
  const model = rosterModelForCostEstimate(input.mode, input.modelId);
  if (!model) return undefined;

  const partial = input.mode === "image"
    ? estimateImageCost(model, input)
    : input.mode === "video"
      ? estimateVideoCost(model, input)
      : input.mode === "audio"
        ? estimateAudioCost(model, input)
        : undefined;
  if (!partial) return undefined;

  return {
    ...partial,
    currency: "USD",
    modelId: input.modelId ?? model.falModelId ?? model.id,
    modelLabel: model.label,
    pricingVersion: GENERATION_PRICING_VERSION,
    source: finitePositiveNumber(input.liveUnitPriceUsd)
      ? "pricing_snapshot"
      : "static_pricing",
  };
}

export function formatGenerationCost(costUsd: number, approximate = false) {
  const formatted = costUsd < 0.01
    ? costUsd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 3, maximumFractionDigits: 4 })
    : costUsd.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return approximate ? `~${formatted}` : formatted;
}

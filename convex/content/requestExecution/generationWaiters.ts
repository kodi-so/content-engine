import { isProviderError } from "../../providers/errors";
import type { GeneratedAsset, ModelProvider } from "../../providers/model";

export function costUsdFromMetadata(metadata: { costUsd?: number }): number {
  return typeof metadata.costUsd === "number" ? metadata.costUsd : 0;
}

async function waitForGeneratedAsset(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
    kind: "image" | "video" | "audio";
    maxAttempts: number;
    pollIntervalMs?: number;
    timeoutLabel: string;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset> {
  const assets = await waitForGeneratedAssets(provider, args, onStatus);
  return assets[0];
}

async function waitForGeneratedAssets(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
    kind: "image" | "video" | "audio";
    maxAttempts: number;
    pollIntervalMs?: number;
    timeoutLabel: string;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset[]> {
  if (!args.jobId) {
    throw new Error(`${args.kind[0].toUpperCase()}${args.kind.slice(1)} generation did not return ${args.kind === "image" ? "an image" : args.kind === "audio" ? "an audio asset" : "a video"} or job id`);
  }

  let lastStatus = "unknown";
  let lastError = "";
  for (let attempt = 0; attempt < args.maxAttempts; attempt += 1) {
    let result;
    try {
      result = await provider.getJobStatus({
        jobId: args.jobId,
        model: args.model,
        metadata: args.metadata,
      });
    } catch (error) {
      if (!isProviderError(error) || !error.retryable) throw error;

      lastStatus = "retrying";
      lastError = error.message;
      await onStatus?.("retrying");
      await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs ?? 5000));
      continue;
    }

    lastStatus = result.status;
    lastError = result.errorMessage ?? "";
    await onStatus?.(result.status);

    if (result.status === "succeeded") {
      const assets = result.assets?.filter((candidate) =>
        candidate.mimeType.startsWith(`${args.kind}/`)
      );
      if (assets?.length) return assets;
      throw new Error(`${args.kind[0].toUpperCase()}${args.kind.slice(1)} job ${args.jobId} succeeded but returned no ${args.kind} assets`);
    }
    if (result.status === "failed" || result.status === "canceled") {
      throw new Error(`${args.kind[0].toUpperCase()}${args.kind.slice(1)} job ${args.jobId} ${result.status}${result.errorMessage ? `: ${result.errorMessage}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs ?? 5000));
  }

  throw new Error(`${args.kind[0].toUpperCase()}${args.kind.slice(1)} job ${args.jobId} timed out after ${args.timeoutLabel} with status ${lastStatus}${lastError ? `: ${lastError}` : ""}`);
}

export async function waitForGeneratedImage(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
    pollIntervalMs?: number;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset> {
  return waitForGeneratedAsset(provider, {
    ...args,
    kind: "image",
    maxAttempts: 60,
    timeoutLabel: "5 minutes",
  }, onStatus);
}

export async function waitForGeneratedImages(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
    pollIntervalMs?: number;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset[]> {
  return waitForGeneratedAssets(provider, {
    ...args,
    kind: "image",
    maxAttempts: 60,
    timeoutLabel: "5 minutes",
  }, onStatus);
}

export async function waitForGeneratedVideo(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
    pollIntervalMs?: number;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset> {
  return waitForGeneratedAsset(provider, {
    ...args,
    kind: "video",
    maxAttempts: 120,
    timeoutLabel: "10 minutes",
  }, onStatus);
}

export async function waitForGeneratedAudio(
  provider: ModelProvider,
  args: {
    jobId?: string;
    model: string;
    metadata?: Record<string, unknown>;
    pollIntervalMs?: number;
  },
  onStatus?: (status: string) => Promise<void>
): Promise<GeneratedAsset> {
  return waitForGeneratedAsset(provider, {
    ...args,
    kind: "audio",
    maxAttempts: 60,
    timeoutLabel: "5 minutes",
  }, onStatus);
}

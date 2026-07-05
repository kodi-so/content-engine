import { rosterVideoDurationConstraintForModelId } from "./modelRoster";

export type VideoDurationConstraint =
  | {
      defaultValue: number;
      kind: "enum";
      providerValueType?: "number" | "string" | "secondsString";
      values: number[];
    }
  | {
      defaultValue: number;
      kind: "integerRange";
      max: number;
      min: number;
    }
  | {
      defaultValue: number;
      fps: number;
      kind: "frameCount";
    };

const KLING_THREE_TO_FIFTEEN_SECONDS = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
const TWO_TO_TWELVE_SECONDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SORA_TWO_SECONDS = [4, 8, 12, 16, 20];

export function falVideoDurationConstraintForModel(
  modelId: string | undefined
): VideoDurationConstraint | null {
  const model = modelId?.trim();
  if (!model) return null;

  const rosterConstraint = rosterVideoDurationConstraintForModelId(model);
  if (rosterConstraint) return rosterConstraint;

  if (
    model.includes("kling-video/v3") ||
    model.includes("kling-video/o3")
  ) {
    return {
      kind: "enum",
      values: KLING_THREE_TO_FIFTEEN_SECONDS,
      defaultValue: 5,
      providerValueType: "string",
    };
  }

  if (model.includes("bytedance/seedance/v1")) {
    return {
      kind: "enum",
      values: TWO_TO_TWELVE_SECONDS,
      defaultValue: 5,
      providerValueType: "string",
    };
  }

  if (model.includes("sora-2")) {
    return {
      kind: "enum",
      values: SORA_TWO_SECONDS,
      defaultValue: 4,
      providerValueType: "number",
    };
  }

  if (model.includes("pixverse/v6")) {
    return {
      kind: "integerRange",
      min: 1,
      max: 15,
      defaultValue: 5,
    };
  }

  if (model.includes("ltx-2-19b")) {
    return {
      kind: "frameCount",
      defaultValue: 5,
      fps: 25,
    };
  }

  return null;
}

function finiteDurationValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function closestDurationValue(value: number, values: number[]): number {
  return values.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest
  );
}

export function defaultDurationForFalVideoModel(modelId: string | undefined): number {
  return falVideoDurationConstraintForModel(modelId)?.defaultValue ?? 5;
}

export function durationForSelectedFalVideoModel(
  modelId: string,
  currentValue: unknown
): number {
  const constraint = falVideoDurationConstraintForModel(modelId);
  const currentDuration = finiteDurationValue(currentValue);
  if (!constraint || !currentDuration) return defaultDurationForFalVideoModel(modelId);

  if (constraint.kind === "enum") {
    return constraint.values.includes(currentDuration)
      ? currentDuration
      : closestDurationValue(Math.round(currentDuration), constraint.values);
  }

  if (constraint.kind === "integerRange") {
    return Math.max(
      constraint.min,
      Math.min(constraint.max, Math.round(currentDuration))
    );
  }

  return Math.round(currentDuration);
}

export function normalizeFalVideoDurationForModel(
  modelId: string,
  value: unknown
): number | string | undefined {
  const duration = finiteDurationValue(value);
  if (!duration) return undefined;

  const constraint = falVideoDurationConstraintForModel(modelId);
  if (!constraint) return duration;

  if (constraint.kind === "enum") {
    const normalized = closestDurationValue(Math.round(duration), constraint.values);
    if (constraint.providerValueType === "secondsString") return `${normalized}s`;
    return constraint.providerValueType === "string" ? String(normalized) : normalized;
  }

  if (constraint.kind === "integerRange") {
    return Math.max(constraint.min, Math.min(constraint.max, Math.round(duration)));
  }

  return undefined;
}

export function falVideoFrameCountForDuration(
  modelId: string,
  value: unknown
): number | undefined {
  const duration = finiteDurationValue(value);
  const constraint = falVideoDurationConstraintForModel(modelId);
  if (!duration || constraint?.kind !== "frameCount") return undefined;
  return Math.max(1, Math.round(duration * constraint.fps));
}

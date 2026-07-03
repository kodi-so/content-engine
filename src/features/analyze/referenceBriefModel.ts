export type ReferenceBriefSourceType = "video" | "slideshow" | "image" | "audio" | "unknown";

export type ReferenceBrief = {
  sourceType?: ReferenceBriefSourceType;
  oneLineSummary?: string;
  coreIdea?: string;
  hook?: string;
  structure?: string[];
  keyVisuals?: string[];
  visibleText?: string[];
  audioRole?: string;
  reusablePattern?: string;
  doNotCopy?: string[];
  suggestedUses?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

function sourceTypeValue(value: unknown): ReferenceBriefSourceType | undefined {
  if (
    value === "video" ||
    value === "slideshow" ||
    value === "image" ||
    value === "audio" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function mergeArrays(...arrays: string[][]) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const array of arrays) {
    for (const item of array) {
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(item);
    }
  }
  return merged;
}

export function referenceBriefFromResult(
  result: unknown,
  fallback: {
    sourceType?: ReferenceBriefSourceType;
    summary?: string;
  } = {}
): ReferenceBrief | undefined {
  const record = isRecord(result) ? result : {};
  const brief = isRecord(record.referenceBrief) ? record.referenceBrief : {};
  const creativeAnalysis = isRecord(record.creativeAnalysis) ? record.creativeAnalysis : {};
  const reuseBrief = isRecord(record.reuseBrief) ? record.reuseBrief : {};
  const visuals = isRecord(record.visuals) ? record.visuals : {};
  const audio = isRecord(record.audio) ? record.audio : {};
  const slideshow = isRecord(record.slideshow) ? record.slideshow : {};
  const slides = Array.isArray(slideshow.slides) ? slideshow.slides.filter(isRecord) : [];
  const slideText = slides.flatMap((slide) => stringArrayValue(slide.visibleText));
  const slideDescriptions = slides
    .map((slide, index) => {
      const description = stringValue(slide.imageDescription);
      return description ? `Slide ${index + 1}: ${description}` : "";
    })
    .filter(Boolean);

  const normalized: ReferenceBrief = {
    sourceType:
      sourceTypeValue(brief.sourceType) ??
      fallback.sourceType ??
      (slides.length ? "slideshow" : undefined),
    oneLineSummary:
      stringValue(brief.oneLineSummary) ||
      stringValue(record.summary) ||
      stringValue(fallback.summary) ||
      undefined,
    coreIdea: stringValue(brief.coreIdea) || stringValue(record.summary) || undefined,
    hook: stringValue(brief.hook) || stringValue(creativeAnalysis.hook) || undefined,
    structure: mergeArrays(
      stringArrayValue(brief.structure),
      stringArrayValue(creativeAnalysis.structure)
    ),
    keyVisuals: mergeArrays(
      stringArrayValue(brief.keyVisuals),
      stringArrayValue(visuals.subjects),
      slideDescriptions
    ),
    visibleText: mergeArrays(
      stringArrayValue(brief.visibleText),
      stringArrayValue(visuals.onScreenText),
      slideText
    ),
    audioRole:
      stringValue(brief.audioRole) ||
      stringValue(audio.musicAndSound) ||
      stringValue(audio.speechDelivery) ||
      undefined,
    reusablePattern:
      stringValue(brief.reusablePattern) ||
      stringValue(reuseBrief.copyablePattern) ||
      undefined,
    doNotCopy: mergeArrays(
      stringArrayValue(brief.doNotCopy),
      stringArrayValue(creativeAnalysis.risksToAvoid)
    ),
    suggestedUses: stringArrayValue(brief.suggestedUses),
  };

  const hasContent = Object.entries(normalized).some(([key, value]) => {
    if (key === "sourceType") return false;
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  return hasContent ? normalized : undefined;
}

export type CaptionTimingWord = {
  text: string;
  startSeconds: number;
  endSeconds: number;
};

export type CaptionTimingSegment = {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  words: CaptionTimingWord[];
};

const WORDS_PER_SECOND = 2.5;
const MAX_SEGMENT_WORDS = 5;
const MAX_SEGMENT_SECONDS = 2.5;

export function estimateSpeechDurationSeconds(text: string) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.5, wordCount / WORDS_PER_SECOND);
}

// Distributes word timing across the measured audio duration weighted by word
// length (chars + 1), which tracks natural speech pacing closely enough for
// short-form captions when the provider returns no timestamps.
export function estimateCaptionSegments(
  text: string,
  durationSeconds?: number
): CaptionTimingSegment[] {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];

  const totalDuration = Math.max(0.5, durationSeconds ?? estimateSpeechDurationSeconds(text));
  const weights = words.map((word) => word.length + 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  const timedWords: CaptionTimingWord[] = [];
  let cursor = 0;
  for (let index = 0; index < words.length; index += 1) {
    const wordDuration = (weights[index] / totalWeight) * totalDuration;
    timedWords.push({
      text: words[index],
      startSeconds: cursor,
      endSeconds: Math.min(totalDuration, cursor + wordDuration),
    });
    cursor += wordDuration;
  }

  const segments: CaptionTimingSegment[] = [];
  let segmentWords: CaptionTimingWord[] = [];

  const flush = () => {
    if (!segmentWords.length) return;
    segments.push({
      id: `caption-${segments.length + 1}`,
      text: segmentWords.map((word) => word.text).join(" "),
      startSeconds: segmentWords[0].startSeconds,
      endSeconds: segmentWords[segmentWords.length - 1].endSeconds,
      words: segmentWords,
    });
    segmentWords = [];
  };

  for (const word of timedWords) {
    segmentWords.push(word);
    const segmentDuration = word.endSeconds - segmentWords[0].startSeconds;
    const endsSentence = /[.!?]$/.test(word.text);
    if (
      segmentWords.length >= MAX_SEGMENT_WORDS ||
      segmentDuration >= MAX_SEGMENT_SECONDS ||
      endsSentence
    ) {
      flush();
    }
  }
  flush();

  return segments;
}

type ProviderWordTimestamp = {
  text?: unknown;
  word?: unknown;
  start?: unknown;
  end?: unknown;
  startSeconds?: unknown;
  endSeconds?: unknown;
  timestamp?: unknown;
};

// Maps provider timestamp payloads (word-level ASR/TTS timing) onto caption
// segments. Accepts the common shapes: {word|text, start|startSeconds, end|endSeconds}
// or {text, timestamp: [start, end]}.
export function segmentsFromProviderTimestamps(value: unknown): CaptionTimingSegment[] {
  if (!Array.isArray(value)) return [];
  const timedWords = value.flatMap((item): CaptionTimingWord[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as ProviderWordTimestamp;
    const text = typeof record.text === "string"
      ? record.text.trim()
      : typeof record.word === "string"
        ? record.word.trim()
        : "";
    if (!text) return [];
    const timestampPair = Array.isArray(record.timestamp) ? record.timestamp : undefined;
    const start = finite(record.start) ?? finite(record.startSeconds) ?? finite(timestampPair?.[0]);
    const end = finite(record.end) ?? finite(record.endSeconds) ?? finite(timestampPair?.[1]);
    if (start === undefined || end === undefined || end < start) return [];
    return [{ text, startSeconds: start, endSeconds: end }];
  });
  if (!timedWords.length) return [];

  const segments: CaptionTimingSegment[] = [];
  let segmentWords: CaptionTimingWord[] = [];
  const flush = () => {
    if (!segmentWords.length) return;
    segments.push({
      id: `caption-${segments.length + 1}`,
      text: segmentWords.map((word) => word.text).join(" "),
      startSeconds: segmentWords[0].startSeconds,
      endSeconds: segmentWords[segmentWords.length - 1].endSeconds,
      words: segmentWords,
    });
    segmentWords = [];
  };
  for (const word of timedWords) {
    segmentWords.push(word);
    const segmentDuration = word.endSeconds - segmentWords[0].startSeconds;
    if (
      segmentWords.length >= MAX_SEGMENT_WORDS ||
      segmentDuration >= MAX_SEGMENT_SECONDS ||
      /[.!?]$/.test(word.text)
    ) {
      flush();
    }
  }
  flush();
  return segments;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

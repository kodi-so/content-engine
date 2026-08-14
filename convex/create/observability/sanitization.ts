const MAX_TRACE_DEPTH = 6;
const MAX_TRACE_ARRAY_ITEMS = 100;
const MAX_TRACE_OBJECT_KEYS = 100;
const MAX_TRACE_STRING_LENGTH = 24_000;
const MAX_TRACE_DETAILS_LENGTH = 200_000;

const secretKeyPattern = /(?:authorization|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|token$|secret|password|credential|cookie|base64|binary|bytes)/i;
const signedUrlParameterPattern = /(?:x-amz-|x-goog-|signature|sig|token|key|credential|expires)/i;

function redactSignedUrl(value: string) {
  try {
    const url = new URL(value);
    if ([...url.searchParams.keys()].some((key) => signedUrlParameterPattern.test(key))) {
      url.search = "";
      url.hash = "";
      return `${url.toString()}[signed query redacted]`;
    }
  } catch {
    // Keep non-URL strings untouched.
  }
  return value;
}

function sanitizeTraceString(value: string) {
  const redacted = value.replace(
    /https?:\/\/[^\s<>"']+/gi,
    (candidate) => redactSignedUrl(candidate)
  );
  return redacted.length > MAX_TRACE_STRING_LENGTH
    ? `${redacted.slice(0, MAX_TRACE_STRING_LENGTH)}…[truncated ${redacted.length - MAX_TRACE_STRING_LENGTH} chars]`
    : redacted;
}

function sanitizeTraceValue(
  value: unknown,
  depth = 0
): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return sanitizeTraceString(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeTraceString(value.message),
    };
  }
  if (depth >= MAX_TRACE_DEPTH) return "[max depth reached]";
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, MAX_TRACE_ARRAY_ITEMS)
      .map((item) => sanitizeTraceValue(item, depth + 1))
      .filter((item) => item !== undefined);
    if (value.length > MAX_TRACE_ARRAY_ITEMS) {
      sanitized.push(`[${value.length - MAX_TRACE_ARRAY_ITEMS} more items]`);
    }
    return sanitized;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of entries.slice(0, MAX_TRACE_OBJECT_KEYS)) {
      if (secretKeyPattern.test(key)) {
        sanitized[key] = "[redacted]";
        continue;
      }
      const nested = sanitizeTraceValue(nestedValue, depth + 1);
      if (nested !== undefined) sanitized[key] = nested;
    }
    if (entries.length > MAX_TRACE_OBJECT_KEYS) {
      sanitized._truncatedKeys = entries.length - MAX_TRACE_OBJECT_KEYS;
    }
    return sanitized;
  }
  return String(value);
}

export function sanitizeCreateTraceDetails(value: unknown): unknown {
  const sanitized = sanitizeTraceValue(value);
  const serialized = JSON.stringify(sanitized);
  if (!serialized || serialized.length <= MAX_TRACE_DETAILS_LENGTH) return sanitized;
  return {
    truncated: true,
    originalSerializedLength: serialized.length,
    preview: `${serialized.slice(0, MAX_TRACE_DETAILS_LENGTH)}…[trace details truncated]`,
  };
}

export function sanitizeCreateTraceSummary(value: string) {
  return sanitizeTraceString(value);
}

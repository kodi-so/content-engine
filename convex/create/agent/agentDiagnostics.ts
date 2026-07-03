import { isProviderError } from "../../providers/errors";

const AGENT_ERROR_LOG_TEXT_LIMIT = 8000;

export function compactLogValue(value: unknown, limit = AGENT_ERROR_LOG_TEXT_LIMIT) {
  if (value === undefined || value === null) return undefined;

  const text = typeof value === "string"
    ? value
    : value instanceof Error
      ? `${value.name}: ${value.message}`
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  return text.length > limit ? `${text.slice(0, limit)}...[truncated]` : text;
}

export function createAgentDecisionErrorLog(error: unknown) {
  if (isProviderError(error)) {
    return {
      name: error.name,
      message: error.message,
      provider: error.provider,
      operation: error.operation,
      code: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      detailsPreview: compactLogValue(error.details),
      causePreview: compactLogValue(error.cause, 1200),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stackPreview: compactLogValue(error.stack, 2400),
    };
  }

  return {
    message: "Unknown non-Error thrown",
    detailsPreview: compactLogValue(error),
  };
}

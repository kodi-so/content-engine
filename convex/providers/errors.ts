export type ProviderKind = "publishing" | "model";

export type ProviderErrorCode =
  | "configuration"
  | "authentication"
  | "authorization"
  | "validation"
  | "rate_limit"
  | "not_found"
  | "conflict"
  | "unsupported"
  | "temporary"
  | "provider"
  | "unknown";

export interface ProviderErrorOptions {
  kind: ProviderKind;
  provider: string;
  operation: string;
  code?: ProviderErrorCode;
  statusCode?: number;
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly kind: ProviderKind;
  readonly provider: string;
  readonly operation: string;
  readonly code: ProviderErrorCode;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.kind = options.kind;
    this.provider = options.provider;
    this.operation = options.operation;
    this.code = options.code ?? "unknown";
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function toProviderError(
  error: unknown,
  options: Omit<ProviderErrorOptions, "cause">
): ProviderError {
  if (isProviderError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ProviderError(error.message, {
      ...options,
      cause: error,
    });
  }

  return new ProviderError("Unexpected provider error", {
    ...options,
    details: error,
  });
}

export function unsupportedProviderOperation(
  kind: ProviderKind,
  provider: string,
  operation: string,
  reason?: string
): ProviderError {
  return new ProviderError(
    reason ?? `${provider} does not support ${operation}`,
    {
      kind,
      provider,
      operation,
      code: "unsupported",
    }
  );
}

export function missingProviderConfiguration(
  kind: ProviderKind,
  provider: string,
  variableName: string
): ProviderError {
  return new ProviderError(
    `${provider} requires ${variableName} to be configured`,
    {
      kind,
      provider,
      operation: "configure",
      code: "configuration",
    }
  );
}

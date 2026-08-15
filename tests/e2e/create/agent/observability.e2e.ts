import assert from "node:assert/strict";
import { observeContentRequestModelCall } from "../../../../convex/create/observability/modelTracing";
import { sanitizeCreateTraceDetails } from "../../../../convex/create/observability/sanitization";

const sanitized = sanitizeCreateTraceDetails({
  prompt: "Create a cinematic launch video.",
  apiKey: "should-never-appear",
  providerToken: "should-never-appear",
  nested: {
    Authorization: "Bearer should-never-appear",
    sourceUrl: "https://cdn.example.com/source.png?X-Amz-Signature=secret&X-Amz-Expires=60",
    ordinaryUrl: "https://example.com/reference.png?variant=large",
  },
}) as Record<string, unknown>;

assert.equal(sanitized.prompt, "Create a cinematic launch video.");
assert.equal(sanitized.apiKey, "[redacted]");
assert.equal(sanitized.providerToken, "[redacted]");
assert.deepEqual(sanitized.nested, {
  Authorization: "[redacted]",
  sourceUrl: "https://cdn.example.com/source.png[signed query redacted]",
  ordinaryUrl: "https://example.com/reference.png?variant=large",
});

const longPrompt = "x".repeat(25_000);
const truncated = sanitizeCreateTraceDetails(longPrompt) as string;
assert.ok(truncated.length < longPrompt.length);
assert.match(truncated, /truncated 1000 chars/);

const structuredInput = sanitizeCreateTraceDetails({
  prompt: "Plan a slideshow.",
  parser: () => ({ slides: [] }),
}) as Record<string, unknown>;
assert.deepEqual(structuredInput, { prompt: "Plan a slideshow." });

const tracedError = sanitizeCreateTraceDetails(
  new Error("Trace failed")
) as Record<string, unknown>;
assert.equal(tracedError.name, "Error");
assert.equal(tracedError.message, "Trace failed");
assert.equal(typeof tracedError.stack, "string");

const recordedEvents: Array<Record<string, unknown>> = [];
let modelExecuted = false;
const successfulResult = await observeContentRequestModelCall(
  {
    runMutation: async (_functionReference: unknown, args: Record<string, unknown>) => {
      recordedEvents.push(args);
      return null;
    },
  } as never,
  {
    requestId: "content-request-id" as never,
    operationId: "content-request:content-request-id:model:slideshow-plan:attempt:1",
    provider: "openrouter",
    modelId: "openai/gpt-4.1",
    attempt: 1,
    input: {
      prompt: "Plan a slideshow.",
      parser: () => ({ slides: [] }),
    },
    startedSummary: "Started slideshow planning.",
    completedSummary: "Completed slideshow planning.",
    failedSummary: "Slideshow planning failed.",
    execute: async () => {
      modelExecuted = true;
      return {
        value: "ok",
        metadata: {
          provider: "openrouter" as const,
          model: "openai/gpt-4.1",
          costUsd: 0,
        },
      };
    },
    resultDetails: (result) => ({ value: result.value }),
  }
);

assert.equal(modelExecuted, true);
assert.equal(successfulResult.value, "ok");
assert.equal(recordedEvents.length, 2);
const startedEvent = recordedEvents.find((event) => event.eventType === "model.call.started");
assert.ok(startedEvent);
const startedDetails = startedEvent.details as { input: Record<string, unknown> };
assert.deepEqual(startedDetails.input, { prompt: "Plan a slideshow." });

const originalWarn = console.warn;
const traceWarnings: unknown[][] = [];
console.warn = (...args: unknown[]) => {
  traceWarnings.push(args);
};
let executedDespiteTraceFailure = false;
try {
  const result = await observeContentRequestModelCall(
    {
      runMutation: async () => {
        throw new Error("Trace transport unavailable");
      },
    } as never,
    {
      requestId: "content-request-id" as never,
      operationId: "content-request:content-request-id:model:slideshow-plan:attempt:1",
      provider: "openrouter",
      modelId: "openai/gpt-4.1",
      attempt: 1,
      input: { prompt: "Plan a slideshow." },
      startedSummary: "Started slideshow planning.",
      completedSummary: "Completed slideshow planning.",
      failedSummary: "Slideshow planning failed.",
      execute: async () => {
        executedDespiteTraceFailure = true;
        return {
          value: "ok",
          metadata: {
            provider: "openrouter" as const,
            model: "openai/gpt-4.1",
            costUsd: 0,
          },
        };
      },
      resultDetails: (modelResult) => ({ value: modelResult.value }),
    }
  );
  assert.equal(result.value, "ok");
} finally {
  console.warn = originalWarn;
}

assert.equal(executedDespiteTraceFailure, true);
assert.equal(traceWarnings.length, 2);
assert.match(
  String((traceWarnings[0][1] as { errorMessage?: string }).errorMessage),
  /Trace transport unavailable/
);

console.log("Create observability sanitizer tests passed.");

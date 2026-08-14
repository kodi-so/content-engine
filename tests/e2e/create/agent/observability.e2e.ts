import assert from "node:assert/strict";
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

console.log("Create observability sanitizer tests passed.");

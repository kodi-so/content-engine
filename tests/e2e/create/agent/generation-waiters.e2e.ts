import assert from "node:assert/strict";
import { ProviderError } from "../../../../convex/providers/errors";
import type { ModelProvider } from "../../../../convex/providers/model";
import {
  waitForGeneratedImage,
  waitForGeneratedImages,
} from "../../../../convex/content/requestExecution/generationWaiters";

let retryAttempts = 0;
const retryingProvider = {
  getJobStatus: async () => {
    retryAttempts += 1;
    if (retryAttempts === 1) {
      throw new ProviderError("temporary decode failure", {
        kind: "model",
        provider: "fal",
        operation: "get_job_result",
        code: "temporary",
        retryable: true,
      });
    }

    return {
      jobId: "job_1",
      status: "succeeded",
      assets: [
        {
          url: "https://example.com/image.png",
          data: "https://example.com/image.png",
          mimeType: "image/png",
        },
      ],
      metadata: {
        provider: "fal",
        model: "image-model",
      },
    };
  },
} as unknown as ModelProvider;

const retryingStatuses: string[] = [];
const retriedAsset = await waitForGeneratedImage(
  retryingProvider,
  {
    jobId: "job_1",
    model: "image-model",
    pollIntervalMs: 0,
  },
  async (status) => {
    retryingStatuses.push(status);
  }
);

assert.equal(retryAttempts, 2);
assert.deepEqual(retryingStatuses, ["retrying", "succeeded"]);
assert.equal(retriedAsset.url, "https://example.com/image.png");

const multiImageProvider = {
  getJobStatus: async () => ({
    jobId: "job_multi",
    status: "succeeded",
    assets: [
      {
        url: "https://example.com/before.png",
        data: "https://example.com/before.png",
        mimeType: "image/png",
      },
      {
        url: "https://example.com/after.png",
        data: "https://example.com/after.png",
        mimeType: "image/png",
      },
    ],
    metadata: {
      provider: "fal",
      model: "image-model",
    },
  }),
} as unknown as ModelProvider;

const multiImages = await waitForGeneratedImages(multiImageProvider, {
  jobId: "job_multi",
  model: "image-model",
  pollIntervalMs: 0,
});

assert.deepEqual(
  multiImages.map((asset) => asset.url),
  ["https://example.com/before.png", "https://example.com/after.png"]
);

const failingProvider = {
  getJobStatus: async () => {
    throw new ProviderError("validation failed", {
      kind: "model",
      provider: "fal",
      operation: "get_job_result",
      code: "validation",
      retryable: false,
    });
  },
} as unknown as ModelProvider;

await assert.rejects(
  () =>
    waitForGeneratedImage(failingProvider, {
      jobId: "job_2",
      model: "image-model",
      pollIntervalMs: 0,
    }),
  /validation failed/
);

console.log("Agent Create generation waiter retry contract passed");

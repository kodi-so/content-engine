import type { Doc } from "../../_generated/dataModel";
import type { ReferenceAsset } from "../../providers/model";
import type { ModelProviderName } from "../../providers/model";
import type { WorkflowGraphNodeForRun } from "./executionTypes";
import { numberFromInputValue, objectValue } from "./inputValues";

export function modelProviderNameForNode(node: WorkflowGraphNodeForRun): ModelProviderName {
  switch (node.provider) {
    case "bulkapis":
    case "gemini":
    case "fal":
    case "openrouter":
    case "manual":
      return node.provider;
    default:
      return "bulkapis";
  }
}

export function providerOverridesFromConfig(config: Record<string, unknown>) {
  const overrides = {
    ...objectValue(config.bulkapisInput),
    ...objectValue(config.providerInput),
  };
  const seed = numberFromInputValue(config.seed);
  if (seed !== undefined) overrides.seed = seed;
  return overrides;
}

export function generationProviderInputFromConfig(
  config: Record<string, unknown>,
  excludedKeys: string[]
) {
  const overrides = {
    ...objectValue(config.bulkapisInput),
    ...objectValue(config.providerInput),
  };
  const excluded = new Set([
    ...excludedKeys,
    "bulkapisInput",
    "providerInput",
    "model",
  ]);

  for (const [key, value] of Object.entries(config)) {
    if (excluded.has(key) || value === undefined || value === "") continue;
    overrides[key] = value;
  }

  return overrides;
}

type ImageModelUiContractForRun = {
  prompt: {
    visible: boolean;
    required: boolean;
  };
  images: {
    visible: boolean;
    required: boolean;
    multiple: boolean;
    maxCount?: number;
  };
};

export function imageModelUiContractForRun(model: Doc<"providerModels"> | null): ImageModelUiContractForRun {
  const metadata = objectValue(model?.metadata);
  const uiContract = objectValue(metadata.uiContract);
  const prompt = objectValue(uiContract.prompt);
  const images = objectValue(uiContract.images);
  return {
    prompt: {
      visible: typeof prompt.visible === "boolean" ? prompt.visible : true,
      required: typeof prompt.required === "boolean" ? prompt.required : true,
    },
    images: {
      visible: typeof images.visible === "boolean" ? images.visible : true,
      required: typeof images.required === "boolean" ? images.required : false,
      multiple: typeof images.multiple === "boolean" ? images.multiple : true,
      ...(numberFromInputValue(images.maxCount) !== undefined
        ? { maxCount: numberFromInputValue(images.maxCount) }
        : {}),
    },
  };
}

function providerModelInputSchema(model: Doc<"providerModels"> | null): Record<string, unknown> {
  const schemaSnapshot = objectValue(model?.schemaSnapshot);
  return objectValue(schemaSnapshot.inputSchema);
}

function schemaHasField(schema: Record<string, unknown>, key: string): boolean {
  if (schema[key] !== undefined) return true;
  const properties = objectValue(schema.properties);
  return properties[key] !== undefined;
}

export function imageProviderInputFromModelSchema(args: {
  model: Doc<"providerModels"> | null;
  referenceImages: ReferenceAsset[];
  count: number;
}) {
  const schema = providerModelInputSchema(args.model);
  const urls = args.referenceImages
    .map((referenceImage) => referenceImage.url)
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  const input: Record<string, unknown> = {};

  if (urls.length) {
    if (schemaHasField(schema, "image_url")) input.image_url = urls[0];
    if (schemaHasField(schema, "image")) input.image = urls[0];
    if (schemaHasField(schema, "image_urls")) input.image_urls = urls;
    if (schemaHasField(schema, "image_input")) input.image_input = urls;
    if (schemaHasField(schema, "input_urls")) input.input_urls = urls;
    if (schemaHasField(schema, "reference_image_urls")) input.reference_image_urls = urls;
  }

  if (schemaHasField(schema, "max_images")) {
    input.max_images = args.count;
  }
  if (schemaHasField(schema, "num_images")) {
    input.num_images = args.count;
  }

  return input;
}

import type { Doc } from "../../_generated/dataModel";
import type { ReferenceAsset } from "../model";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberFromInputValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
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
    const imageInputFields = [
      { key: "image_urls", value: urls },
      { key: "input_urls", value: urls },
      { key: "reference_image_urls", value: urls },
      { key: "image_input", value: urls },
      { key: "image_url", value: urls[0] },
      { key: "image", value: urls[0] },
    ];
    const imageInputField = imageInputFields.find((field) => schemaHasField(schema, field.key));
    if (imageInputField) input[imageInputField.key] = imageInputField.value;
  }

  if (schemaHasField(schema, "max_images")) {
    input.max_images = args.count;
  }
  if (schemaHasField(schema, "num_images")) {
    input.num_images = args.count;
  }

  return input;
}

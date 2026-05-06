import { v } from "convex/values";
import { action } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getModelProvider } from "../providers/index";
import {
  buildFullGraphicPlannerPrompt,
  buildOverlayPlannerPrompt,
  buildSingleImagePromptWriterPrompt,
  inferSlideCount,
  normalizePlan,
  type PlannerReference,
  type RequestedRenderingMode,
} from "./planning";
import {
  fullGraphicSlideshowPlanSchema,
  type ImagePromptWriterOutput,
  overlaySlideshowPlanSchema,
  singleFullGraphicImagePromptWriterSchema,
  type SingleImagePromptWriterOutput,
  singleOverlayImagePromptWriterSchema,
  type SlideshowPlannerOutput,
} from "./types";

function planPromptForMode(args: {
  prompt: string;
  revisionPrompt?: string;
  brand: Doc<"brands">;
  socialAccount?: Doc<"socialAccounts"> | null;
  targetSlideCount: number;
  slideCountReasoning: string;
  requestedRenderingMode: RequestedRenderingMode;
  references: PlannerReference[];
}) {
  return args.requestedRenderingMode === "full_graphic_generation"
    ? buildFullGraphicPlannerPrompt(args)
    : buildOverlayPlannerPrompt(args);
}

function planSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? fullGraphicSlideshowPlanSchema
    : overlaySlideshowPlanSchema;
}

function singleImagePromptSchemaForMode(renderingMode: RequestedRenderingMode) {
  return renderingMode === "full_graphic_generation"
    ? singleFullGraphicImagePromptWriterSchema
    : singleOverlayImagePromptWriterSchema;
}

export const slideshowPromptPlan = action({
  args: {
    prompt: v.string(),
    requestedRenderingMode: v.union(
      v.literal("background_plus_overlay"),
      v.literal("full_graphic_generation")
    ),
    revisionPrompt: v.optional(v.string()),
    brand: v.optional(v.object({
      name: v.string(),
      audience: v.optional(v.string()),
      voice: v.optional(v.string()),
      visualStyle: v.optional(v.string()),
      constraints: v.optional(v.array(v.string())),
    })),
    references: v.optional(v.array(v.object({
      assetId: v.optional(v.string()),
      name: v.string(),
      type: v.string(),
      description: v.optional(v.string()),
      instruction: v.optional(v.string()),
    }))),
  },
  handler: async (_ctx, args) => {
    const requestedRenderingMode = args.requestedRenderingMode;
    const slideCountHint = inferSlideCount(args.prompt);
    const brand = {
      name: args.brand?.name ?? "Contour",
      audience: args.brand?.audience,
      voice: args.brand?.voice,
      visualStyle: args.brand?.visualStyle,
      constraints: args.brand?.constraints,
    } as Doc<"brands">;
    const references: PlannerReference[] = (args.references ?? []).map((reference, index) => ({
      assetId: reference.assetId ?? `dry-run-reference-${index + 1}`,
      name: reference.name,
      type: reference.type,
      description: reference.description,
      instruction: reference.instruction,
    }));

    const textProvider = getModelProvider("openrouter");
    const plannerPrompt = planPromptForMode({
      prompt: args.prompt,
      revisionPrompt: args.revisionPrompt,
      brand,
      socialAccount: null,
      targetSlideCount: slideCountHint.targetSlideCount,
      slideCountReasoning: slideCountHint.reasoning,
      requestedRenderingMode,
      references,
    });
    const structured = await textProvider.generateStructured<SlideshowPlannerOutput>({
      systemPrompt: "You are a senior short-form content creative director and slideshow planner.",
      prompt: plannerPrompt,
      schema: planSchemaForMode(requestedRenderingMode),
      schemaName: "slideshow_create_plan",
      model: process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() || undefined,
      temperature: 0.7,
      parser: (text) => JSON.parse(text) as SlideshowPlannerOutput,
    });

    const rawSlides = Array.isArray((structured.object as { slides?: unknown }).slides)
      ? (structured.object as { slides: unknown[] }).slides
      : [];
    const imagePromptResults = await Promise.all(rawSlides.map(async (slide) => {
      return await textProvider.generateStructured<SingleImagePromptWriterOutput>({
        systemPrompt: "You are a specialist image prompt writer for short-form social visuals. You write plain-text image generation prompts with markdown section headings inside JSON string fields.",
        prompt: buildSingleImagePromptWriterPrompt({
          prompt: args.prompt,
          revisionPrompt: args.revisionPrompt,
          brand,
          socialAccount: null,
          targetSlideCount: slideCountHint.targetSlideCount,
          slideCountReasoning: slideCountHint.reasoning,
          requestedRenderingMode,
          references,
          plan: structured.object,
          slide,
        }),
        schema: singleImagePromptSchemaForMode(requestedRenderingMode),
        schemaName: "slideshow_single_image_prompt",
        model: process.env.CONTENT_ENGINE_IMAGE_PROMPT_TEXT_MODEL?.trim() ||
          process.env.CONTENT_ENGINE_TEXT_MODEL?.trim() ||
          "openai/gpt-4.1",
        temperature: 0.2,
        parser: (text) => JSON.parse(text) as SingleImagePromptWriterOutput,
      });
    }));
    const imagePrompts = {
      renderingMode: requestedRenderingMode,
      slides: imagePromptResults.map((result) => result.object),
    } as ImagePromptWriterOutput;

    const plan = normalizePlan(
      structured.object,
      imagePrompts,
      args.prompt,
      args.revisionPrompt,
      slideCountHint.targetSlideCount,
      requestedRenderingMode
    );

    return {
      slideCountHint,
      plannerMetadata: structured.metadata,
      imagePromptMetadata: imagePromptResults.map((result) => result.metadata),
      plannerOutput: structured.object,
      imagePromptOutput: imagePrompts,
      plan,
    };
  },
});

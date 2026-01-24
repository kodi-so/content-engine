// Simple slideshow generation - no abstraction layers
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { generateText, ReferenceImage } from "../providers/gemini";

/**
 * Generate a carousel slideshow (simple version - delegates to generateWithConfig)
 * Only saves to DB on success - no intermediate status tracking
 */
export const generate = action({
  args: {
    productId: v.optional(v.id("products")),
    topic: v.string(),
    slideCount: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ contentId: Id<"content">; success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Extract image style from topic if mentioned
    const styleMatch = args.topic.match(/(?:style|aesthetic|look):\s*([^,\.]+)/i);
    const extractedStyle = styleMatch ? styleMatch[1].trim() : null;

    // Delegate to generateWithConfig for consistent structured slide generation
    const result = await ctx.runAction(api.slideshows.generate.generateWithConfig, {
      productId: args.productId,
      topic: args.topic,
      slideCount: args.slideCount,
      formatConfig: extractedStyle ? { visualStyle: extractedStyle } : undefined,
    });

    if (!result.success || !result.contentId) {
      throw new Error(result.error || "Failed to generate slideshow");
    }

    return { contentId: result.contentId, success: true };
  },
});

// Text element for flexible text positioning (like Canva)
interface TextElement {
  id: string;
  content: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  fontSize: number;
  fontColor?: string;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
}

// Slide with text elements array
interface GeneratedSlide {
  textElements: TextElement[];
}

// Helper to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Extract the number from a topic if it contains one (e.g., "5 micro-habits" -> 5)
 */
function extractNumberFromTopic(topic: string): number | null {
  const match = topic.match(/(\d+)\s+\w+/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Generate a carousel slideshow with format configuration
 * Uses structured slide format for better typography
 * Optionally uses reference images from user's library for consistent visual identity
 */
export const generateWithConfig = action({
  args: {
    productId: v.optional(v.id("products")),
    accountId: v.optional(v.id("accounts")), // TikTok account (for associating content)
    topic: v.string(),
    slideCount: v.optional(v.number()),
    // Reference images from user's library
    referenceImageIds: v.optional(v.array(v.id("referenceImages"))),
    characterInstructions: v.optional(v.string()), // Instructions for how to use references
    formatConfig: v.optional(
      v.object({
        visualStyle: v.optional(v.string()),
        aspectRatio: v.optional(
          v.union(v.literal("1:1"), v.literal("4:5"), v.literal("9:16"))
        ),
        contentStyle: v.optional(
          v.union(v.literal("overlay"), v.literal("infographic"))
        ),
        textStyle: v.optional(
          v.object({
            maxCharsPerSlide: v.optional(v.number()),
            tone: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ contentId?: Id<"content">; success: boolean; error?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    try {
      // Fetch reference images from user's library if IDs provided
      let referenceImages: ReferenceImage[] = [];
      let characterInstructions: string | null = args.characterInstructions || null;

      if (args.referenceImageIds && args.referenceImageIds.length > 0) {
        // Get the reference image documents
        const refImageDocs = await ctx.runQuery(internal.referenceImages.getByIds, {
          ids: args.referenceImageIds,
        });

        if (refImageDocs.length > 0) {
          // Fetch and convert to base64
          const imageUrls = refImageDocs.map((r) => r.storageUrl);
          referenceImages = await ctx.runAction(api.storage.fetchReferenceImages, {
            imageUrls,
          });

          // Auto-build character instructions from image descriptions if not provided
          if (!characterInstructions) {
            const descriptions = refImageDocs
              .filter((r) => r.description)
              .map((r, i) => `Reference ${i + 1} (${r.name}): ${r.description}`)
              .join("\n");
            if (descriptions) {
              characterInstructions = descriptions;
            }
          }
        }
      }

      const hasReferences = referenceImages.length > 0;

      // Determine slide count based on topic content
      const topicNumber = extractNumberFromTopic(args.topic);
      let slideCount = args.slideCount || 5;

      // If topic has a number like "5 habits", use that + 1 for title slide
      if (topicNumber && topicNumber >= 2 && topicNumber <= 10) {
        slideCount = topicNumber + 1; // +1 for title slide
      }

      const visualStyle = args.formatConfig?.visualStyle;
      const aspectRatio = args.formatConfig?.aspectRatio || "4:5";
      const contentStyle = args.formatConfig?.contentStyle || "overlay";
      const isInfographic = contentStyle === "infographic";

      // Build style instruction for image prompts
      const styleInstruction = visualStyle
        ? `Visual style preference: "${visualStyle}"`
        : "Visual style: modern, minimal, professional";

      // Build character instructions for the text generation prompt
      const characterPromptSection = hasReferences && characterInstructions
        ? `

CHARACTER/REFERENCE INSTRUCTIONS:
This account has a consistent character/mascot/persona that should appear in the images.
${characterInstructions}

For each image prompt:
- Describe what ACTION or POSE the character should take in that scene
- The character should naturally fit into the slide's message
- Example: "The character confidently pointing at a glass of water, demonstrating the hydration habit"`
        : "";

      // Step 1: Generate text content AND image prompts in a single AI call
      // Different prompts based on content style
      const prompt = isInfographic
        ? `Generate content for a ${slideCount}-slide carousel about: "${args.topic}"

INFOGRAPHIC MODE - The text will be BAKED INTO the AI-generated image, not overlaid.

STRUCTURE:
- Slide 1 is the TITLE SLIDE: Bold title text as part of the graphic
- Slides 2-${slideCount} are CONTENT SLIDES: Each covers one specific point/tip/habit from the topic

FOR EACH SLIDE, provide an imagePrompt that includes:
1. The exact text/heading that should appear IN the image
2. Typography instructions (font style, placement, size emphasis)
3. Visual design elements (illustrations, icons, backgrounds)
4. Layout description (where text sits relative to visuals)

INFOGRAPHIC RULES:
- ${styleInstruction}
- Text should be visually integrated with the design (not floating over a photo)
- Include specific typography: bold headlines, clean readable fonts
- Describe any illustrations, icons, or diagrams that support the text
- Create visual cohesion across slides (consistent color palette, typography)
- Text placement: specify TOP, CENTER, BOTTOM, LEFT, RIGHT
- Include decorative elements that enhance the message${characterPromptSection}

Return ONLY valid JSON with EXACTLY ${slideCount} slides:
{
  "slides": [
    { "title": "${args.topic}", "imagePrompt": "Full infographic design with title '${args.topic}' in large bold text at center, decorative elements..." },
    { "heading": "1. First point", "imagePrompt": "Infographic with text '1. First point' at top, illustration of [concept] below, supporting detail..." }
  ]
}`
        : `Generate content for a ${slideCount}-slide carousel about: "${args.topic}"

STRUCTURE:
- Slide 1 is the TITLE SLIDE: Use the exact topic as the title
- Slides 2-${slideCount} are CONTENT SLIDES: Each covers one specific point/tip/habit from the topic

FOR EACH SLIDE, provide:
1. The text that should appear on the slide
2. An image prompt describing the background visual

TEXT RULES:
- Match the tone naturally to the topic (informative for educational content, actionable for self-improvement, conversational for lifestyle, etc.)
- NO all-caps words (except acronyms)
- NO exclamation points (or at most one per carousel)
- Be specific and actionable, not vague motivation
- Keep text concise - it needs to fit on an image
- Headings should be 3-10 words max
- Body text (if any) should be 1-2 sentences max

IMAGE PROMPT RULES:
- ${styleInstruction}
- Describe specific, concrete visuals (e.g., "glass of water on wooden nightstand with soft morning light")
- Images should work as backgrounds for text overlay (clean areas, not too busy)
- Create visual cohesion across slides (consistent style/mood)
- For the TITLE SLIDE: Create a thematic hero image that captures the overall mood, NOT a literal visualization
- For CONTENT SLIDES: Visualize the specific concept of each slide
- NEVER include text in the image description${characterPromptSection}

Return ONLY valid JSON with EXACTLY ${slideCount} slides:
{
  "slides": [
    { "title": "${args.topic}", "imagePrompt": "thematic hero image description" },
    { "heading": "1. First point", "body": "Optional supporting text", "imagePrompt": "concrete visual for this point" },
    { "heading": "2. Second point", "imagePrompt": "concrete visual for this point" }
  ]
}`;

      const textResponse = await generateText(
        prompt,
        "You are a social media content expert who creates high-converting carousel posts. Your content is specific, actionable, and valuable - never generic or vague. You also have excellent visual design sense.",
        {
          model: "gemini-2.0-flash",
          responseFormat: { type: "json_object" },
        }
      );

      // Parse the response
      const parsed = JSON.parse(textResponse.text);
      // Limit to requested slideCount in case AI generates more
      const rawSlides: Array<{ title?: string; heading?: string; body?: string; imagePrompt?: string }> = (parsed.slides || []).slice(0, slideCount);

      // Convert to slides with text elements and extract image prompts
      const generatedSlides: GeneratedSlide[] = [];
      const imagePrompts: string[] = [];

      for (let index = 0; index < rawSlides.length; index++) {
        const slide = rawSlides[index];
        const textElements: TextElement[] = [];

        // Only create text elements for overlay mode (not infographic)
        if (!isInfographic) {
          if (index === 0 && slide.title) {
            // Title slide - single centered text element
            textElements.push({
              id: generateId(),
              content: slide.title,
              position: { x: 50, y: 50 },
              size: { width: 75, height: 30 },
              fontSize: 56,
            });
          } else {
            // Content slide - heading + optional body
            if (slide.heading) {
              textElements.push({
                id: generateId(),
                content: slide.heading,
                position: { x: 50, y: 30 },
                size: { width: 75, height: 20 },
                fontSize: 56,
              });
            }

            if (slide.body) {
              textElements.push({
                id: generateId(),
                content: slide.body,
                position: { x: 50, y: 65 },
                size: { width: 75, height: 35 },
                fontSize: 44,
              });
            }
          }
        }

        generatedSlides.push({ textElements });

        // Use provided imagePrompt or create a fallback
        const fallbackPrompt = slide.title || slide.heading || `Slide ${index + 1}`;
        imagePrompts.push(slide.imagePrompt || `A visually appealing background for: ${fallbackPrompt}`);
      }

      // Step 2: Generate images using the prompts from the same AI call
      // Pass reference images if available
      const imageResponse = await generateCarouselImagesWithAspectRatio(
        imagePrompts,
        visualStyle,
        aspectRatio,
        referenceImages,
        characterInstructions,
        isInfographic
      );

      // Step 3: Upload images to Convex storage
      const storageUrls = await ctx.runAction(api.storage.uploadBase64Images, {
        base64DataArray: imageResponse.images,
      });

      // Step 4: Create final slides with text elements
      // Only create slides for which we have images (in case of mismatch)
      const slideCount_actual = Math.min(generatedSlides.length, storageUrls.length);

      const slides = generatedSlides.slice(0, slideCount_actual).map((slide, index) => ({
        imageUrl: storageUrls[index],
        imagePrompt: imagePrompts[index],
        textElements: slide.textElements,
        overlay: !isInfographic, // Overlay for text mode, no overlay for infographic (text is baked in)
      }));

      // Step 5: Save completed slideshow to DB
      const contentId = await ctx.runMutation(api.content.create, {
        userId: identity.subject,
        productId: args.productId,
        accountId: args.accountId, // Save accountId for future reference
        inputParams: {
          topic: args.topic,
          slideCount,
        },
        content: {
          type: "carousel",
          slides,
          config: {
            aspectRatio,
          },
        },
      });

      return { contentId, success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Helper to generate carousel images with a specific aspect ratio
 * Optionally uses reference images for character/style consistency
 */
async function generateCarouselImagesWithAspectRatio(
  visualDescriptions: string[],
  userStyle: string | null | undefined,
  aspectRatio: "1:1" | "4:5" | "9:16",
  referenceImages?: ReferenceImage[],
  characterInstructions?: string | null,
  isInfographic: boolean = false
): Promise<{ images: string[]; cost: number }> {
  const { generateImages } = await import("../providers/gemini");

  const styleHint = userStyle || "modern, minimal, professional";
  const hasReferences = referenceImages && referenceImages.length > 0;

  const results = await Promise.all(
    visualDescriptions.map(async (visualDescription) => {
      let prompt: string;

      if (isInfographic) {
        // Infographic mode: text is baked into the image
        prompt = `Create a high-quality infographic image:

${visualDescription}

Requirements:
- This is an INFOGRAPHIC - text should be beautifully integrated into the design
- Use clean, readable typography for any text
- Professional graphic design with visual hierarchy
- Fill the entire frame edge-to-edge, no borders or margins
- Bold, clear text that is easy to read
- Cohesive color scheme and visual style

Style: ${styleHint}`;
      } else {
        // Overlay mode: image as background for text overlay
        prompt = `Create a high-quality image: ${visualDescription}

Requirements:
- Clean composition suitable for text overlay
- High contrast areas for text readability
- NO TEXT in the image
- Fill the entire frame edge-to-edge, no borders, margins, or white space around the edges

Style: ${styleHint}`;
      }

      // Add character/reference instructions if provided
      if (hasReferences && characterInstructions) {
        prompt += `

IMPORTANT - Maintain visual consistency with the reference image(s):
${characterInstructions}`;
      }

      const response = await generateImages(prompt, {
        aspectRatio,
        referenceImages: hasReferences ? referenceImages : undefined,
      });
      return response;
    })
  );

  return {
    images: results.map((r) => r.image),
    cost: results.reduce((sum, r) => sum + r.cost, 0),
  };
}

/**
 * Regenerate a single slide's image with a custom prompt
 * Optionally uses reference images from user's library for consistent visual identity
 */
export const regenerateSlideImage = action({
  args: {
    contentId: v.id("content"),
    slideIndex: v.number(),
    prompt: v.string(), // Custom prompt for image generation
    // Optional reference images for this regeneration
    referenceImageIds: v.optional(v.array(v.id("referenceImages"))),
    characterInstructions: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    try {
      // Get the content item (auth check is done in the query)
      const contentItem = await ctx.runQuery(api.content.get, {
        id: args.contentId,
      });

      if (!contentItem) {
        throw new Error("Content item not found");
      }

      const currentSlide = contentItem.content?.slides?.[args.slideIndex];
      if (!currentSlide) {
        throw new Error("Slide not found");
      }

      // Fetch reference images from user's library if IDs provided
      let referenceImages: ReferenceImage[] = [];
      const characterInstructions = args.characterInstructions || null;

      if (args.referenceImageIds && args.referenceImageIds.length > 0) {
        const refImageDocs = await ctx.runQuery(internal.referenceImages.getByIds, {
          ids: args.referenceImageIds,
        });

        if (refImageDocs.length > 0) {
          const imageUrls = refImageDocs.map((r) => r.storageUrl);
          referenceImages = await ctx.runAction(api.storage.fetchReferenceImages, {
            imageUrls,
          });
        }
      }

      // Get aspect ratio from content config
      const aspectRatio = contentItem.content?.config?.aspectRatio || "4:5";

      // Generate a new image for this slide using the custom prompt
      const { generateCarouselImage } = await import("../providers/gemini");
      const result = await generateCarouselImage(
        args.prompt,
        null, // userStyle - prompt already contains style info
        referenceImages.length > 0 ? referenceImages : undefined,
        characterInstructions,
        aspectRatio
      );

      // Upload base64 image to Convex storage and get URL
      const storageUrl = await ctx.runAction(api.storage.uploadBase64Image, {
        base64Data: result.image,
        filename: `slide-${args.slideIndex}`,
      });

      // Delete the old image from storage (fire and forget - don't fail if this fails)
      if (currentSlide.imageUrl) {
        try {
          await ctx.runMutation(api.storage.deleteByUrl, {
            url: currentSlide.imageUrl,
          });
        } catch (e) {
          // Log but don't fail the operation if cleanup fails
          console.error("Failed to delete old image:", e);
        }
      }

      // Update the slide with new image - preserve text elements
      await ctx.runMutation(api.content.updateSlide, {
        id: args.contentId,
        slideIndex: args.slideIndex,
        slide: {
          imageUrl: storageUrl,
          imagePrompt: args.prompt, // Overwrite with new prompt
          textElements: currentSlide.textElements,
          overlay: currentSlide.overlay,
        },
      });

      return { success: true, imageUrl: storageUrl };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  },
});

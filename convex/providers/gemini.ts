// Google Gemini provider for text and image generation

// ============ TEXT GENERATION ============

export interface GeminiTextParams {
  model?: "gemini-2.5-flash" | "gemini-2.0-flash" | "gemini-1.5-pro" | "gemini-1.5-flash";
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
}

export interface GeminiTextResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  cost: number;
}

// Gemini pricing (per 1M tokens, as of Jan 2025)
const TEXT_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  "gemini-2.0-flash": { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  "gemini-1.5-pro": { input: 1.25 / 1_000_000, output: 5.00 / 1_000_000 },
  "gemini-1.5-flash": { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
};

/**
 * Generate text using Gemini
 */
export async function generateText(
  prompt: string,
  systemPrompt?: string,
  params: GeminiTextParams = {}
): Promise<GeminiTextResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const model = params.model || "gemini-2.5-flash";

  // Build the request
  const contents = [];

  // Add system instruction if provided
  const systemInstruction = systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined;

  // Add user prompt
  contents.push({
    role: "user",
    parts: [{ text: prompt }],
  });

  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens || 2048,
    },
  };

  if (systemInstruction) {
    requestBody.systemInstruction = systemInstruction;
  }

  // If JSON response format requested, add response mime type
  if (params.responseFormat?.type === "json_object") {
    (requestBody.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Extract text from response
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Extract token usage
  const usageMetadata = data.usageMetadata || {};
  const inputTokens = usageMetadata.promptTokenCount || 0;
  const outputTokens = usageMetadata.candidatesTokenCount || 0;

  // Calculate cost
  const pricing = TEXT_PRICING[model] || TEXT_PRICING["gemini-2.0-flash"];
  const cost = inputTokens * pricing.input + outputTokens * pricing.output;

  return {
    text,
    usage: { inputTokens, outputTokens },
    cost,
  };
}

// ============ IMAGE GENERATION ============

// Reference image for consistent visual identity across generations
export interface ReferenceImage {
  base64Data: string; // Base64 encoded image data (without data: prefix)
  mimeType: string; // e.g., "image/jpeg", "image/png"
  description?: string; // Optional description for the AI
}

export interface GeminiImageParams {
  aspectRatio?: "1:1" | "4:5" | "9:16";
  // Reference images for maintaining character/style consistency
  referenceImages?: ReferenceImage[];
}

export interface GeminiImageResponse {
  image: string; // Base64 encoded image
  cost: number;
}

// Cost per image (as of Dec 2024)
const COST_PER_IMAGE = 0.02;

/**
 * Generate images using Gemini's native image generation
 * Optionally accepts reference images for character/style consistency
 */
export async function generateImages(
  prompt: string,
  params: GeminiImageParams = {}
): Promise<GeminiImageResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const aspectRatio = params.aspectRatio || "4:5";

  // Build parts array - reference images first (as context), then text prompt
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  // Add reference images first if provided
  if (params.referenceImages && params.referenceImages.length > 0) {
    for (const ref of params.referenceImages) {
      parts.push({
        inlineData: {
          mimeType: ref.mimeType,
          data: ref.base64Data,
        },
      });
    }
  }

  // Add text prompt after images
  parts.push({ text: prompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio,
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Extract image from response
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  let image: string | null = null;
  for (const part of responseParts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      break;
    }
  }

  if (!image) {
    throw new Error("No image generated by Gemini");
  }

  return {
    image,
    cost: COST_PER_IMAGE,
  };
}

// ============ VISUAL PLANNING ============

export interface VisualPlanResponse {
  descriptions: string[];
  cost: number;
}

/**
 * Generate visual descriptions for carousel slides
 * This intermediate step creates optimized image prompts from slide text
 */
export async function generateVisualDescriptions(
  slideTexts: string[],
  topic: string,
  userStyle?: string | null
): Promise<VisualPlanResponse> {
  const slideList = slideTexts
    .map((text, i) => `${i + 1}. "${text}"`)
    .join("\n");

  const styleInstruction = userStyle
    ? `User's style preference: "${userStyle}"`
    : "No specific style preference provided.";

  const prompt = `You are a creative director planning visuals for a social media carousel.

Topic: "${topic}"
${styleInstruction}

Slides:
${slideList}

For each slide, describe a specific visual/photograph that would:
- Represent the slide's message without showing any text
- Work well as a background for text overlay (clean areas, not too busy)
- Create visual cohesion across the carousel (avoid repetitive imagery)
- Align with the user's style preference if provided

IMPORTANT - Title Slide (Slide 1):
The first slide is the title/hook slide - this is the FIRST thing viewers see when scrolling TikTok or Instagram.
For this slide, DO NOT try to literally visualize the title text. Instead, create a visually striking, thematic hero image that:
- Captures the overall mood/vibe of the slideshow topic
- Creates intrigue and makes viewers want to swipe
- Is visually captivating and scroll-stopping
- Represents the theme abstractly rather than literally

For slides 2+, describe concrete visual scenes that represent each slide's specific message (e.g., "glass of water on a wooden nightstand with soft morning light" NOT "an image representing hydration").

CRITICAL: You MUST return EXACTLY ${slideTexts.length} descriptions - one for each slide listed above.

Return JSON:
{
  "descriptions": [
    "description for slide 1 (thematic hero image)",
    "description for slide 2",
    ...
  ]
}`;

  const response = await generateText(
    prompt,
    "You are a creative director who specializes in visual storytelling for social media.",
    {
      model: "gemini-2.0-flash",
      responseFormat: { type: "json_object" },
    }
  );

  const parsed = JSON.parse(response.text);
  let descriptions: string[] = parsed.descriptions || [];

  // Ensure we have exactly the right number of descriptions
  // If AI returned fewer, pad with generic descriptions based on slide text
  while (descriptions.length < slideTexts.length) {
    const idx = descriptions.length;
    descriptions.push(`A visually appealing background image representing: ${slideTexts[idx]}`);
  }

  // If AI returned more, trim to match
  descriptions = descriptions.slice(0, slideTexts.length);

  return {
    descriptions,
    cost: response.cost,
  };
}

/**
 * Generate a carousel slide image
 * Optionally uses reference images for character/style consistency
 */
export async function generateCarouselImage(
  visualDescription: string,
  userStyle?: string | null,
  referenceImages?: ReferenceImage[],
  characterInstructions?: string | null,
  aspectRatio: "1:1" | "4:5" | "9:16" = "4:5"
): Promise<{ image: string; cost: number }> {
  const styleHint = userStyle || "modern, minimal, professional";

  let prompt = `Create a high-quality image: ${visualDescription}

Requirements:
- Clean composition suitable for text overlay
- High contrast areas for text readability
- NO TEXT in the image
- Fill the entire frame edge-to-edge, no borders, margins, or white space around the edges

Style: ${styleHint}`;

  // Add character/reference instructions if provided
  if (referenceImages && referenceImages.length > 0 && characterInstructions) {
    prompt += `

IMPORTANT - Reference Character/Element Instructions:
${characterInstructions}

Use the provided reference image(s) to maintain visual consistency. The character/element should appear in this scene with the described action/pose.`;
  }

  const response = await generateImages(prompt, {
    aspectRatio,
    referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
  });

  return {
    image: response.image,
    cost: response.cost,
  };
}

/**
 * Generate multiple carousel images in batch
 * Optionally uses reference images for character/style consistency
 */
export async function generateCarouselImages(
  visualDescriptions: string[],
  userStyle?: string | null,
  referenceImages?: ReferenceImage[],
  characterInstructions?: string | null,
  aspectRatio: "1:1" | "4:5" | "9:16" = "4:5"
): Promise<{ images: string[]; cost: number }> {
  // Generate images in parallel for speed
  const results = await Promise.all(
    visualDescriptions.map((desc) =>
      generateCarouselImage(desc, userStyle, referenceImages, characterInstructions, aspectRatio)
    )
  );

  return {
    images: results.map((r) => r.image),
    cost: results.reduce((sum, r) => sum + r.cost, 0),
  };
}

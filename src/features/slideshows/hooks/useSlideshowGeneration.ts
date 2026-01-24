import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { extractSlideCountFromPrompt, clampSlideCount } from "../utils";

export type ContentStyle = "overlay" | "infographic";

interface UseSlideshowGenerationOptions {
  onSuccess?: () => void;
}

export function useSlideshowGeneration(options?: UseSlideshowGenerationOptions) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<Id<"referenceImages">[]>([]);
  const [contentStyle, setContentStyle] = useState<ContentStyle>("overlay");

  const generateWithConfig = useAction(api.slideshows.generate.generateWithConfig);

  const generate = async (productId?: Id<"products">) => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const slideCount = clampSlideCount(extractSlideCountFromPrompt(prompt));

      await generateWithConfig({
        productId: productId || undefined,
        topic: prompt.trim(),
        slideCount,
        referenceImageIds: selectedReferenceImages.length > 0 ? selectedReferenceImages : undefined,
        formatConfig: {
          contentStyle,
        },
      });

      setPrompt("");
      options?.onSuccess?.();
    } catch (err) {
      console.error("Generation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to generate slideshow");
    } finally {
      setIsGenerating(false);
    }
  };

  const clearError = () => setError(null);

  return {
    prompt,
    setPrompt,
    isGenerating,
    error,
    generate,
    clearError,
    selectedReferenceImages,
    setSelectedReferenceImages,
    contentStyle,
    setContentStyle,
  };
}

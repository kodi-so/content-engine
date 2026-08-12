// Convex File Storage utilities for handling images
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireBetaAccessForAction } from "../auth/actionAccess";

/**
 * Upload a base64 image to Convex storage
 * Returns a permanent storage URL
 */
export const uploadBase64Image = action({
  args: {
    base64Data: v.string(), // Full data URI: "data:image/png;base64,..."
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    await requireBetaAccessForAction(ctx);
    try {
      // Extract mime type and base64 data
      const matches = args.base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid base64 data URI format");
      }

      const mimeType = matches[1];
      const base64String = matches[2];

      // Convert base64 to binary
      const binaryString = atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });

      // Upload to Convex storage
      const storageId = await ctx.storage.store(blob);

      // Get the permanent URL
      const url = await ctx.storage.getUrl(storageId);

      if (!url) {
        throw new Error("Failed to get storage URL");
      }

      return url;
    } catch (error) {
      throw new Error(
        `Failed to upload image: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});

export const uploadBase64ImageWithMetadata = action({
  args: {
    base64Data: v.string(),
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    storageId: Id<"_storage">;
    storageUrl: string;
    mimeType: string;
    byteLength: number;
  }> => {
    await requireBetaAccessForAction(ctx);
    const matches = args.base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid base64 data URI format");
    }

    const mimeType = matches[1];
    const base64String = matches[2];
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    const storageId = await ctx.storage.store(new Blob([bytes], { type: mimeType }));
    const storageUrl = await ctx.storage.getUrl(storageId);
    if (!storageUrl) {
      throw new Error("Failed to get storage URL");
    }

    return {
      storageId,
      storageUrl,
      mimeType,
      byteLength: bytes.byteLength,
    };
  },
});

/**
 * Upload multiple base64 images to Convex storage
 * Returns an array of permanent storage URLs
 */
export const uploadBase64Images = action({
  args: {
    base64DataArray: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    await requireBetaAccessForAction(ctx);
    // Upload all images in parallel
    const uploadPromises = args.base64DataArray.map((base64Data, index) =>
      ctx.runAction(api.storage.files.uploadBase64Image, {
        base64Data,
        filename: `image-${index}`,
      })
    );

    return await Promise.all(uploadPromises);
  },
});

// Type for reference images used by Gemini API
interface ReferenceImageData {
  base64Data: string; // Base64 encoded image data (without data: prefix)
  mimeType: string; // e.g., "image/jpeg", "image/png"
}

/**
 * Fetch reference images from Convex storage and convert to base64 for Gemini API
 * Takes an array of storage URLs and returns base64 encoded images
 */
export const fetchReferenceImages = action({
  args: {
    imageUrls: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<ReferenceImageData[]> => {
    await requireBetaAccessForAction(ctx);
    const results: ReferenceImageData[] = [];

    for (const url of args.imageUrls) {
      try {
        // Fetch the image from Convex storage
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to fetch reference image: ${url}, status: ${response.status}`);
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();

        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        // Get mime type from content-type header or default to jpeg
        const contentType = response.headers.get("content-type") || "image/jpeg";

        results.push({
          base64Data,
          mimeType: contentType,
        });
      } catch (e) {
        console.error("Failed to fetch reference image:", url, e);
      }
    }

    return results;
  },
});

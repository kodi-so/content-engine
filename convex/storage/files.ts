// Cloudflare R2 storage utilities for handling images
import { action, mutation } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import { requireBetaAccessForAction } from "../auth/actionAccess";
import { requireCurrentUserId } from "../auth/users";
import { keyFromPublicUrl, publicUrlForKey, r2 } from "./r2";

/**
 * Delete a file from R2 by its public URL
 */
export const deleteByUrl = mutation({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    await requireCurrentUserId(ctx);
    const key = keyFromPublicUrl(args.url);
    if (!key) {
      return { success: false, error: "Could not extract storage key from URL" };
    }

    try {
      await r2.deleteObject(ctx, key);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

function blobFromDataUri(base64Data: string): { blob: Blob; mimeType: string; byteLength: number } {
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid base64 data URI format");
  }

  const mimeType = matches[1];
  const binaryString = atob(matches[2]);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType, byteLength: bytes.byteLength };
}

/**
 * Upload a base64 image to R2
 * Returns a permanent public URL
 */
export const uploadBase64Image = action({
  args: {
    base64Data: v.string(), // Full data URI: "data:image/png;base64,..."
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    await requireBetaAccessForAction(ctx);
    try {
      const { blob, mimeType } = blobFromDataUri(args.base64Data);
      const key = await r2.store(ctx, blob, { type: mimeType });
      return publicUrlForKey(key);
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
    storageId: string;
    storageUrl: string;
    mimeType: string;
    byteLength: number;
  }> => {
    await requireBetaAccessForAction(ctx);
    const { blob, mimeType, byteLength } = blobFromDataUri(args.base64Data);
    const key = await r2.store(ctx, blob, { type: mimeType });

    return {
      storageId: key,
      storageUrl: publicUrlForKey(key),
      mimeType,
      byteLength,
    };
  },
});

/**
 * Upload multiple base64 images to R2
 * Returns an array of permanent public URLs
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
 * Fetch reference images from their storage URLs and convert to base64 for Gemini API
 * Takes an array of media URLs and returns base64 encoded images
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
        // Fetch the image from its storage URL
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

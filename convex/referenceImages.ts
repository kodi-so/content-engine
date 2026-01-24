// User's reference image library - personal images for generation
import { mutation, query, internalQuery, action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { referenceImageTypeValidator } from "./validators";
import { generateImages } from "./providers/gemini";

// List all reference images for current user
export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    return await ctx.db
      .query("referenceImages")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

// List reference images by type
export const listByType = query({
  args: { type: referenceImageTypeValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    return await ctx.db
      .query("referenceImages")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", identity.subject).eq("type", args.type)
      )
      .collect();
  },
});

// Get a single reference image
export const get = query({
  args: { id: v.id("referenceImages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const image = await ctx.db.get(args.id);
    if (!image || image.userId !== identity.subject) {
      return null;
    }
    return image;
  },
});

// Internal query to get multiple reference images by IDs (for generation)
export const getByIds = internalQuery({
  args: { ids: v.array(v.id("referenceImages")) },
  handler: async (ctx, args) => {
    const images = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return images.filter((img) => img !== null);
  },
});

// Add a new reference image
export const add = mutation({
  args: {
    storageUrl: v.string(),
    type: referenceImageTypeValidator,
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check limit (max 20 images per user)
    const existing = await ctx.db
      .query("referenceImages")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    if (existing.length >= 20) {
      throw new Error("Maximum of 20 reference images allowed. Please delete some images first.");
    }

    const id = await ctx.db.insert("referenceImages", {
      userId: identity.subject,
      storageUrl: args.storageUrl,
      type: args.type,
      name: args.name,
      description: args.description,
      createdAt: Date.now(),
    });

    return id;
  },
});

// Update a reference image's metadata
export const update = mutation({
  args: {
    id: v.id("referenceImages"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(referenceImageTypeValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const image = await ctx.db.get(args.id);
    if (!image || image.userId !== identity.subject) {
      throw new Error("Reference image not found");
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.type !== undefined) updates.type = args.type;

    await ctx.db.patch(args.id, updates);
  },
});

// Helper to extract storage ID from URL
function extractStorageIdFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/api\/storage\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

// Delete a reference image and its storage
export const remove = mutation({
  args: { id: v.id("referenceImages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const image = await ctx.db.get(args.id);
    if (!image || image.userId !== identity.subject) {
      throw new Error("Reference image not found");
    }

    // Delete from storage
    const storageId = extractStorageIdFromUrl(image.storageUrl);
    if (storageId) {
      try {
        await ctx.storage.delete(storageId as any);
      } catch (e) {
        console.error("Failed to delete image from storage:", e);
      }
    }

    // Delete the document
    await ctx.db.delete(args.id);
  },
});

// Generate a reference image using AI and save it to storage
export const generateImage = action({
  args: {
    prompt: v.string(),
    name: v.string(),
    type: referenceImageTypeValidator,
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; storageUrl?: string; error?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    if (!args.prompt.trim()) {
      return { success: false, error: "Please provide a description for the image" };
    }

    try {
      // Build the prompt for character/reference image generation
      const fullPrompt = `Create a high-quality character or reference image based on this description:

${args.prompt}

Requirements:
- Clean, clear subject with minimal background clutter
- Well-lit, professional quality
- Suitable as a reference image for maintaining visual consistency
- Square composition (1:1 aspect ratio)
- The subject should be clearly visible and recognizable
- NO TEXT in the image`;

      // Generate the image using Gemini
      const result = await generateImages(fullPrompt, {
        aspectRatio: "1:1", // Square format works best for reference images
      });

      // Upload the generated image to Convex storage
      const storageUrl = await ctx.runAction(api.storage.uploadBase64Image, {
        base64Data: result.image,
      });

      // Save the reference image record
      await ctx.runMutation(api.referenceImages.add, {
        storageUrl,
        name: args.name.trim(),
        type: args.type,
        description: args.description?.trim(),
      });

      return { success: true, storageUrl };
    } catch (error) {
      console.error("Failed to generate image:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate image",
      };
    }
  },
});

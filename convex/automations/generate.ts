/**
 * Topic and content generation for automations
 * Handles AI-powered topic generation based on theme configuration
 */

import { action, internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { generateText } from "../providers/gemini";
import {
  themeConfigValidator,
  formatConfigValidator,
} from "../validators";

export interface TopicGenerationResult {
  topic: string;
  caption: string;
}

export interface ThemeConfig {
  accountNiche: string;
  topicExamples: string[];
}

export interface FormatConfig {
  visualStyle?: string;
  aspectRatio: "1:1" | "4:5" | "9:16";
  contentStyle?: "overlay" | "infographic";
}

/**
 * Generate a topic for an automation run
 * This uses AI to create a fresh, unique topic based on the theme configuration
 */
export async function generateTopic(
  themeConfig: ThemeConfig
): Promise<TopicGenerationResult> {
  const { accountNiche, topicExamples } = themeConfig;

  // Build the prompt
  const examplesList = topicExamples.length > 0
    ? topicExamples.map((e, i) => `${i + 1}. ${e}`).join("\n")
    : "No examples provided.";

  const prompt = `You are a content strategist for a ${accountNiche} TikTok/Instagram account.

Example topics that perform well for this account:
${examplesList}

Generate ONE new carousel topic that:
1. Fits perfectly with the account's niche
2. Follows the style, tone, and pattern of the example topics
3. Is NOT a direct copy of any example - be creative!
4. Is specific and valuable to the audience
5. Would make viewers want to save and share
6. Has a hook that stops the scroll

Return ONLY valid JSON in this exact format:
{
  "topic": "the complete topic/title for the carousel (this will be the hook slide text)",
  "caption": "engaging TikTok caption with relevant hashtags (2-3 sentences max)"
}`;

  const response = await generateText(
    prompt,
    "You are an expert social media content strategist who creates viral, engaging carousel content.",
    {
      model: "gemini-2.0-flash",
      responseFormat: { type: "json_object" },
      temperature: 0.9, // Higher temperature for more creative variety
    }
  );

  const parsed = JSON.parse(response.text);

  return {
    topic: parsed.topic || "Untitled Topic",
    caption: parsed.caption || "",
  };
}

/**
 * Test topic generation - callable from the frontend for preview
 */
export const testTopicGeneration = action({
  args: {
    themeConfig: themeConfigValidator,
  },
  handler: async (ctx, args): Promise<TopicGenerationResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    return generateTopic(args.themeConfig);
  },
});

/**
 * Generate example topics based on account niche
 * Used in the wizard to help users quickly populate topic examples
 */
export const generateTopicExamples = action({
  args: {
    accountNiche: v.string(),
  },
  handler: async (ctx, args): Promise<{ topics: string[] }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const prompt = `You are a content strategist for TikTok/Instagram carousel posts.

Account niche: "${args.accountNiche}"

Generate 10 carousel topic ideas that would perform well for this niche. Each topic should:
1. Be a complete, attention-grabbing title (the kind that makes people stop scrolling)
2. Be specific and actionable, not vague
3. Work well as a 4-7 slide carousel
4. Vary in format (some with numbers like "5 ways...", some questions, some statements)
5. Cover different angles within the niche

Return ONLY valid JSON:
{
  "topics": [
    "5 morning habits that actually changed my life",
    "The productivity hack nobody talks about",
    ...
  ]
}`;

    const response = await generateText(
      prompt,
      "You are an expert at creating viral social media content. Your topics are specific, valuable, and scroll-stopping.",
      {
        model: "gemini-2.0-flash",
        responseFormat: { type: "json_object" },
        temperature: 0.9,
      }
    );

    const parsed = JSON.parse(response.text);
    return { topics: parsed.topics || [] };
  },
});

/**
 * Generate a complete slideshow for an automation
 * This is the full pipeline: topic -> content -> save
 */
export const generateForAutomation = internalAction({
  args: {
    automationId: v.id("automations"),
    runId: v.id("automationRuns"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    contentId?: Id<"content">;
    topic?: string;
    caption?: string;
    error?: string;
    errorStep?: string;
  }> => {
    // Get the automation
    const automation = await ctx.runQuery(internal.automations.internal.getAutomation, {
      id: args.automationId,
    });

    if (!automation) {
      return { success: false, error: "Automation not found", errorStep: "initialization" };
    }

    const { themeConfig, formatConfig, referenceImageIds, characterInstructions } = automation;

    try {
      // Step 1: Generate topic
      await ctx.runMutation(internal.automations.internal.updateRunStatus, {
        runId: args.runId,
        status: "generating",
        startedAt: Date.now(),
      });

      const topicResult = await generateTopic(themeConfig);

      // Update run with generated topic
      await ctx.runMutation(internal.automations.internal.updateRunTopic, {
        runId: args.runId,
        topic: topicResult.topic,
        caption: topicResult.caption,
      });

      // Step 2: Generate slideshow content using the existing generate action
      // We call the slideshow generate action with the topic
      // Pass reference images from user's library for consistent visual identity
      const generateResult = await ctx.runAction(api.slideshows.generate.generateWithConfig, {
        accountId: automation.accountId,
        topic: topicResult.topic,
        referenceImageIds: referenceImageIds,
        characterInstructions: characterInstructions,
        formatConfig: {
          visualStyle: formatConfig.visualStyle,
          aspectRatio: formatConfig.aspectRatio,
          contentStyle: formatConfig.contentStyle,
        },
      });

      if (!generateResult.success || !generateResult.contentId) {
        return {
          success: false,
          error: "Failed to generate slideshow content",
          errorStep: "content_generation",
        };
      }

      // Update run status to scheduling
      await ctx.runMutation(internal.automations.internal.updateRunStatus, {
        runId: args.runId,
        status: "scheduling",
      });

      // Step 3: The content is created, but we don't schedule immediately
      // The post will be created when the scheduled time arrives
      // For now, we just mark the run as complete with the content

      await ctx.runMutation(internal.automations.internal.completeRun, {
        runId: args.runId,
        contentId: generateResult.contentId,
      });

      return {
        success: true,
        contentId: generateResult.contentId,
        topic: topicResult.topic,
        caption: topicResult.caption,
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: errorMessage,
        errorStep: "content_generation",
      };
    }
  },
});

/**
 * Preview generation - generates content but doesn't schedule
 * Used in the wizard for testing the automation configuration
 */
export const previewGeneration = action({
  args: {
    accountId: v.optional(v.id("accounts")), // Optional: for associating content
    themeConfig: themeConfigValidator,
    formatConfig: formatConfigValidator,
    referenceImageIds: v.optional(v.array(v.id("referenceImages"))),
    characterInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    contentId?: Id<"content">;
    topic?: string;
    caption?: string;
    error?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    try {
      // Step 1: Generate topic
      const topicResult = await generateTopic(args.themeConfig);

      // Step 2: Generate slideshow
      // Pass reference images from user's library for consistent visual identity
      const generateResult = await ctx.runAction(api.slideshows.generate.generateWithConfig, {
        accountId: args.accountId,
        topic: topicResult.topic,
        referenceImageIds: args.referenceImageIds,
        characterInstructions: args.characterInstructions,
        formatConfig: {
          visualStyle: args.formatConfig.visualStyle,
          aspectRatio: args.formatConfig.aspectRatio,
          contentStyle: args.formatConfig.contentStyle,
        },
      });

      if (!generateResult.success) {
        return {
          success: false,
          error: "Failed to generate slideshow",
        };
      }

      return {
        success: true,
        contentId: generateResult.contentId,
        topic: topicResult.topic,
        caption: topicResult.caption,
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { estimateToolCallCost } from "../../usage/costEstimation";
import { recordToolEstimate, type UsageCategory } from "../../usage/records";
import { toolCallHasPendingAsyncOutput } from "../execution/toolCallReadiness";
import { hasExplicitPriorOutputSelection } from "../planning";
import { getCreateTool } from "../tools";
import type { CreateToolName } from "../tools";
import { validateToolCallInput } from "../tools/validateToolInput";
import { insertCreateRunEvent } from "../observability/runEvents";

export type CreateCommandInput = {
  input: Record<string, unknown>;
  label?: string;
  toolName: CreateToolName;
};

type ExistingOpenToolCall = {
  id: Id<"createToolCalls">;
  toolName: string;
};

function dependsOnAllPreviousCalls(command: Pick<CreateCommandInput, "input" | "toolName">) {
  if (
    command.toolName === "media.renderVideo" ||
    command.toolName === "slideshow.render" ||
    command.toolName === "studio.compose" ||
    command.toolName === "studio.render" ||
    command.toolName === "artifact.save" ||
    command.toolName === "artifact.export" ||
    command.toolName === "publishing.prepare"
  ) {
    return true;
  }
  if (
    command.toolName === "media.generateImage" ||
    command.toolName === "media.generateVideo" ||
    command.toolName === "media.generateAudio" ||
    command.toolName === "media.lipsync"
  ) {
    return hasExplicitPriorOutputSelection(command.input);
  }
  return false;
}

function dependsOnEarlierAnalysis(toolName: string) {
  return toolName === "text.generate" ||
    toolName === "media.generateImage" ||
    toolName === "media.generateVideo" ||
    toolName === "media.generateAudio" ||
    toolName === "media.lipsync";
}

function usageCategoryForToolName(toolName: string): UsageCategory {
  if (toolName === "media.generateImage") return "image";
  if (toolName === "media.generateVideo") return "video";
  if (toolName === "media.generateAudio") return "audio";
  if (toolName === "media.lipsync") return "lipsync";
  if (toolName === "slideshow.render") return "image";
  if (toolName === "media.renderVideo" || toolName === "studio.render") return "render";
  return "other";
}

async function existingOpenToolCalls(
  ctx: MutationCtx,
  thread: Doc<"createThreads">
) {
  const toolCalls = await ctx.db
    .query("createToolCalls")
    .withIndex("by_thread", (q) => q.eq("createThreadId", thread._id))
    .collect();
  const openToolCalls: ExistingOpenToolCall[] = [];

  for (const toolCall of toolCalls) {
    if (
      toolCall.status === "queued" ||
      toolCall.status === "running" ||
      toolCall.status === "blocked" ||
      (toolCall.status === "succeeded" && await toolCallHasPendingAsyncOutput(ctx, thread, toolCall))
    ) {
      openToolCalls.push({ id: toolCall._id, toolName: toolCall.toolName });
    }
  }

  return openToolCalls;
}

export function dependencyIndexesForCreateCommands(
  commands: Array<Pick<CreateCommandInput, "input" | "toolName">>
) {
  return commands.map((command, index) => {
    const previousCalls = commands.slice(0, index);
    if (
      command.toolName === "social.discoverContent" ||
      command.toolName === "social.researchTrends" ||
      command.toolName === "analyze.source" ||
      command.toolName === "references.list"
    ) {
      return [];
    }
    if (dependsOnAllPreviousCalls(command)) {
      return previousCalls.map((_previous, previousIndex) => previousIndex);
    }
    if (dependsOnEarlierAnalysis(command.toolName)) {
      return previousCalls.flatMap((previous, previousIndex) =>
        previous.toolName === "analyze.source" ? [previousIndex] : []
      );
    }
    return [];
  });
}

/**
 * Canonical entry point for durable Content Engine commands.
 * Native planning and MCP both call this function before the shared executor.
 */
export async function enqueueCreateCommands(
  ctx: MutationCtx,
  thread: Doc<"createThreads">,
  args: {
    commands: CreateCommandInput[];
    messageId?: Id<"createMessages">;
  }
) {
  const now = Date.now();
  const existingDependencies = await existingOpenToolCalls(ctx, thread);
  const existingDependencyIds = existingDependencies.map((toolCall) => toolCall.id);
  const existingAnalysisDependencyIds = existingDependencies.flatMap((toolCall) =>
    toolCall.toolName === "analyze.source" ? [toolCall.id] : []
  );
  const insertedCalls: Array<CreateCommandInput & { id: Id<"createToolCalls"> }> = [];

  for (const command of args.commands) {
    const tool = getCreateTool(command.toolName);
    if (!tool || tool.availability !== "available" || tool.executionMode !== "agent_runtime") {
      throw new Error(`Content Engine command is not executable: ${command.toolName}`);
    }
    const validationErrors = validateToolCallInput(command.toolName, command.input);
    if (validationErrors.length) throw new Error(validationErrors.join("; "));

    const id = await ctx.db.insert("createToolCalls", {
      userId: thread.userId,
      workspaceId: thread.workspaceId,
      createThreadId: thread._id,
      decisionRunId: thread.decisionRunId,
      messageId: args.messageId,
      toolName: command.toolName,
      dependsOnToolCallIds: [],
      status: "queued",
      label: command.label?.trim() || tool.label,
      input: command.input,
      createdAt: now,
      updatedAt: now,
    });
    const estimate = await estimateToolCallCost(ctx, thread, command.toolName, command.input);
    if (estimate) {
      await recordToolEstimate(ctx, {
        thread,
        toolCallId: id,
        category: usageCategoryForToolName(command.toolName),
        estimate,
      });
    }
    insertedCalls.push({ ...command, id });
  }

  const dependencyIndexes = dependencyIndexesForCreateCommands(insertedCalls);
  for (const [index, dependencies] of dependencyIndexes.entries()) {
    const command = insertedCalls[index];
    const existingDependencyIdsForCall = dependsOnAllPreviousCalls(command)
      ? existingDependencyIds
      : dependsOnEarlierAnalysis(command.toolName)
        ? existingAnalysisDependencyIds
        : [];
    if (!dependencies.length && !existingDependencyIdsForCall.length) continue;
    await ctx.db.patch(command.id, {
      dependsOnToolCallIds: [
        ...existingDependencyIdsForCall,
        ...dependencies.map((dependencyIndex) => insertedCalls[dependencyIndex].id),
      ],
      updatedAt: now,
    });
  }

  for (const command of insertedCalls) {
    const toolCall = await ctx.db.get(command.id);
    if (!toolCall) continue;
    await insertCreateRunEvent(ctx, thread, {
      decisionRunId: toolCall.decisionRunId ?? thread.decisionRunId,
      createMessageId: args.messageId,
      createToolCallId: toolCall._id,
      operationId: `tool:${toolCall._id}`,
      parentOperationId: `turn:${toolCall.decisionRunId ?? thread.decisionRunId}`,
      scope: "tool",
      eventType: "tool.queued",
      status: "queued",
      estimatedCostUsd: toolCall.estimatedCostUsd,
      pricingSource: toolCall.costEstimate ? "pricing_estimate" : undefined,
      summary: `Queued ${toolCall.toolName}.`,
      details: {
        label: toolCall.label,
        input: toolCall.input,
        dependsOnToolCallIds: toolCall.dependsOnToolCallIds,
        costEstimate: toolCall.costEstimate,
      },
      occurredAt: now,
    });
  }

  return insertedCalls;
}

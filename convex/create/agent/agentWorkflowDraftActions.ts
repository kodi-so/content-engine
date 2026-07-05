import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { createWorkflowDraftFromThread } from "../workflowExport";
import { appendMessage, normalizeOptionalText, requireThreadAccess } from "./agentThreadRecords";

export async function saveThreadAsWorkflowDraft(
  ctx: MutationCtx,
  args: {
    name?: string;
    threadId: Id<"createThreads">;
    userId: string;
  }
) {
  const thread = await requireThreadAccess(ctx, args.threadId, args.userId);
  const result = await createWorkflowDraftFromThread(ctx, thread, {
    name: normalizeOptionalText(args.name),
  });
  const now = Date.now();

  await ctx.db.insert("createToolCalls", {
    userId: thread.userId,
    workspaceId: thread.workspaceId,
    createThreadId: thread._id,
    toolName: "workflow.createDraft",
    dependsOnToolCallIds: [],
    status: "succeeded",
    label: "Saved workflow draft",
    input: {
      name: args.name,
    },
    output: {
      workflowId: result.workflowId,
      convertedToolCount: result.convertedToolCount,
      unsupportedToolNames: result.unsupportedToolNames,
    },
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await appendMessage(ctx, thread, {
    role: "agent",
    content: result.unsupportedToolNames.length
      ? `Saved this conversation as a workflow draft. Some Studio steps were preserved as comments because they are not repeatable workflow nodes yet: ${result.unsupportedToolNames.join(", ")}.`
      : "Saved this conversation as a workflow draft.",
    kind: "tool_result",
  });
  await ctx.db.patch(thread._id, { updatedAt: now });

  return result;
}

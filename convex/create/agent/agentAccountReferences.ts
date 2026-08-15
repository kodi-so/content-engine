import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { activeAccountReferenceMentions } from "../../accounts/accountReferenceContext";
import { uniqueCreateReferenceMentions } from "./agentThreadRecords";

export async function hydrateAccountReferencesForTurn(
  ctx: Pick<QueryCtx, "db">,
  args: {
    messages: Doc<"createMessages">[];
    thread: Doc<"createThreads">;
    userMessage: Doc<"createMessages">;
  }
) {
  const accountReferenceMentions = args.thread.socialAccountId
    ? await activeAccountReferenceMentions(ctx, args.thread.socialAccountId)
    : [];
  const currentReferenceMentions = uniqueCreateReferenceMentions([
    ...accountReferenceMentions,
    ...(args.userMessage.referenceMentions ?? []),
  ]);
  const userMessage = {
    ...args.userMessage,
    referenceMentions: currentReferenceMentions.length
      ? currentReferenceMentions
      : undefined,
  };
  const messages = args.messages.map((message) =>
    message._id === args.userMessage._id ? userMessage : message
  );
  const threadReferenceMentions = uniqueCreateReferenceMentions([
    ...accountReferenceMentions,
    ...args.messages.flatMap((message) => message.referenceMentions ?? []),
  ]);

  return {
    accountReferenceMentions,
    messages,
    threadReferenceMentions,
    userMessage,
  };
}

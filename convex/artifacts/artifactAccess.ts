import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireWorkspaceMember } from "../workspaces/workspaces";

export type WorkspaceOwnedRecord = {
  userId: string;
  workspaceId?: Id<"workspaces">;
};

export async function hasRecordAccess(
  ctx: QueryCtx | MutationCtx,
  record: WorkspaceOwnedRecord,
  userId: string
) {
  if (record.workspaceId) {
    await requireWorkspaceMember(ctx, record.workspaceId, userId);
    return true;
  }
  return record.userId === userId;
}

export function sameOwnershipScope(record: WorkspaceOwnedRecord, scope: WorkspaceOwnedRecord) {
  return scope.workspaceId
    ? record.workspaceId === scope.workspaceId
    : record.userId === scope.userId;
}

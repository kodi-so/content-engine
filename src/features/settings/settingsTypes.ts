import type { Doc } from "../../../convex/_generated/dataModel";

export type WorkspaceMemberRow = {
  membership: Doc<"workspaceMembers">;
  user: Doc<"users"> | null;
};

export type McpApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revokedAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type McpOauthConnectionSummary = {
  id: string;
  clientName: string;
  workspaceId?: string;
  scopes: string[];
  lastUsedAt?: number;
  createdAt: number;
  expiresAt: number;
  refreshExpiresAt: number;
};

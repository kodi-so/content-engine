import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

export type CreateToolName = `${string}.${string}`;

export type CreateToolCategory =
  | "test"
  | "analysis"
  | "references"
  | "media"
  | "generation"
  | "slideshow"
  | "studio"
  | "library"
  | "export"
  | "publishing"
  | "automation";

export type CreateToolAvailability = "available" | "planned";

export type CreateToolExecutionMode = "direct" | "agent_runtime" | "planned";

export type CreateToolSchema =
  | {
      kind: "placeholder";
      description: string;
      fields?: Record<string, string>;
    }
  | {
      kind: "json_schema";
      schema: Record<string, unknown>;
    };

export type CreateToolConfirmation = {
  required: boolean;
  reason?: string;
  risk?: "none" | "low" | "medium" | "high";
  estimatedCostUsd?: number;
};

export type CreateToolCheckpoint = {
  behavior: "none" | "before" | "after" | "before_and_after";
  label?: string;
  description?: string;
  defaultInDebugMode?: boolean;
};

export type CreateToolArtifactBehavior = {
  emitsArtifacts: boolean;
  artifactTypes?: Array<"image" | "video" | "audio" | "slideshow" | "file" | "post">;
  intermediate?: boolean;
};

export type CreateToolPlannerDescriptor = {
  name: CreateToolName;
  label: string;
  description: string;
  plannerGuidance?: string[];
  category: CreateToolCategory;
  availability: CreateToolAvailability;
  executionMode: CreateToolExecutionMode;
  inputSchema: CreateToolSchema;
  outputSchema?: CreateToolSchema;
  confirmation: CreateToolConfirmation;
  checkpoint: CreateToolCheckpoint;
  artifactBehavior: CreateToolArtifactBehavior;
};

export type CreateToolExecutionContext = {
  ctx?: ActionCtx;
  userId?: string;
  workspaceId?: Id<"workspaces">;
  createThreadId?: string;
  createMessageId?: string;
  checkpointMode?: "debug" | "auto";
  requestId?: string;
  now?: () => number;
  metadata?: Record<string, unknown>;
};

export type CreateToolHandler<Input, Output> = (
  context: CreateToolExecutionContext,
  input: Input
) => Promise<Output>;

export type CreateToolDefinition<Input = unknown, Output = unknown> =
  CreateToolPlannerDescriptor & {
    handler?: CreateToolHandler<Input, Output>;
  };

export type CreateToolExecutionResult<Output = unknown> = {
  toolName: CreateToolName;
  label: string;
  output: Output;
  artifactIds: Id<"artifacts">[];
  costUsd?: number;
  completedAt: number;
};

export class CreateToolNotFoundError extends Error {
  constructor(toolName: CreateToolName) {
    super(`Create tool not found: ${toolName}`);
    this.name = "CreateToolNotFoundError";
  }
}

export class CreateToolUnavailableError extends Error {
  constructor(toolName: CreateToolName, reason = "not executable by this runner") {
    super(`Create tool is registered but ${reason}: ${toolName}`);
    this.name = "CreateToolUnavailableError";
  }
}

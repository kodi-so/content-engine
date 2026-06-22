export type AgentCreateCheckpointMode = "debug" | "auto";

export type AgentCreateThreadStatus =
  | "idle"
  | "clarifying"
  | "planning"
  | "waiting_for_user"
  | "running"
  | "ready"
  | "failed"
  | "canceled"
  | "saved";

export type AgentCreateMessageRole = "user" | "agent" | "system";

export type AgentCreateMessageKind =
  | "chat"
  | "clarification"
  | "plan"
  | "status"
  | "tool_result"
  | "final_review";

export type AgentCreateMentionEntityType =
  | "creative_asset"
  | "persona"
  | "artifact"
  | "analysis";

export type AgentCreateMentionMediaType = "image" | "video" | "audio" | "file";

export type AgentCreateMentionOption = {
  id: string;
  label: string;
  entityType: AgentCreateMentionEntityType;
  description?: string;
  disabled?: boolean;
  mediaType?: AgentCreateMentionMediaType;
  sourceLabel?: string;
  thumbnailUrl?: string;
  token?: string;
};

export type AgentCreateSelectedMention = {
  token: string;
  label: string;
  entityType: AgentCreateMentionEntityType;
  entityId: string;
  instruction?: string;
  mediaType?: AgentCreateMentionMediaType;
};

export type AgentCreateArtifactKind =
  | "image"
  | "video"
  | "audio"
  | "slideshow"
  | "document"
  | "file";

export type AgentCreateArtifactStatus =
  | "placeholder"
  | "generating"
  | "ready"
  | "failed";

export type AgentCreateArtifact = {
  id: string;
  kind: AgentCreateArtifactKind;
  status: AgentCreateArtifactStatus;
  title: string;
  description?: string;
  mimeType?: string;
  modelLabel?: string;
  thumbnailUrl?: string;
  url?: string;
};

export type AgentCreateToolStatus =
  | "queued"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "canceled";

export type AgentCreateToolProgressStep = {
  id: string;
  label: string;
  status: AgentCreateToolStatus;
  detail?: string;
  artifacts?: AgentCreateArtifact[];
  artifactIds?: string[];
  costLabel?: string;
  errorMessage?: string;
  createdAt?: number;
  startedAt?: number;
  completedAt?: number;
};

export type AgentCreateMessage = {
  id: string;
  role: AgentCreateMessageRole;
  content: string;
  kind?: AgentCreateMessageKind;
  createdAt?: number;
  referenceMentions?: AgentCreateSelectedMention[];
  artifacts?: AgentCreateArtifact[];
  toolSteps?: AgentCreateToolProgressStep[];
};

export type AgentCreateCheckpoint = {
  id: string;
  status: "open" | "approved" | "rejected" | "revised";
  label: string;
  message: string;
  artifacts?: AgentCreateArtifact[];
};

export type AgentCreateFinalReviewAction =
  | "save"
  | "revise"
  | "open_studio"
  | "request_render"
  | "export"
  | "publish"
  | "save_workflow";

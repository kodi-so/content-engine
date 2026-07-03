import { buildAgentCreateOutputArtifacts } from "./agentCreateOutputArtifacts";
import type {
  AgentCreateArtifact,
  AgentCreateCheckpoint,
  AgentCreateMessage,
  AgentCreateSelectedMention,
  AgentCreateToolProgressStep,
} from "./agentCreateTypes";
import {
  pendingAnalysisStatus,
  pendingContentStatus,
  pendingStudioRenderStatus,
  toolProgressStepsForCall,
  type AgentCreateDefaultProviders,
  type AgentCreateToolCallRecord,
  type AsyncToolState,
} from "./agentCreateToolProgress";
import {
  isRoutineProgressMessage,
  isTransientQueuedMessage,
  outputId,
  recordFromUnknown,
  shouldAttachToolArtifactsToChat,
  uniqueArtifacts,
} from "./agentCreateSurfaceModel";

type AgentCreateThreadOutputs = Parameters<typeof buildAgentCreateOutputArtifacts>[0];

type AgentCreateToolCallView = AgentCreateToolCallRecord & {
  messageId?: unknown;
};

type AgentCreateMessageRecord = {
  _id: string;
  artifactIds?: unknown[];
  content: string;
  createdAt?: number;
  kind?: AgentCreateMessage["kind"];
  referenceMentions?: AgentCreateSelectedMention[];
  role: AgentCreateMessage["role"];
};

type AgentCreateCheckpointRecord = {
  _id: string;
  artifactIds?: unknown[];
  data?: unknown;
  label: string;
  message: string;
  status: string;
};

type AgentCreateMentionOptionLookup = Map<string, {
  mimeType?: string;
  previewUrl?: string;
  sourceLabel?: string;
  thumbnailUrl?: string;
}>;

export function resolvedModelByContentRequestId(threadOutputs?: AgentCreateThreadOutputs) {
  const mapped = new Map<string, string>();
  for (const entry of threadOutputs?.contentRequests ?? []) {
    const artifactModel = entry.artifacts.find((artifact) =>
      typeof artifact.model === "string" && artifact.model.trim()
    )?.model;
    const generation = recordFromUnknown(
      (entry.request as { generation?: unknown }).generation
    );
    const requestModel = typeof generation.model === "string" && generation.model.trim()
      ? generation.model.trim()
      : undefined;
    const model = artifactModel?.trim() || requestModel;
    if (model) mapped.set(String(entry.request._id), model);
  }
  return mapped;
}

export function asyncStateLookupForThreadOutputs(threadOutputs?: AgentCreateThreadOutputs) {
  const contentRequests = new Map<string, AsyncToolState>();
  const analysisJobs = new Map<string, AsyncToolState>();
  const studioRenderRequests = new Map<string, AsyncToolState>();

  for (const entry of threadOutputs?.contentRequests ?? []) {
    const status = pendingContentStatus(entry.request.status);
    if (!status) continue;
    contentRequests.set(String(entry.request._id), {
      status,
      completedAt: entry.request.completedAt,
      errorMessage: status === "failed"
        ? entry.request.errorMessage ?? "Generation request failed"
        : undefined,
    });
  }
  for (const job of threadOutputs?.analysisJobs ?? []) {
    const status = pendingAnalysisStatus(job.status);
    if (!status) continue;
    analysisJobs.set(String(job._id), {
      status,
      completedAt: job.completedAt,
      errorMessage: status === "failed"
        ? job.errorMessage ?? "Source analysis failed"
        : undefined,
    });
  }
  for (const request of threadOutputs?.studioRenderRequests ?? []) {
    const status = pendingStudioRenderStatus(request.status);
    if (!status) continue;
    studioRenderRequests.set(String(request._id), {
      status,
      completedAt: request.completedAt,
      errorMessage: status === "failed" || status === "canceled"
        ? request.errorMessage ?? "Studio render request failed"
        : request.errorMessage,
    });
  }

  return { analysisJobs, contentRequests, studioRenderRequests };
}

export function artifactIdsByContentRequestId(threadOutputs?: AgentCreateThreadOutputs) {
  const mapped = new Map<string, string[]>();
  for (const entry of threadOutputs?.contentRequests ?? []) {
    const artifactIds = [
      ...entry.artifacts.map((artifact) => String(artifact._id)),
      ...entry.slideshows.map((slideshow) => String(slideshow._id)),
    ];
    mapped.set(
      String(entry.request._id),
      artifactIds.length ? artifactIds : [`request:${entry.request._id}`]
    );
  }
  return mapped;
}

export function artifactsByToolCallId(args: {
  artifactById: Map<string, AgentCreateArtifact>;
  artifactIdsByContentRequestId: Map<string, string[]>;
  toolCalls?: AgentCreateToolCallView[];
}) {
  const mapped = new Map<string, AgentCreateArtifact[]>();

  for (const toolCall of args.toolCalls ?? []) {
    const artifacts: AgentCreateArtifact[] = [];
    for (const artifactId of toolCall.artifactIds ?? []) {
      const artifact = args.artifactById.get(String(artifactId));
      if (artifact) artifacts.push(artifact);
    }

    const contentRequestId = outputId(toolCall.output, "contentRequestId");
    if (contentRequestId) {
      artifacts.push(
        ...(args.artifactIdsByContentRequestId.get(contentRequestId) ?? [])
          .flatMap((artifactId) => args.artifactById.get(artifactId) ?? [])
      );
    }

    const analysisJobId = outputId(toolCall.output, "analysisJobId");
    const analysisArtifact = analysisJobId
      ? args.artifactById.get(`analysis:${analysisJobId}`)
      : undefined;
    if (analysisArtifact) artifacts.push(analysisArtifact);

    const projectId = outputId(toolCall.output, "projectId");
    const studioArtifact = projectId ? args.artifactById.get(`studio:${projectId}`) : undefined;
    if (studioArtifact) artifacts.push(studioArtifact);

    const studioRenderRequestId = outputId(toolCall.output, "studioRenderRequestId");
    const studioRenderArtifact = studioRenderRequestId
      ? args.artifactById.get(`studio-render:${studioRenderRequestId}`)
      : undefined;
    if (studioRenderArtifact) artifacts.push(studioRenderArtifact);

    const outputArtifactId = outputId(toolCall.output, "outputArtifactId");
    const outputArtifact = outputArtifactId ? args.artifactById.get(outputArtifactId) : undefined;
    if (outputArtifact) artifacts.push(outputArtifact);

    const distributionPlanId = outputId(toolCall.output, "distributionPlanId");
    const distributionArtifact = distributionPlanId
      ? args.artifactById.get(`distribution:${distributionPlanId}`)
      : undefined;
    if (distributionArtifact) artifacts.push(distributionArtifact);

    if (artifacts.length) mapped.set(String(toolCall._id), uniqueArtifacts(artifacts));
  }

  return mapped;
}

function progressStepsForToolCall(args: {
  artifactsByToolCallId: Map<string, AgentCreateArtifact[]>;
  asyncStateLookup: ReturnType<typeof asyncStateLookupForThreadOutputs>;
  defaultProviders: AgentCreateDefaultProviders;
  resolvedModelByContentRequestId: Map<string, string>;
  toolCall: AgentCreateToolCallView;
}) {
  const contentRequestId = outputId(args.toolCall.output, "contentRequestId");
  const asyncState =
    args.asyncStateLookup.contentRequests.get(contentRequestId ?? "") ??
    args.asyncStateLookup.analysisJobs.get(outputId(args.toolCall.output, "analysisJobId") ?? "") ??
    args.asyncStateLookup.studioRenderRequests.get(
      outputId(args.toolCall.output, "studioRenderRequestId") ?? ""
    );
  const resolvedModel = contentRequestId
    ? args.resolvedModelByContentRequestId.get(contentRequestId)
    : undefined;

  return toolProgressStepsForCall({
    asyncState,
    defaultProviders: args.defaultProviders,
    resolvedModel,
    toolCall: args.toolCall,
  }).map((step) =>
    step.id === String(args.toolCall._id)
      ? { ...step, artifacts: args.artifactsByToolCallId.get(String(args.toolCall._id)) }
      : step
  );
}

export function progressStepsForToolCalls(args: {
  artifactsByToolCallId: Map<string, AgentCreateArtifact[]>;
  asyncStateLookup: ReturnType<typeof asyncStateLookupForThreadOutputs>;
  defaultProviders: AgentCreateDefaultProviders;
  resolvedModelByContentRequestId: Map<string, string>;
  toolCalls?: AgentCreateToolCallView[];
}): AgentCreateToolProgressStep[] {
  return (args.toolCalls ?? []).flatMap((toolCall) =>
    progressStepsForToolCall({ ...args, toolCall })
  );
}

export function artifactsByMessageId(args: {
  artifactsByToolCallId: Map<string, AgentCreateArtifact[]>;
  toolCalls?: AgentCreateToolCallView[];
}) {
  const mapped = new Map<string, AgentCreateArtifact[]>();
  const addArtifacts = (messageId: string | undefined, artifacts: AgentCreateArtifact[]) => {
    if (!messageId || !artifacts.length) return;
    mapped.set(messageId, uniqueArtifacts([...(mapped.get(messageId) ?? []), ...artifacts]));
  };

  for (const toolCall of args.toolCalls ?? []) {
    if (!shouldAttachToolArtifactsToChat(toolCall.toolName)) continue;
    addArtifacts(
      typeof toolCall.messageId === "string" ? toolCall.messageId : undefined,
      args.artifactsByToolCallId.get(String(toolCall._id)) ?? []
    );
  }

  return mapped;
}

export function toolStepsByMessageId(args: {
  artifactsByToolCallId: Map<string, AgentCreateArtifact[]>;
  asyncStateLookup: ReturnType<typeof asyncStateLookupForThreadOutputs>;
  defaultProviders: AgentCreateDefaultProviders;
  resolvedModelByContentRequestId: Map<string, string>;
  toolCalls?: AgentCreateToolCallView[];
}) {
  const mapped = new Map<string, AgentCreateToolProgressStep[]>();
  for (const toolCall of args.toolCalls ?? []) {
    if (!toolCall.messageId) continue;
    const messageId = String(toolCall.messageId);
    mapped.set(messageId, [
      ...(mapped.get(messageId) ?? []),
      ...progressStepsForToolCall({ ...args, toolCall }),
    ]);
  }
  return mapped;
}

export function renderedAgentCreateMessages(args: {
  artifactById: Map<string, AgentCreateArtifact>;
  artifactsByMessageId: Map<string, AgentCreateArtifact[]>;
  mentionOptionById: AgentCreateMentionOptionLookup;
  messages?: AgentCreateMessageRecord[];
  toolStepsByMessageId: Map<string, AgentCreateToolProgressStep[]>;
}): AgentCreateMessage[] {
  return (args.messages ?? [])
    .filter((message) => !isTransientQueuedMessage(message) && !isRoutineProgressMessage(message))
    .map((message) => {
      const explicitArtifacts = (message.artifactIds ?? [])
        .flatMap((artifactId) => args.artifactById.get(String(artifactId)) ?? []);
      const toolArtifacts = args.artifactsByMessageId.get(String(message._id)) ?? [];
      return {
        id: message._id,
        role: message.role,
        content: message.content,
        kind: message.kind,
        createdAt: message.createdAt,
        referenceMentions: message.referenceMentions?.map((mention) => {
          const option = args.mentionOptionById.get(mention.entityId);
          if (!option) return mention;
          return {
            ...mention,
            mimeType: option.mimeType,
            previewUrl: option.previewUrl,
            sourceLabel: option.sourceLabel,
            thumbnailUrl: option.thumbnailUrl,
          };
        }),
        artifacts: uniqueArtifacts([...explicitArtifacts, ...toolArtifacts]),
        toolSteps: args.toolStepsByMessageId.get(String(message._id)),
      };
    });
}

export function openAgentCreateCheckpoints(args: {
  artifactById: Map<string, AgentCreateArtifact>;
  checkpoints?: AgentCreateCheckpointRecord[];
}): AgentCreateCheckpoint[] {
  return (args.checkpoints ?? [])
    .filter((checkpoint) => checkpoint.status === "open")
    .map((checkpoint) => ({
      id: checkpoint._id,
      status: "open",
      label: checkpoint.label,
      message: checkpoint.message,
      data: checkpoint.data,
      artifacts: checkpoint.artifactIds
        ?.flatMap((artifactId) => args.artifactById.get(String(artifactId)) ?? []),
    }));
}

import { v } from "convex/values";

export const createRunEventScopeValidator = v.union(
  v.literal("run"),
  v.literal("agent"),
  v.literal("model"),
  v.literal("tool"),
  v.literal("content_request"),
  v.literal("provider"),
  v.literal("artifact")
);

export const createRunEventStatusValidator = v.union(
  v.literal("info"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled")
);

export const createRunEventTypeValidator = v.union(
  v.literal("run.turn.started"),
  v.literal("run.turn.completed"),
  v.literal("run.turn.failed"),
  v.literal("agent.context.built"),
  v.literal("agent.decision.started"),
  v.literal("agent.decision.repair"),
  v.literal("agent.decision.completed"),
  v.literal("agent.decision.failed"),
  v.literal("model.call.started"),
  v.literal("model.call.completed"),
  v.literal("model.call.failed"),
  v.literal("tool.queued"),
  v.literal("tool.started"),
  v.literal("tool.completed"),
  v.literal("tool.failed"),
  v.literal("tool.retried"),
  v.literal("content_request.queued"),
  v.literal("content_request.started"),
  v.literal("content_request.completed"),
  v.literal("content_request.failed"),
  v.literal("provider.call.started"),
  v.literal("provider.submitted"),
  v.literal("provider.poll"),
  v.literal("provider.completed"),
  v.literal("provider.failed"),
  v.literal("artifact.created")
);

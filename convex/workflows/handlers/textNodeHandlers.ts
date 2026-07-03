import { internal } from "../../_generated/api";
import { getModelProvider } from "../../providers";
import {
  buildWorkflowAgentPrompt,
  getWorkflowAgentPreset,
  type WorkflowAgentOutputKind,
} from "../agentPresets";
import { artifactIdsFromInputs } from "../runtime/artifactInputs";
import type {
  WorkflowNodeHandlerArgs,
  WorkflowNodeHandlerResult,
} from "../runtime/executionTypes";
import {
  numberFromInputValue,
  objectValue,
  textFromInputValue,
} from "../runtime/inputValues";
import { placeholderLifecycleForNode } from "../runtime/nodeRuntime";
import {
  agentOutputRefsForNode,
  llmOutputRefsForNode,
} from "../runtime/outputRefs";
import {
  modelProviderNameForNode,
  providerOverridesFromConfig,
} from "../runtime/providerInputs";

function llmResponseFormat(value: unknown): "text" | "json" {
  return value === "json" ||
    value === "json_object" ||
    value === "structured" ||
    value === "schema"
    ? "json"
    : "text";
}

function textFieldFromObject(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return textFromInputValue((value as Record<string, unknown>)[key]);
}

function agentOutputText(args: {
  object: unknown;
  fallbackText: string;
  outputKind: WorkflowAgentOutputKind;
}): string {
  return textFieldFromObject(args.object, args.outputKind) ??
    textFieldFromObject(args.object, "text") ??
    textFieldFromObject(args.object, "prompt") ??
    textFieldFromObject(args.object, "script") ??
    textFieldFromObject(args.object, "analysis") ??
    args.fallbackText.trim();
}

export async function executeLlmNode({
  ctx,
  context,
  graph,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult> {
  const config = objectValue(node.config);
  const inputs = resolvedInputs.inputs ?? {};
  const providerName = modelProviderNameForNode(node);
  const provider = getModelProvider(providerName);
  const responseFormat = llmResponseFormat(inputs.responseFormat?.value);
  const promptFromInputNode = config.promptFromInputNode === true;
  const prompt = promptFromInputNode && inputs.prompt?.source === "config"
    ? ""
    : textFromInputValue(inputs.prompt?.value);
  const contextText = textFromInputValue(inputs.context?.value);
  const systemPrompt = textFromInputValue(inputs.systemPrompt?.value);
  const userPrompt = [contextText ? `Context:\n${contextText}` : undefined, prompt]
    .filter(Boolean)
    .join("\n\n");
  const model =
    typeof node.model === "string" && node.model.trim()
      ? node.model.trim()
      : textFromInputValue(inputs.model?.value);
  const temperature = numberFromInputValue(inputs.temperature?.value);
  const maxTokens = numberFromInputValue(inputs.maxTokens?.value);
  const providerOverrides = providerOverridesFromConfig(config);
  const providerMetadata = {
    workflowId: String(context.workflow._id),
    workflowRunId: String(context.run._id),
    nodeId: node.id,
    nodeType: node.type,
    ...(Object.keys(providerOverrides).length
      ? { bulkapisInput: providerOverrides }
      : {}),
  };

  if (!userPrompt.trim()) {
    throw new Error(`${node.label} needs a prompt or context input.`);
  }
  if (!provider.capabilities.text) {
    throw new Error(`${provider.displayName} does not support text generation.`);
  }
  if (responseFormat === "json" && !provider.capabilities.structured) {
    throw new Error(`${provider.displayName} does not support structured generation.`);
  }

  const textResult =
    responseFormat === "json"
      ? await provider.generateStructured<unknown>({
          prompt: userPrompt,
          systemPrompt,
          model,
          temperature,
          maxTokens,
          schema: config.schema ?? config.jsonSchema ?? config.outputSchema,
          schemaName:
            typeof config.schemaName === "string" && config.schemaName.trim()
              ? config.schemaName.trim()
              : "workflow_llm_output",
          metadata: providerMetadata,
        })
      : await provider.generateText({
          prompt: userPrompt,
          systemPrompt,
          model,
          temperature,
          maxTokens,
          metadata: providerMetadata,
        });
  const outputText = textResult.text.trim();
  const outputObject = "object" in textResult ? textResult.object : undefined;
  const lifecycle = placeholderLifecycleForNode(graph, node);
  const artifactId = await ctx.runMutation(
    internal.artifacts.records.createFromRunner,
    {
      userId: context.run.userId,
      workflowId: context.workflow._id,
      workflowRunId: context.run._id,
      parentArtifactIds: artifactIdsFromInputs(resolvedInputs, [
        "context",
        "input",
      ]),
      type: "text_draft",
      title: `${node.label} output`,
      data: {
        nodeId: node.id,
        nodeType: node.type,
        responseFormat,
        text: outputText,
        ...(outputObject !== undefined ? { json: outputObject } : {}),
        inputSummary: resolvedInputs.summary,
        providerMetadata: textResult.metadata,
      },
      provider: textResult.metadata.provider,
      model: textResult.metadata.model,
      prompt: userPrompt,
      lifecycle,
      reviewStatus: "not_required",
    }
  );

  const outputRefs = llmOutputRefsForNode({
    nodeId: node.id,
    artifactId,
    text: outputText,
    responseFormat,
    object: outputObject,
  });
  const costUsd = textResult.metadata.costUsd ?? 0;

  await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
    runId: context.run._id,
    nodeId: node.id,
    status: "succeeded",
    outputRefs,
    costUsd,
  });
  await ctx.runMutation(internal.workflows.runs.recordEvent, {
    userId: context.run.userId,
    workflowRunId: context.run._id,
    workflowId: context.workflow._id,
    type: "model_call",
    nodeId: node.id,
    message: `${node.label} called ${provider.displayName}.`,
    data: {
      provider: textResult.metadata.provider,
      model: textResult.metadata.model,
      usage: textResult.metadata.usage,
      costUsd,
    },
  });
  await ctx.runMutation(internal.workflows.runs.recordEvent, {
    userId: context.run.userId,
    workflowRunId: context.run._id,
    workflowId: context.workflow._id,
    type: "node_completed",
    nodeId: node.id,
    message: `${node.label} generated ${responseFormat === "json" ? "structured output" : "text"}.`,
    data: {
      nodeType: node.type,
      lifecycle,
      artifactId,
      provider: textResult.metadata.provider,
      model: textResult.metadata.model,
      outputPorts: outputRefs.map((outputRef) => outputRef.port),
      placeholderExecution: false,
    },
  });

  return { costUsd, emittedArtifactIds: [artifactId] };
}

export async function executeAiAgentNode({
  ctx,
  context,
  graph,
  node,
  resolvedInputs,
}: WorkflowNodeHandlerArgs): Promise<WorkflowNodeHandlerResult> {
  const config = objectValue(node.config);
  const inputs = resolvedInputs.inputs ?? {};
  const preset = getWorkflowAgentPreset(inputs.agentMode?.value);
  const providerName = modelProviderNameForNode(node);
  const provider = getModelProvider(providerName);
  const requestFromInputNode = config.requestFromInputNode === true;
  const request = requestFromInputNode && inputs.request?.source === "config"
    ? undefined
    : textFromInputValue(inputs.request?.value);
  const contextText = textFromInputValue(inputs.context?.value);
  const mediaText = textFromInputValue(inputs.media?.value);
  const model =
    typeof node.model === "string" && node.model.trim()
      ? node.model.trim()
      : textFromInputValue(inputs.model?.value);
  const temperature = numberFromInputValue(inputs.temperature?.value);
  const maxTokens = numberFromInputValue(inputs.maxTokens?.value);
  const customSystemPrompt = textFromInputValue(inputs.systemPrompt?.value);
  const systemPrompt = [preset.systemPrompt, customSystemPrompt]
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = buildWorkflowAgentPrompt(preset, {
    request,
    contextText,
    mediaText,
    config,
  });
  const providerOverrides = providerOverridesFromConfig(config);
  const providerMetadata = {
    workflowId: String(context.workflow._id),
    workflowRunId: String(context.run._id),
    nodeId: node.id,
    nodeType: node.type,
    agentPreset: preset.id,
    ...(Object.keys(providerOverrides).length
      ? { bulkapisInput: providerOverrides }
      : {}),
  };

  if (![request, contextText, mediaText].some((value) => value?.trim())) {
    throw new Error(`${node.label} needs a request, context, or media input.`);
  }
  if (!provider.capabilities.structured) {
    throw new Error(`${provider.displayName} does not support structured generation.`);
  }

  const structuredResult = await provider.generateStructured<unknown>({
    prompt: userPrompt,
    systemPrompt,
    model,
    temperature,
    maxTokens,
    schemaName: `${preset.id}_agent_output`,
    metadata: providerMetadata,
  });
  const outputText = agentOutputText({
    object: structuredResult.object,
    fallbackText: structuredResult.text,
    outputKind: preset.outputKind,
  });
  const lifecycle = placeholderLifecycleForNode(graph, node);
  const artifactId = await ctx.runMutation(
    internal.artifacts.records.createFromRunner,
    {
      userId: context.run.userId,
      workflowId: context.workflow._id,
      workflowRunId: context.run._id,
      parentArtifactIds: artifactIdsFromInputs(resolvedInputs, [
        "media",
        "context",
        "input",
      ]),
      type: preset.artifactType,
      title: `${node.label} ${preset.label} output`,
      data: {
        nodeId: node.id,
        nodeType: node.type,
        agentPreset: preset.id,
        outputKind: preset.outputKind,
        text: outputText,
        json: structuredResult.object,
        inputSummary: resolvedInputs.summary,
        providerMetadata: structuredResult.metadata,
      },
      provider: structuredResult.metadata.provider,
      model: structuredResult.metadata.model,
      prompt: userPrompt,
      lifecycle,
      reviewStatus: "not_required",
    }
  );

  const outputRefs = agentOutputRefsForNode({
    nodeId: node.id,
    artifactId,
    text: outputText,
    object: structuredResult.object,
    outputKind: preset.outputKind,
  });
  const costUsd = structuredResult.metadata.costUsd ?? 0;

  await ctx.runMutation(internal.workflows.runs.transitionNodeState, {
    runId: context.run._id,
    nodeId: node.id,
    status: "succeeded",
    outputRefs,
    costUsd,
  });
  await ctx.runMutation(internal.workflows.runs.recordEvent, {
    userId: context.run.userId,
    workflowRunId: context.run._id,
    workflowId: context.workflow._id,
    type: "model_call",
    nodeId: node.id,
    message: `${node.label} ran ${preset.label}.`,
    data: {
      provider: structuredResult.metadata.provider,
      model: structuredResult.metadata.model,
      usage: structuredResult.metadata.usage,
      costUsd,
      agentPreset: preset.id,
    },
  });
  await ctx.runMutation(internal.workflows.runs.recordEvent, {
    userId: context.run.userId,
    workflowRunId: context.run._id,
    workflowId: context.workflow._id,
    type: "node_completed",
    nodeId: node.id,
    message: `${node.label} produced ${preset.outputKind} output.`,
    data: {
      nodeType: node.type,
      lifecycle,
      artifactId,
      provider: structuredResult.metadata.provider,
      model: structuredResult.metadata.model,
      agentPreset: preset.id,
      outputKind: preset.outputKind,
      outputPorts: outputRefs.map((outputRef) => outputRef.port),
      placeholderExecution: false,
    },
  });

  return { costUsd, emittedArtifactIds: [artifactId] };
}

import { Box, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import type {
  NodeRetentionMode,
  WorkflowNodeType,
  WorkflowProviderName,
} from "../../lib/workflow/workflowGraph";
import type {
  WorkflowCanvasNodeData,
  WorkflowFlowNode,
} from "../../lib/workflow/workflowCanvasGraph";
import type { ConfigField } from "../../lib/workflow/workflowConfigFields";
import {
  operationConfigPatch,
  type GenerationOperation,
  type GenerationOperationId,
} from "../../lib/generation/generationOperations";
import type { WorkflowNodeCatalogEntry } from "../../lib/workflow/workflowNodeCatalog";
import type { WorkflowSelectOption } from "./WorkflowSelect";
import { WorkflowSelect } from "./WorkflowSelect";
import { fallbackWorkflowNodeIcon, workflowNodeIcons } from "./workflowNodeIcons";

const providerOptions: Array<{ value: WorkflowProviderName; label: string }> = [
  { value: "bulkapis", label: "BulkAPIs" },
  { value: "gemini", label: "Gemini" },
  { value: "fal", label: "fal.ai" },
  { value: "openrouter", label: "OpenRouter" },
];

const publishingProviderOptions: Array<{ value: WorkflowProviderName; label: string }> = [
  { value: "post_bridge", label: "PostBridge" },
  { value: "postiz", label: "Postiz" },
  { value: "manual", label: "Manual export" },
];

const retentionOptions: Array<{ value: NodeRetentionMode; label: string }> = [
  { value: "inherit", label: "Inherit workflow default" },
  { value: "keep", label: "Keep output" },
  { value: "discard", label: "Discard output" },
  { value: "keep_on_failure", label: "Keep on failure" },
];

function configSectionTitleForNodeType(type: WorkflowNodeType): string {
  if ([
    "ai_video_editor",
    "ai_agent",
    "audio_generation",
    "image_generation",
    "lipsync",
    "llm",
    "native_slideshow_planner",
    "video_generation",
  ].includes(type)) {
    return "Inputs";
  }

  if (type === "media") return "Media";
  if (type === "auto_post") return "Publishing";
  if (type === "export") return "Export";
  return "Config";
}

function renderConfigFieldsWithPairs(
  fields: ConfigField[],
  renderConfigField: (field: ConfigField) => ReactNode
) {
  const rendered: ReactNode[] = [];
  let index = 0;

  while (index < fields.length) {
    const field = fields[index];
    const nextField = fields[index + 1];

    if (field.key === "localStartFrameImages" && nextField?.key === "localEndFrameImages") {
      rendered.push(
        <div
          className="grid min-w-0 gap-[var(--space-3)] sm:grid-cols-2"
          key="start-end-frame-pair"
        >
          {renderConfigField(field)}
          {renderConfigField(nextField)}
        </div>
      );
      index += 2;
      continue;
    }

    rendered.push(<div key={field.key}>{renderConfigField(field)}</div>);
    index += 1;
  }

  return rendered;
}

export type WorkflowNodeInspectorProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpdateNodeData: (
    updater: (data: WorkflowCanvasNodeData) => Partial<WorkflowCanvasNodeData>
  ) => void;
  renderConfigField: (field: ConfigField) => ReactNode;
  selectedAdvancedConfigFields: ConfigField[];
  selectedGenerationOperation?: GenerationOperation;
  selectedGenerationOperationOptions: GenerationOperation[];
  selectedModelOptions: Array<{ modelId: string; displayName: string }>;
  selectedModelPickerOptions: WorkflowSelectOption[];
  selectedNode: WorkflowFlowNode | null;
  selectedNodeDefinition: WorkflowNodeCatalogEntry | null;
  selectedProviderCatalogName?: WorkflowProviderName;
  selectedProviderModel: Doc<"providerModels"> | null;
  selectedProviderModels: Doc<"providerModels">[] | undefined;
  selectedPrimaryConfigFields: ConfigField[];
  showModelControl: boolean;
  showProviderControl: boolean;
};

export function WorkflowNodeInspector({
  isOpen,
  onClose,
  onUpdateNodeData,
  renderConfigField,
  selectedAdvancedConfigFields,
  selectedGenerationOperation,
  selectedGenerationOperationOptions,
  selectedModelOptions,
  selectedModelPickerOptions,
  selectedNode,
  selectedNodeDefinition,
  selectedProviderCatalogName,
  selectedProviderModel,
  selectedProviderModels,
  selectedPrimaryConfigFields,
  showModelControl,
  showProviderControl,
}: WorkflowNodeInspectorProps) {
  const showRetentionControl = selectedNode
    ? !["comment", "media", "runner"].includes(selectedNode.data.type)
    : false;
  const availableProviderOptions =
    selectedNode?.data.type === "auto_post" ? publishingProviderOptions : providerOptions;

  return (
    <aside
      className={`workflow-node-inspector workflow-side-drawer${
        isOpen ? " workflow-side-drawer-open" : ""
      }`}
      aria-label="Workflow node inspector"
    >
      {selectedNode && selectedNodeDefinition ? (
        <>
          <div className="workflow-node-inspector-header">
            <span className="workflow-node-inspector-icon">
              {(() => {
                const Icon = workflowNodeIcons[selectedNode.data.type] ?? fallbackWorkflowNodeIcon;
                return <Icon size={16} />;
              })()}
            </span>
            <div>
              <h2>{selectedNode.data.label}</h2>
              <p>{selectedNodeDefinition.description}</p>
            </div>
            <button
              aria-label="Close node settings"
              className="workflow-drawer-close"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>

          <div className="workflow-inspector-group">
            <label className="workflow-inspector-field">
              <span>Label</span>
              <input
                onChange={(event) =>
                  onUpdateNodeData(() => ({ label: event.target.value }))
                }
                type="text"
                value={selectedNode.data.label}
              />
            </label>

            {showProviderControl ? (
              <div className="workflow-inspector-field">
                <span>Provider</span>
                <WorkflowSelect
                  disabled={selectedNodeDefinition.providerRequirement === "none"}
                  onChange={(nextValue) => {
                    const provider = nextValue
                      ? (nextValue as WorkflowProviderName)
                      : undefined;

                    onUpdateNodeData((data) => ({
                      provider,
                      model: provider === data.provider ? data.model : undefined,
                    }));
                  }}
                  options={[
                    { value: "", label: "No provider" },
                    ...availableProviderOptions.map((provider) => ({
                      value: provider.value,
                      label: provider.label,
                    })),
                  ]}
                  placeholder="Select provider"
                  value={selectedNode.data.provider ?? ""}
                />
              </div>
            ) : null}

            {showModelControl ? (
              <>
                {selectedGenerationOperationOptions.length > 1 ? (
                  <div className="workflow-inspector-field">
                    <span>Operation</span>
                    <WorkflowSelect
                      onChange={(nextValue) => {
                        const operationId = nextValue as GenerationOperationId;
                        onUpdateNodeData((data) => ({
                          model: undefined,
                          config: {
                            ...data.config,
                            ...operationConfigPatch(operationId),
                          },
                        }));
                      }}
                      options={selectedGenerationOperationOptions.map((operation) => ({
                        value: operation.id,
                        label: operation.label,
                        description: operation.description,
                      }))}
                      placeholder="Select operation"
                      rich
                      value={selectedGenerationOperation?.id ?? ""}
                    />
                  </div>
                ) : null}
                <div className="workflow-inspector-field">
                  <span>Model</span>
                  <WorkflowSelect
                    disabled={!selectedProviderCatalogName || !selectedModelOptions.length}
                    onChange={(nextValue) =>
                      onUpdateNodeData(() => ({
                        model: nextValue || undefined,
                        provider: selectedProviderCatalogName,
                      }))
                    }
                    options={selectedModelPickerOptions}
                    placeholder={
                      selectedProviderCatalogName
                        ? selectedProviderModels === undefined
                          ? "Loading models"
                          : "Select model"
                        : "No model catalog"
                    }
                    rich
                    value={selectedNode.data.model ?? ""}
                  />
                  <small>
                    {selectedProviderModel?.description ?? "Uses the selected provider integration."}
                  </small>
                </div>
              </>
            ) : null}
          </div>

          <div className="workflow-inspector-group">
            <div className="workflow-inspector-section-heading">
              <h3>{configSectionTitleForNodeType(selectedNode.data.type)}</h3>
              <span>
                {selectedProviderModel
                  ? selectedProviderModel.displayName
                  : selectedNodeDefinition.configSchemaMode.replace(/_/g, " ")}
              </span>
            </div>

            {selectedPrimaryConfigFields.length ? (
              renderConfigFieldsWithPairs(selectedPrimaryConfigFields, renderConfigField)
            ) : (
              <p className="workflow-inspector-empty">This node has no static config yet.</p>
            )}

            {selectedAdvancedConfigFields.length ? (
              <div className="workflow-inspector-advanced">
                <div className="workflow-inspector-section-heading">
                  <h3>Advanced</h3>
                  <span>{selectedAdvancedConfigFields.length} fields</span>
                </div>
                {renderConfigFieldsWithPairs(selectedAdvancedConfigFields, renderConfigField)}
              </div>
            ) : null}
          </div>

          {showRetentionControl ? (
            <div className="workflow-inspector-group">
              <div className="workflow-inspector-field">
                <span>Retention</span>
                <WorkflowSelect
                  onChange={(nextValue) =>
                    onUpdateNodeData((data) => ({
                      retention: {
                        ...(data.retention ?? {}),
                        mode: nextValue as NodeRetentionMode,
                      },
                    }))
                  }
                  options={retentionOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  placeholder="Select retention"
                  value={selectedNode.data.retention?.mode ?? "inherit"}
                />
              </div>

              <label className="workflow-inspector-toggle">
                <input
                  checked={selectedNode.data.retention?.exposeInLibrary ?? false}
                  onChange={(event) =>
                    onUpdateNodeData((data) => ({
                      retention: {
                        mode: data.retention?.mode ?? "inherit",
                        exposeInLibrary: event.target.checked,
                      },
                    }))
                  }
                  type="checkbox"
                />
                <span>Expose output in media library</span>
              </label>
            </div>
          ) : null}

        </>
      ) : (
        <div className="workflow-inspector-empty-state">
          <Box size={18} />
          <h2>Select a node</h2>
          <p>Node settings appear here without running the workflow.</p>
        </div>
      )}
    </aside>
  );
}

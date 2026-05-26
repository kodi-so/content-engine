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
import type { WorkflowNodeCatalogEntry } from "../../lib/workflow/workflowNodeCatalog";
import type { WorkflowSelectOption } from "./WorkflowSelect";
import { WorkflowSelect } from "./WorkflowSelect";
import { fallbackWorkflowNodeIcon, workflowNodeIcons } from "./workflowNodeIcons";
import { formatStatus, formatTimestamp, type WorkflowRunDoc } from "./workflowRunFormat";

const providerOptions: Array<{ value: WorkflowProviderName; label: string }> = [
  { value: "bulkapis", label: "BulkAPIs" },
  { value: "gemini", label: "Gemini" },
  { value: "fal", label: "fal.ai" },
  { value: "openrouter", label: "OpenRouter" },
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

export type WorkflowNodeInspectorProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpdateNodeData: (
    updater: (data: WorkflowCanvasNodeData) => Partial<WorkflowCanvasNodeData>
  ) => void;
  renderConfigField: (field: ConfigField) => ReactNode;
  selectedAdvancedConfigFields: ConfigField[];
  selectedModelOptions: Array<{ modelId: string; displayName: string }>;
  selectedModelPickerOptions: WorkflowSelectOption[];
  selectedNode: WorkflowFlowNode | null;
  selectedNodeDefinition: WorkflowNodeCatalogEntry | null;
  selectedNodeRunEvents: Doc<"workflowRunEvents">[];
  selectedNodeRunState: Doc<"workflowRunNodeStates"> | null;
  selectedProviderCatalogName?: string;
  selectedProviderModel: Doc<"providerModels"> | null;
  selectedProviderModels: Doc<"providerModels">[] | undefined;
  selectedPrimaryConfigFields: ConfigField[];
  selectedRun: WorkflowRunDoc | null;
  showModelControl: boolean;
  showProviderControl: boolean;
};

export function WorkflowNodeInspector({
  isOpen,
  onClose,
  onUpdateNodeData,
  renderConfigField,
  selectedAdvancedConfigFields,
  selectedModelOptions,
  selectedModelPickerOptions,
  selectedNode,
  selectedNodeDefinition,
  selectedNodeRunEvents,
  selectedNodeRunState,
  selectedProviderCatalogName,
  selectedProviderModel,
  selectedProviderModels,
  selectedPrimaryConfigFields,
  selectedRun,
  showModelControl,
  showProviderControl,
}: WorkflowNodeInspectorProps) {
  const showRetentionControl = selectedNode?.data.type !== "comment";
  const showRunDebugSection = selectedNode?.data.type !== "comment";

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
                    ...providerOptions.map((provider) => ({
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
              <div className="workflow-inspector-field">
                <span>Model</span>
                <WorkflowSelect
                  disabled={!selectedProviderCatalogName || !selectedModelOptions.length}
                  onChange={(nextValue) =>
                    onUpdateNodeData(() => ({
                      model: nextValue || undefined,
                      provider: "bulkapis",
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
                  {selectedProviderModel?.description ?? "Uses the workspace BulkAPIs integration."}
                </small>
              </div>
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
              selectedPrimaryConfigFields.map((field) => renderConfigField(field))
            ) : (
              <p className="workflow-inspector-empty">This node has no static config yet.</p>
            )}

            {selectedAdvancedConfigFields.length ? (
              <div className="workflow-inspector-advanced">
                <div className="workflow-inspector-section-heading">
                  <h3>Advanced</h3>
                  <span>{selectedAdvancedConfigFields.length} fields</span>
                </div>
                {selectedAdvancedConfigFields.map((field) => renderConfigField(field))}
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

          {showRunDebugSection ? (
            <div className="workflow-inspector-group">
              <div className="workflow-inspector-section-heading">
                <h3>Run Debug</h3>
                <span>
                  {selectedNodeRunState
                    ? formatStatus(selectedNodeRunState.status)
                    : selectedRun
                      ? formatStatus(selectedRun.status)
                      : "No run"}
                </span>
              </div>
              {selectedNodeRunState ? (
                <div className="workflow-node-state-card">
                  <span>{formatStatus(selectedNodeRunState.status)}</span>
                  <strong>
                    {selectedNodeRunState.startedAt
                      ? formatTimestamp(selectedNodeRunState.startedAt)
                      : "Not started"}
                  </strong>
                  {selectedNodeRunState.errorMessage ? (
                    <p>{selectedNodeRunState.errorMessage}</p>
                  ) : selectedNodeRunState.blockedByNodeIds?.length ? (
                    <p>Blocked by {selectedNodeRunState.blockedByNodeIds.join(", ")}</p>
                  ) : (
                    <p>
                      {selectedNodeRunState.dependencyNodeIds.length
                        ? `Depends on ${selectedNodeRunState.dependencyNodeIds.join(", ")}`
                        : "No upstream dependencies"}
                    </p>
                  )}
                </div>
              ) : null}
              {selectedNodeRunEvents.length ? (
                <div className="workflow-node-event-list">
                  {selectedNodeRunEvents.map((event) => (
                    <div className="workflow-node-event" key={event._id}>
                      <span>{formatStatus(event.type)}</span>
                      <p>{event.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="workflow-inspector-empty">
                  No node events or debug artifacts for the selected run yet.
                </p>
              )}
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

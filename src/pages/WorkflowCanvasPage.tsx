import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LoadingState, Page } from "../components/ui";
import { WorkflowCanvasBoard } from "../components/workflow/WorkflowCanvasBoard";
import { WorkflowCanvasHeader } from "../components/workflow/WorkflowCanvasHeader";
import { WorkflowConfigField } from "../components/workflow/WorkflowConfigField";
import { WorkflowExecutionPanel } from "../components/workflow/WorkflowExecutionPanel";
import { WorkflowNodeInspector } from "../components/workflow/WorkflowNodeInspector";
import { WorkflowNodePalette } from "../components/workflow/WorkflowNodePalette";
import type { SelectableLibraryAsset } from "../features/assets/assetTypes";
import { useWorkspace } from "../contexts/WorkspaceContext";
import {
  localReferenceFilesFromConfig,
  type ConfigField,
  type LocalReferenceFileKind,
} from "../lib/workflow/workflowConfigFields";
import { assignReferenceAliases } from "../lib/references/referenceAliases";
import { useWorkflowNodeModelControls } from "../hooks/workflow/useWorkflowNodeModelControls";
import { useWorkflowLocalReferenceFiles } from "../hooks/workflow/useWorkflowLocalReferenceFiles";
import { useWorkflowCanvasGraph } from "../features/workflow-canvas/useWorkflowCanvasGraph";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unable to save workflow graph.";
}

export function WorkflowCanvasPage() {
  const { workflowId } = useParams();
  const { activeWorkspace } = useWorkspace();
  const workflow = useQuery(
    api.workflows.definitions.get,
    workflowId ? { id: workflowId as Id<"workflows"> } : "skip"
  );
  const workflowSocialAccounts = useQuery(
    api.accounts.socialAccounts.list,
    workflow
      ? workflow.workspaceId
        ? { workspaceId: workflow.workspaceId }
        : {}
      : "skip"
  );
  const workflowRuns = useQuery(
    api.workflows.runs.list,
    workflowId ? { workflowId: workflowId as Id<"workflows"> } : "skip"
  );
  const selectableLibraryAssets = useQuery(
    api.library.assets.listSelectable,
    workflow?.workspaceId ? { workspaceId: workflow.workspaceId } : {}
  );
  const updateGraph = useMutation(api.workflows.definitions.updateGraph);
  const createManualRun = useMutation(api.workflows.runs.createManualRun);
  const setWorkflowActive = useMutation(api.workflows.definitions.setActive);
  const uploadReferenceImage = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isUpdatingActiveState, setIsUpdatingActiveState] = useState(false);
  const [runActionStatus, setRunActionStatus] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<Id<"workflowRuns"> | null>(null);
  const selectedRun = useMemo(
    () =>
      workflowRuns?.find((run) => run._id === selectedRunId) ??
      workflowRuns?.[0] ??
      null,
    [selectedRunId, workflowRuns]
  );
  const selectedRunEvents = useQuery(
    api.workflows.runs.getEvents,
    selectedRun ? { workflowRunId: selectedRun._id } : "skip"
  );
  const selectedRunNodeStates = useQuery(
    api.workflows.runs.getNodeStates,
    selectedRun ? { workflowRunId: selectedRun._id } : "skip"
  );
  const selectedRunArtifacts = useQuery(
    api.artifacts.records.list,
    selectedRun ? { workflowRunId: selectedRun._id } : "skip"
  );
  const {
    clearNodeSelection,
    connectionStatus,
    edges,
    graphValidation,
    handleAddNode,
    handleConnect,
    handleEdgesChange,
    handleNodesChange,
    handleSelectNode,
    hasRunnerNode,
    isDirtyRef,
    isSaving,
    isValidConnection,
    nodesWithExecutionState,
    openDrawer,
    saveGraphNow,
    saveStatus,
    selectedNode,
    selectedNodeDefinition,
    setOpenDrawer,
    setSaveStatus,
    updateSelectedBooleanConfigValue,
    updateSelectedConfigValue,
    updateSelectedNodeData,
  } = useWorkflowCanvasGraph({
    selectedRunNodeStates,
    updateGraph,
    workflow,
    workspaceAiGenerationSettings: activeWorkspace?.aiGenerationSettings,
  });
  const {
    selectedConfigFields,
    selectedGenerationOperation,
    selectedGenerationOperationOptions,
    selectedImageModelUiContract,
    selectedModelOptions,
    selectedModelPickerOptions,
    selectedProviderCatalogName,
    selectedProviderModel,
    selectedProviderModels,
    showModelControl,
    showProviderControl,
  } = useWorkflowNodeModelControls({
    selectedNode,
    selectedNodeDefinition,
  });
  const selectedPrimaryConfigFields = selectedConfigFields.filter((field) => !field.advanced);
  const selectedAdvancedConfigFields = selectedConfigFields.filter((field) => field.advanced);

  useEffect(() => {
    if (!workflowRuns) return;
    if (!workflowRuns.length) {
      setSelectedRunId(null);
      return;
    }
    if (selectedRunId && workflowRuns.some((run) => run._id === selectedRunId)) return;

    setSelectedRunId(workflowRuns[0]._id);
  }, [selectedRunId, workflowRuns]);

  const {
    handleLocalReferenceFileUpload,
    isUploadingImageReference,
    localFileFieldMeta,
    removeLocalReferenceFile,
    updateLocalReferenceAlias,
  } = useWorkflowLocalReferenceFiles({
    onSaveStatusChange: setSaveStatus,
    selectedImageModelUiContract,
    selectedNode,
    updateSelectedNodeData,
    uploadReferenceImage,
  });

  const handleLibraryReferenceSelect = useCallback(
    (
      assets: SelectableLibraryAsset[],
      configKey: string,
      kind: LocalReferenceFileKind,
      options: { multiple?: boolean; maxCount?: number } = {}
    ) => {
      if (!assets.length) return;

      updateSelectedNodeData((data) => {
        const existingFiles = localReferenceFilesFromConfig(data.config, configKey, kind);
        const remainingSlots = options.maxCount
          ? Math.max(0, options.maxCount - existingFiles.length)
          : options.multiple === false
            ? 1
            : assets.length;
        const selectedAssets = assets.slice(0, remainingSlots);

        if (!selectedAssets.length) {
          setSaveStatus(
            options.maxCount
              ? `This field allows up to ${options.maxCount} file${options.maxCount === 1 ? "" : "s"}.`
              : "This field only allows one file."
          );
          return {};
        }

        const selectedFiles = selectedAssets.map((asset) => ({
          id: asset.id,
          source: asset.source,
          sourceId: asset.sourceId,
          storageUrl: asset.storageUrl,
          title: asset.title,
          mimeType: asset.mimeType,
          kind: asset.mediaKind === "media" ? kind : asset.mediaKind,
        }));

        return {
          config: {
            ...data.config,
            [configKey]: assignReferenceAliases(
              [
                ...(options.multiple === false
                  ? []
                  : localReferenceFilesFromConfig(data.config, configKey, kind)),
                ...selectedFiles,
              ],
              kind
            ),
          },
        };
      });
    },
    [updateSelectedNodeData]
  );

  const handleCreateManualRun = useCallback(async () => {
    if (!workflow) return;

    if (isDirtyRef.current) {
      setRunActionStatus("Saving latest changes...");
      const didSave = await saveGraphNow();
      if (!didSave) {
        setRunActionStatus("Resolve the autosave issue before starting a run.");
        return;
      }
    }

    if (!graphValidation?.valid) {
      setRunActionStatus(graphValidation?.errors[0]?.message ?? "Workflow graph is invalid.");
      return;
    }

    setIsCreatingRun(true);
    setRunActionStatus("");

    try {
      const runId = await createManualRun({ workflowId: workflow._id });
      setSelectedRunId(runId);
      setRunActionStatus("Run queued");
    } catch (error) {
      setRunActionStatus(getErrorMessage(error));
    } finally {
      setIsCreatingRun(false);
    }
  }, [createManualRun, graphValidation, saveGraphNow, workflow]);

  const handleToggleActive = useCallback(async () => {
    if (!workflow) return;

    if (isDirtyRef.current) {
      const didSave = await saveGraphNow();
      if (!didSave) return;
    }

    setIsUpdatingActiveState(true);
    setSaveStatus("");

    try {
      await setWorkflowActive({ id: workflow._id, isActive: !workflow.isActive });
      setSaveStatus(workflow.isActive ? "Workflow paused" : "Workflow activated");
    } catch (error) {
      setSaveStatus(getErrorMessage(error));
    } finally {
      setIsUpdatingActiveState(false);
    }
  }, [saveGraphNow, setWorkflowActive, workflow]);

  const renderConfigField = (field: ConfigField) =>
    selectedNode ? (
      <WorkflowConfigField
        field={field}
        isUploadingImageReference={isUploadingImageReference}
        key={field.key}
        localFileFieldMeta={localFileFieldMeta}
        libraryAssets={selectableLibraryAssets}
        onBooleanConfigChange={updateSelectedBooleanConfigValue}
        onConfigChange={updateSelectedConfigValue}
        onLibraryReferenceSelect={handleLibraryReferenceSelect}
        onLocalReferenceFileUpload={(files, configKey, kind, options) => {
          void handleLocalReferenceFileUpload(files, configKey, kind, options);
        }}
        onRemoveLocalReferenceFile={removeLocalReferenceFile}
        onUpdateLocalReferenceAlias={updateLocalReferenceAlias}
        selectedImageModelUiContract={selectedImageModelUiContract}
        selectedNode={selectedNode}
        workflowSocialAccounts={workflowSocialAccounts}
      />
    ) : null;

  if (!workflowId) {
    return (
      <Page title="Workflow" description="No workflow was selected.">
        <Link className="secondary-button workflow-back-link" to="/workflows">
          <ArrowLeft size={16} />
          Back to workflows
        </Link>
      </Page>
    );
  }

  if (workflow === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--color-page)] p-[var(--space-5)]">
        <LoadingState
          className="w-[min(100%,28rem)] border-solid bg-[var(--color-surface)]"
          detail="Loading nodes, connections, and saved workflow settings."
          title="Loading workflow canvas"
        />
      </div>
    );
  }

  if (workflow === null) {
    return (
      <Page title="Workflow not found" description="This workflow may have been deleted or belongs to another account.">
        <Link className="secondary-button workflow-back-link" to="/workflows">
          <ArrowLeft size={16} />
          Back to workflows
        </Link>
      </Page>
    );
  }

  return (
    <section className="workflow-detail-page">
      <WorkflowCanvasHeader
        canRun={Boolean(graphValidation?.valid)}
        isCreatingRun={isCreatingRun}
        isSaving={isSaving}
        isUpdatingActiveState={isUpdatingActiveState}
        onCreateManualRun={() => {
          setOpenDrawer("execution");
          void handleCreateManualRun();
        }}
        onToggleActive={() => {
          void handleToggleActive();
        }}
        onToggleExecutions={() =>
          setOpenDrawer((currentDrawer) =>
            currentDrawer === "execution" ? null : "execution"
          )
        }
        saveStatus={saveStatus}
        showExecutions={openDrawer === "execution"}
        workflow={workflow}
      />

      <div className="workflow-canvas-layout">
        <WorkflowNodePalette hasRunnerNode={hasRunnerNode} onAddNode={handleAddNode} />

        <WorkflowCanvasBoard
          connectionStatus={connectionStatus}
          edges={edges}
          isValidConnection={isValidConnection}
          nodes={nodesWithExecutionState}
          onConnect={handleConnect}
          onEdgesChange={handleEdgesChange}
          onNodesChange={handleNodesChange}
          onPaneClick={clearNodeSelection}
          onSelectNode={handleSelectNode}
        />

        <WorkflowNodeInspector
          isOpen={openDrawer === "node"}
          onClose={() => setOpenDrawer(null)}
          onUpdateNodeData={updateSelectedNodeData}
          renderConfigField={renderConfigField}
          selectedAdvancedConfigFields={selectedAdvancedConfigFields}
          selectedGenerationOperation={selectedGenerationOperation}
          selectedGenerationOperationOptions={selectedGenerationOperationOptions}
          selectedModelOptions={selectedModelOptions}
          selectedModelPickerOptions={selectedModelPickerOptions}
          selectedNode={selectedNode}
          selectedNodeDefinition={selectedNodeDefinition}
          selectedProviderCatalogName={selectedProviderCatalogName}
          selectedProviderModel={selectedProviderModel}
          selectedProviderModels={selectedProviderModels}
          selectedPrimaryConfigFields={selectedPrimaryConfigFields}
          showModelControl={showModelControl}
          showProviderControl={showProviderControl}
        />

        <WorkflowExecutionPanel
          isOpen={openDrawer === "execution"}
          onClose={() => setOpenDrawer(null)}
          onSelectRun={setSelectedRunId}
          actionStatus={runActionStatus}
          selectedCanvasNode={
            selectedNode
              ? { id: selectedNode.id, label: selectedNode.data.label }
              : null
          }
          selectedRun={selectedRun}
          selectedRunArtifacts={selectedRunArtifacts}
          selectedRunEvents={selectedRunEvents}
          selectedRunNodeStates={selectedRunNodeStates}
          workflowRuns={workflowRuns}
        />
      </div>
    </section>
  );
}

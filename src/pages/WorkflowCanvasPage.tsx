import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Page } from "../components/ui";
import { WorkflowCanvasBoard } from "../components/workflow/WorkflowCanvasBoard";
import { WorkflowCanvasHeader } from "../components/workflow/WorkflowCanvasHeader";
import { WorkflowConfigField } from "../components/workflow/WorkflowConfigField";
import { WorkflowExecutionPanel } from "../components/workflow/WorkflowExecutionPanel";
import { WorkflowNodeInspector } from "../components/workflow/WorkflowNodeInspector";
import { WorkflowNodePalette } from "../components/workflow/WorkflowNodePalette";
import type {
  WorkflowGraph,
  WorkflowNodeType,
} from "../lib/workflow/workflowGraph";
import {
  cloneConfig,
  nextEdgeId,
  nextNodeId,
  nextNodePosition,
  toFlowEdges,
  toFlowNodes,
  toWorkflowGraph,
  validateCanvasConnection,
  type WorkflowCanvasNodeData,
  type WorkflowCanvasNodeExecutionStatus,
  type WorkflowFlowNode,
} from "../lib/workflow/workflowCanvasGraph";
import type { ConfigField } from "../lib/workflow/workflowConfigFields";
import { getWorkflowNodeDefinition } from "../lib/workflow/workflowNodeCatalog";
import { validateWorkflowGraph } from "../lib/workflow/workflowGraphValidation";
import { recommendedModelIdForNodeType } from "../lib/workflow/workflowModelCatalog";
import { useWorkflowNodeModelControls } from "../hooks/workflow/useWorkflowNodeModelControls";
import { useWorkflowLocalReferenceFiles } from "../hooks/workflow/useWorkflowLocalReferenceFiles";

type WorkflowRunNodeStateDoc = Doc<"workflowRunNodeStates">;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unable to save workflow graph.";
}

function nodeExecutionStatus(
  nodeId: string,
  nodeStates: WorkflowRunNodeStateDoc[] | undefined
): WorkflowCanvasNodeExecutionStatus | undefined {
  const nodeState = nodeStates?.find((state) => state.nodeId === nodeId);
  if (!nodeState) return undefined;

  if (nodeState.status === "queued") return "queued";
  if (nodeState.status === "running") return "running";
  if (nodeState.status === "failed") return "failed";
  if (nodeState.status === "blocked") return "blocked";
  if (nodeState.status === "succeeded") return "completed";
  return undefined;
}

export function WorkflowCanvasPage() {
  const { workflowId } = useParams();
  const workflow = useQuery(
    api.workflows.definitions.get,
    workflowId ? { id: workflowId as Id<"workflows"> } : "skip"
  );
  const workflowPersonas = useQuery(
    api.accounts.personas.list,
    workflow?.brandId ? { brandId: workflow.brandId } : "skip"
  );
  const workflowRuns = useQuery(
    api.workflows.runs.list,
    workflowId ? { workflowId: workflowId as Id<"workflows"> } : "skip"
  );
  const updateGraph = useMutation(api.workflows.definitions.updateGraph);
  const createManualRun = useMutation(api.workflows.runs.createManualRun);
  const setWorkflowActive = useMutation(api.workflows.definitions.setActive);
  const uploadReferenceImage = useAction(api.storage.files.uploadBase64ImageWithMetadata);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const [isUpdatingActiveState, setIsUpdatingActiveState] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [runActionStatus, setRunActionStatus] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<Id<"workflowRuns"> | null>(null);
  const [openDrawer, setOpenDrawer] = useState<"node" | "execution" | null>(null);

  const flowNodes = useMemo(
    () => (workflow ? toFlowNodes(workflow.graph as WorkflowGraph) : []),
    [workflow]
  );
  const flowEdges = useMemo(
    () => (workflow ? toFlowEdges(workflow.graph as WorkflowGraph) : []),
    [workflow]
  );
  const hasRunnerNode = nodes.some((node) => node.data.type === "runner");
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const selectedNodeDefinition = selectedNode
    ? getWorkflowNodeDefinition(selectedNode.data.type)
    : null;
  const {
    selectedConfigFields,
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
  const editableGraph = useMemo(
    () => (workflow ? toWorkflowGraph(workflow.graph as WorkflowGraph, nodes, edges) : null),
    [edges, nodes, workflow]
  );
  const draftGraphValidation = useMemo(
    () => (editableGraph ? validateWorkflowGraph(editableGraph, "draft") : null),
    [editableGraph]
  );
  const graphValidation = useMemo(
    () => (editableGraph ? validateWorkflowGraph(editableGraph, "executable") : null),
    [editableGraph]
  );
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
  const nodesWithExecutionState = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          executionStatus: nodeExecutionStatus(node.id, selectedRunNodeStates),
        },
      })),
    [nodes, selectedRunNodeStates]
  );
  const selectedNodeRunState = selectedNode
    ? selectedRunNodeStates?.find((state) => state.nodeId === selectedNode.id) ?? null
    : null;
  const selectedNodeRunEvents = selectedNode
    ? selectedRunEvents?.filter((event) => event.nodeId === selectedNode.id) ?? []
    : [];

  useEffect(() => {
    if (!workflow) return;

    setNodes(flowNodes);
    setEdges(flowEdges);
    setIsDirty(false);
    setSaveStatus("");
    setConnectionStatus("");
  }, [flowEdges, flowNodes, setEdges, setNodes, workflow]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setOpenDrawer((currentDrawer) => (currentDrawer === "node" ? null : currentDrawer));
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!workflowRuns) return;
    if (!workflowRuns.length) {
      setSelectedRunId(null);
      return;
    }
    if (selectedRunId && workflowRuns.some((run) => run._id === selectedRunId)) return;

    setSelectedRunId(workflowRuns[0]._id);
  }, [selectedRunId, workflowRuns]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      if (changes.some((change) => change.type === "position" || change.type === "dimensions")) {
        setIsDirty(true);
        setSaveStatus("");
      }

      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((change) => change.type === "remove" || change.type === "add")) {
        setIsDirty(true);
        setSaveStatus("");
        setConnectionStatus("");
      }

      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      const definition = getWorkflowNodeDefinition(type);
      const defaultModel = recommendedModelIdForNodeType(type);

      if (type === "runner" && hasRunnerNode) return;

      setNodes((currentNodes) => {
        const nodeId = nextNodeId(type, currentNodes);
        setSelectedNodeId(nodeId);
        setOpenDrawer("node");

        return [
          ...currentNodes,
          {
            id: nodeId,
            type: "workflowNode",
            position: nextNodePosition(currentNodes),
            data: {
              config: cloneConfig(definition.defaultConfig),
              label: definition.label,
              model: defaultModel,
              provider: definition.defaultProvider,
              retention: definition.defaultRetention,
              type,
            },
          },
        ];
      });
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("");
    },
    [hasRunnerNode, setNodes]
  );

  const handleSelectNode = useCallback(
    (node: WorkflowFlowNode) => {
      setSelectedNodeId(node.id);
      setOpenDrawer("node");

      if (node.data.model) return;

      const defaultModel = recommendedModelIdForNodeType(node.data.type);
      if (!defaultModel) return;

      const definition = getWorkflowNodeDefinition(node.data.type);
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) =>
          currentNode.id === node.id
            ? {
                ...currentNode,
                data: {
                  ...currentNode.data,
                  model: defaultModel,
                  provider: currentNode.data.provider ?? definition.defaultProvider,
                },
              }
            : currentNode
        )
      );
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("");
    },
    [setNodes]
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      validateCanvasConnection(connection, nodes, edges) === null,
    [edges, nodes]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const validationError = validateCanvasConnection(connection, nodes, edges);

      if (validationError) {
        setConnectionStatus(validationError);
        return;
      }

      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            id: nextEdgeId(connection, currentEdges),
            animated: false,
            deletable: true,
            type: "bezier",
          },
          currentEdges
        )
      );
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("Connected");
    },
    [edges, nodes, setEdges]
  );

  const updateSelectedNodeData = useCallback(
    (updater: (data: WorkflowCanvasNodeData) => Partial<WorkflowCanvasNodeData>) => {
      if (!selectedNodeId) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...updater(node.data),
                },
              }
            : node
        )
      );
      setIsDirty(true);
      setSaveStatus("");
      setConnectionStatus("");
    },
    [selectedNodeId, setNodes]
  );

  const updateSelectedConfigValue = useCallback(
    (key: string, value: unknown) => {
      updateSelectedNodeData((data) => ({
        config: {
          ...data.config,
          [key]: value,
        },
      }));
    },
    [updateSelectedNodeData]
  );

  const updateSelectedBooleanConfigValue = useCallback(
    (key: string, value: boolean) => {
      updateSelectedNodeData((data) => ({
        config: {
          ...data.config,
          [key]: value,
        },
      }));
    },
    [updateSelectedNodeData]
  );

  const {
    handleLocalReferenceFileUpload,
    isUploadingImageReference,
    localFileFieldMeta,
    removeLocalReferenceFile,
  } = useWorkflowLocalReferenceFiles({
    onSaveStatusChange: setSaveStatus,
    selectedImageModelUiContract,
    selectedNode,
    updateSelectedNodeData,
    uploadReferenceImage,
  });

  const handleSaveGraph = useCallback(async () => {
    if (!workflow) return;

    setIsSaving(true);
    setSaveStatus("");

    try {
      const graph = toWorkflowGraph(workflow.graph as WorkflowGraph, nodes, edges);
      const validation = validateWorkflowGraph(graph, "draft");

      if (!validation.valid) {
        setSaveStatus(validation.errors[0]?.message ?? "Workflow graph is invalid.");
        return;
      }

      await updateGraph({ id: workflow._id, graph });
      setIsDirty(false);
      setSaveStatus("Saved");
      setConnectionStatus("");
    } catch (error) {
      setSaveStatus(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [edges, nodes, updateGraph, workflow]);

  const handleCreateManualRun = useCallback(async () => {
    if (!workflow) return;

    if (isDirty) {
      setRunActionStatus("Save the workflow graph before starting a run.");
      return;
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
  }, [createManualRun, graphValidation, isDirty, workflow]);

  const handleToggleActive = useCallback(async () => {
    if (!workflow) return;

    if (isDirty) {
      setSaveStatus("Save the workflow graph before changing its active state.");
      return;
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
  }, [isDirty, setWorkflowActive, workflow]);

  const renderConfigField = (field: ConfigField) =>
    selectedNode ? (
      <WorkflowConfigField
        field={field}
        isUploadingImageReference={isUploadingImageReference}
        key={field.key}
        localFileFieldMeta={localFileFieldMeta}
        onBooleanConfigChange={updateSelectedBooleanConfigValue}
        onConfigChange={updateSelectedConfigValue}
        onLocalReferenceFileUpload={(event, configKey, kind, options) => {
          void handleLocalReferenceFileUpload(event, configKey, kind, options);
        }}
        onRemoveLocalReferenceFile={removeLocalReferenceFile}
        selectedImageModelUiContract={selectedImageModelUiContract}
        selectedNode={selectedNode}
        workflowBrandId={workflow?.brandId}
        workflowPersonas={workflowPersonas}
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
    return <div className="workflow-canvas-loading">Loading workflow canvas...</div>;
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
        canSave={Boolean(draftGraphValidation?.valid)}
        edgeCount={edges.length}
        isCreatingRun={isCreatingRun}
        isDirty={isDirty}
        isSaving={isSaving}
        isUpdatingActiveState={isUpdatingActiveState}
        nodeCount={nodes.length}
        onCreateManualRun={() => {
          setOpenDrawer("execution");
          void handleCreateManualRun();
        }}
        onSaveGraph={() => {
          void handleSaveGraph();
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
          onPaneClick={() => {
            setSelectedNodeId(null);
            setOpenDrawer((currentDrawer) => (currentDrawer === "node" ? null : currentDrawer));
          }}
          onSelectNode={handleSelectNode}
        />

        <WorkflowNodeInspector
          isOpen={openDrawer === "node"}
          onClose={() => setOpenDrawer(null)}
          onUpdateNodeData={updateSelectedNodeData}
          renderConfigField={renderConfigField}
          selectedAdvancedConfigFields={selectedAdvancedConfigFields}
          selectedModelOptions={selectedModelOptions}
          selectedModelPickerOptions={selectedModelPickerOptions}
          selectedNode={selectedNode}
          selectedNodeDefinition={selectedNodeDefinition}
          selectedNodeRunEvents={selectedNodeRunEvents}
          selectedNodeRunState={selectedNodeRunState}
          selectedProviderCatalogName={selectedProviderCatalogName}
          selectedProviderModel={selectedProviderModel}
          selectedProviderModels={selectedProviderModels}
          selectedPrimaryConfigFields={selectedPrimaryConfigFields}
          selectedRun={selectedRun}
          showModelControl={showModelControl}
          showProviderControl={showProviderControl}
        />

        <WorkflowExecutionPanel
          graphValidation={graphValidation}
          isCreatingRun={isCreatingRun}
          isDirty={isDirty}
          isOpen={openDrawer === "execution"}
          onClose={() => setOpenDrawer(null)}
          onCreateRun={() => {
            void handleCreateManualRun();
          }}
          onSelectRun={setSelectedRunId}
          runActionStatus={runActionStatus}
          selectedRun={selectedRun}
          selectedRunArtifacts={selectedRunArtifacts}
          selectedRunEvents={selectedRunEvents}
          selectedRunNodeStates={selectedRunNodeStates}
          workflow={workflow}
          workflowRuns={workflowRuns}
        />
      </div>
    </section>
  );
}

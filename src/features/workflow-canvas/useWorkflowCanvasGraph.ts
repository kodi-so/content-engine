import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  generationDefaultForWorkflowNode,
  type AiGenerationSettings,
} from "../../lib/providers/aiGenerationDefaults";
import type { WorkflowGraph, WorkflowNodeType } from "../../lib/workflow/workflowGraph";
import {
  cloneConfig,
  inferCanvasConnectionPorts,
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
} from "../../lib/workflow/workflowCanvasGraph";
import { validateWorkflowGraph } from "../../lib/workflow/workflowGraphValidation";
import { recommendedModelIdForNodeType } from "../../lib/workflow/workflowModelCatalog";
import { getWorkflowNodeDefinition } from "../../lib/workflow/workflowNodeCatalog";

type WorkflowDoc = Doc<"workflows">;
type WorkflowRunNodeStateDoc = Doc<"workflowRunNodeStates">;
type WorkflowDrawer = "node" | "execution" | null;

const WORKFLOW_GRAPH_AUTOSAVE_DELAY_MS = 900;

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

export function useWorkflowCanvasGraph({
  selectedRunNodeStates,
  updateGraph,
  workflow,
  workspaceAiGenerationSettings,
}: {
  selectedRunNodeStates?: WorkflowRunNodeStateDoc[];
  updateGraph: (args: { id: Id<"workflows">; graph: WorkflowGraph }) => Promise<unknown>;
  workflow?: WorkflowDoc | null;
  workspaceAiGenerationSettings?: AiGenerationSettings | null;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [openDrawer, setOpenDrawer] = useState<WorkflowDrawer>(null);
  const graphAutosaveTimeoutRef = useRef<number | null>(null);
  const graphEditVersionRef = useRef(0);
  const activeSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const isDirtyRef = useRef(false);

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
  const canvasRunNodeStates = openDrawer === "execution" ? selectedRunNodeStates : undefined;
  const nodesWithExecutionState = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          executionStatus: nodeExecutionStatus(node.id, canvasRunNodeStates),
          isSelected:
            node.id === selectedNodeId &&
            (openDrawer === "node" || openDrawer === "execution"),
        },
      })),
    [canvasRunNodeStates, nodes, openDrawer, selectedNodeId]
  );

  const defaultProviderModelForNode = useCallback(
    (type: WorkflowNodeType) => {
      const definition = getWorkflowNodeDefinition(type);
      const generationDefault = generationDefaultForWorkflowNode(
        workspaceAiGenerationSettings,
        type
      );
      if (generationDefault) {
        return {
          provider: generationDefault.provider,
          model: undefined,
        };
      }

      return {
        provider: definition.defaultProvider,
        model: recommendedModelIdForNodeType(type),
      };
    },
    [workspaceAiGenerationSettings]
  );

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    if (!workflow) return;
    if (isDirtyRef.current) return;

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

  const clearGraphAutosaveTimeout = useCallback(() => {
    if (!graphAutosaveTimeoutRef.current) return;

    window.clearTimeout(graphAutosaveTimeoutRef.current);
    graphAutosaveTimeoutRef.current = null;
  }, []);

  const markGraphDirty = useCallback(() => {
    graphEditVersionRef.current += 1;
    setIsDirty(true);
    setSaveStatus("");
  }, []);

  const saveGraphNow = useCallback(async () => {
    if (!workflow || !editableGraph) return false;

    clearGraphAutosaveTimeout();

    if (activeSavePromiseRef.current) {
      await activeSavePromiseRef.current;
      if (!isDirtyRef.current) return true;
    }

    const validation = validateWorkflowGraph(editableGraph, "draft");

    if (!validation.valid) {
      setSaveStatus(validation.errors[0]?.message ?? "Workflow graph is invalid.");
      return false;
    }

    const saveVersion = graphEditVersionRef.current;
    setIsSaving(true);
    setSaveStatus("Autosaving...");

    const savePromise = updateGraph({ id: workflow._id, graph: editableGraph })
      .then(() => {
        if (graphEditVersionRef.current !== saveVersion) {
          setSaveStatus("");
          return false;
        }

        setIsDirty(false);
        setSaveStatus("Saved");
        setConnectionStatus("");
        return true;
      })
      .catch((error: unknown) => {
        setSaveStatus(getErrorMessage(error));
        return false;
      })
      .finally(() => {
        if (activeSavePromiseRef.current === savePromise) {
          activeSavePromiseRef.current = null;
          setIsSaving(false);
        }
      });

    activeSavePromiseRef.current = savePromise;
    return await savePromise;
  }, [clearGraphAutosaveTimeout, editableGraph, updateGraph, workflow]);

  useEffect(() => {
    if (!isDirty || !workflow || isSaving) return;

    if (!draftGraphValidation?.valid) {
      setSaveStatus(draftGraphValidation?.errors[0]?.message ?? "Workflow graph is invalid.");
      return;
    }

    clearGraphAutosaveTimeout();

    graphAutosaveTimeoutRef.current = window.setTimeout(() => {
      graphAutosaveTimeoutRef.current = null;
      void saveGraphNow();
    }, WORKFLOW_GRAPH_AUTOSAVE_DELAY_MS);

    return clearGraphAutosaveTimeout;
  }, [
    clearGraphAutosaveTimeout,
    draftGraphValidation,
    isDirty,
    isSaving,
    saveGraphNow,
    workflow,
  ]);

  useEffect(() => clearGraphAutosaveTimeout, [clearGraphAutosaveTimeout]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => {
      if (
        changes.some((change) => change.type === "position" || change.type === "remove")
      ) {
        markGraphDirty();
      }

      onNodesChange(changes);
    },
    [markGraphDirty, onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((change) => change.type === "remove" || change.type === "add")) {
        markGraphDirty();
        setConnectionStatus("");
      }

      onEdgesChange(changes);
    },
    [markGraphDirty, onEdgesChange]
  );

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      const definition = getWorkflowNodeDefinition(type);
      const nodeDefault = defaultProviderModelForNode(type);

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
              model: nodeDefault.model,
              provider: nodeDefault.provider,
              retention: definition.defaultRetention,
              type,
            },
          },
        ];
      });
      markGraphDirty();
      setConnectionStatus("");
    },
    [defaultProviderModelForNode, hasRunnerNode, markGraphDirty, setNodes]
  );

  const handleSelectNode = useCallback(
    (node: WorkflowFlowNode) => {
      setSelectedNodeId(node.id);

      if (openDrawer === "execution") {
        return;
      }

      setOpenDrawer("node");

      if (node.data.model) return;

      const nodeDefault = defaultProviderModelForNode(node.data.type);
      if (!nodeDefault.model && !nodeDefault.provider) return;

      setNodes((currentNodes) =>
        currentNodes.map((currentNode) =>
          currentNode.id === node.id
            ? {
                ...currentNode,
                data: {
                  ...currentNode.data,
                  model: nodeDefault.model,
                  provider: currentNode.data.provider ?? nodeDefault.provider,
                },
              }
            : currentNode
        )
      );
      markGraphDirty();
      setConnectionStatus("");
    },
    [defaultProviderModelForNode, markGraphDirty, openDrawer, setNodes]
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

      const inferredPorts = inferCanvasConnectionPorts(connection, nodes);
      if (!inferredPorts) {
        setConnectionStatus("Connection references an unknown port.");
        return;
      }

      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            id: nextEdgeId(
              {
                ...connection,
                sourceHandle: inferredPorts.sourcePort.id,
                targetHandle: inferredPorts.targetPort.id,
              },
              currentEdges
            ),
            animated: false,
            data: {
              sourcePort: inferredPorts.sourcePort.id,
              targetPort: inferredPorts.targetPort.id,
            },
            deletable: true,
            type: "bezier",
          },
          currentEdges
        )
      );
      markGraphDirty();
      setConnectionStatus("Connected");
    },
    [edges, markGraphDirty, nodes, setEdges]
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
      markGraphDirty();
      setConnectionStatus("");
    },
    [markGraphDirty, selectedNodeId, setNodes]
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

  const clearNodeSelection = useCallback(() => {
    setSelectedNodeId(null);
    setOpenDrawer((currentDrawer) => (currentDrawer === "node" ? null : currentDrawer));
  }, []);

  return {
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
    setConnectionStatus,
    setOpenDrawer,
    setSaveStatus,
    clearNodeSelection,
    updateSelectedBooleanConfigValue,
    updateSelectedConfigValue,
    updateSelectedNodeData,
  };
}

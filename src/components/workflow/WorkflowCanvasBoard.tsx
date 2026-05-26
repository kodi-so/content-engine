import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { WorkflowCanvasNode } from "./WorkflowCanvasNode";
import type { WorkflowFlowNode } from "../../lib/workflow/workflowCanvasGraph";

const nodeTypes = {
  workflowNode: WorkflowCanvasNode,
};

type WorkflowCanvasBoardProps = {
  connectionStatus: string;
  edges: Edge[];
  isValidConnection: (connection: Connection | Edge) => boolean;
  nodes: WorkflowFlowNode[];
  onConnect: (connection: Connection) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onNodesChange: (changes: NodeChange<WorkflowFlowNode>[]) => void;
  onPaneClick: () => void;
  onSelectNode: (node: WorkflowFlowNode) => void;
};

export function WorkflowCanvasBoard({
  connectionStatus,
  edges,
  isValidConnection,
  nodes,
  onConnect,
  onEdgesChange,
  onNodesChange,
  onPaneClick,
  onSelectNode,
}: WorkflowCanvasBoardProps) {
  return (
    <div className="workflow-canvas-shell">
      <ReactFlowProvider>
        <ReactFlow
          colorMode="light"
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.35 }}
          maxZoom={1.4}
          minZoom={0.35}
          nodes={nodes}
          nodeTypes={nodeTypes}
          nodesDraggable
          nodesFocusable
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_event, node) => onSelectNode(node)}
          onNodesChange={onNodesChange}
          onPaneClick={onPaneClick}
          panOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background color="oklch(75% 0.034 220)" gap={22} size={1.2} />
          <MiniMap pannable zoomable />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
      {connectionStatus ? (
        <div className="workflow-canvas-status" role="status">
          {connectionStatus}
        </div>
      ) : null}
    </div>
  );
}

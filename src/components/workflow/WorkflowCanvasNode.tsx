import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getWorkflowNodeDefinition } from "../../lib/workflow/workflowNodeCatalog";
import { modelCategoryForNodeType } from "../../lib/workflow/workflowModelCatalog";
import { WORKFLOW_CANVAS_INPUT_HANDLE_ID } from "../../lib/workflow/workflowPortMapping";
import type { WorkflowFlowNode } from "../../lib/workflow/workflowCanvasGraph";
import { fallbackWorkflowNodeIcon, workflowNodeIcons } from "./workflowNodeIcons";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function portOffset(index: number, count: number): number {
  if (count <= 1) return 50;
  const available = 68;
  return 16 + (available / (count - 1)) * index;
}

function roleBorderClass(role: string) {
  if (role === "runner") return "border-[oklch(58%_0.12_150)]";
  if (role === "terminal") return "border-[oklch(52%_0.105_174)]";
  if (role === "annotation") return "border-dashed bg-[oklch(98%_0.012_92_/_0.94)]";
  return "border-[var(--color-border)]";
}

function executionClass(status: WorkflowFlowNode["data"]["executionStatus"]) {
  if (status === "running") return "border-[var(--color-primary)] shadow-[0_16px_36px_oklch(58%_0.12_220_/_0.16)]";
  if (status === "queued") return "border-[oklch(68%_0.12_82)]";
  if (status === "failed") return "border-[oklch(55%_0.14_25)] shadow-[0_16px_36px_oklch(55%_0.14_25_/_0.14)]";
  if (status === "blocked") return "border-[oklch(60%_0.065_42)] shadow-[0_16px_36px_oklch(60%_0.065_42_/_0.12)]";
  if (status === "completed") return "border-[oklch(56%_0.12_153)]";
  return null;
}

export function WorkflowCanvasNode({ data }: NodeProps<WorkflowFlowNode>) {
  const definition = getWorkflowNodeDefinition(data.type);
  const Icon = workflowNodeIcons[data.type] ?? fallbackWorkflowNodeIcon;
  const hasInputHandle = data.type !== "runner";
  const showModelStatus = Boolean(modelCategoryForNodeType(data.type)) && Boolean(data.model);

  return (
    <div
      className={cx(
        "relative grid w-fit min-w-40 max-w-64 gap-[var(--space-2)] rounded-[var(--radius-md)] border bg-[oklch(99%_0.004_232_/_0.96)] p-[var(--space-3)] shadow-[0_14px_34px_oklch(20%_0.025_232_/_0.08)]",
        "min-h-[4.55rem]",
        showModelStatus && "min-w-[12.75rem]",
        roleBorderClass(definition.role),
        executionClass(data.executionStatus)
      )}
    >
      {hasInputHandle ? (
        <Handle
          className="!size-[0.65rem] !border-2 !border-[var(--color-surface-raised)] !bg-[var(--color-primary)] !left-[-0.34rem]"
          id={WORKFLOW_CANVAS_INPUT_HANDLE_ID}
          position={Position.Left}
          style={{ top: "50%" }}
          type="target"
        />
      ) : null}

      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-[var(--space-2)] font-[760] text-[var(--color-ink)]">
        <span className="grid size-7 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
          <Icon size={16} />
        </span>
        <span className="min-w-0 truncate">{data.label}</span>
      </div>
      {data.executionStatus ? (
        <span className="w-fit rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)] px-[var(--space-2)] py-[0.1rem] text-[0.66rem] font-[830] capitalize text-[var(--color-ink-soft)]">
          {data.executionStatus}
        </span>
      ) : null}
      {showModelStatus ? (
        <div className="grid border-t border-[var(--color-border)] pt-[var(--space-2)]">
          <strong className="min-w-0 truncate text-[0.78rem] font-[780] leading-[1.2] text-[var(--color-ink-muted)]">
            {String(data.model)}
          </strong>
        </div>
      ) : null}

      {definition.outputPorts.map((port, index) => (
        <Handle
          className="!size-[0.65rem] !border-2 !border-[var(--color-surface-raised)] !bg-[var(--color-primary)] !right-[-0.34rem]"
          id={port.id}
          key={port.id}
          position={Position.Right}
          style={{ top: `${portOffset(index, definition.outputPorts.length)}%` }}
          type="source"
        />
      ))}
    </div>
  );
}

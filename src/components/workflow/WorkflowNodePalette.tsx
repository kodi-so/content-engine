import { useMemo, useState, type CSSProperties } from "react";
import type { WorkflowNodeType } from "../../lib/workflow/workflowGraph";
import {
  listWorkflowNodeDefinitions,
  type WorkflowNodeCatalogEntry,
} from "../../lib/workflow/workflowNodeCatalog";
import { fallbackWorkflowNodeIcon, workflowNodeIcons } from "./workflowNodeIcons";

const paletteSections = [
  { category: "control", label: "Control" },
  { category: "input", label: "Input" },
  { category: "language", label: "Language" },
  { category: "agent", label: "Agents" },
  { category: "generation", label: "Generation" },
  { category: "assembly", label: "Assembly" },
  { category: "output", label: "Output" },
  { category: "utility", label: "Utility" },
] as const;

type PaletteTooltipState = {
  label: string;
  description: string;
  top: number;
  left: number;
};

export type WorkflowNodePaletteProps = {
  hasRunnerNode: boolean;
  onAddNode: (type: WorkflowNodeType) => void;
};

export function WorkflowNodePalette({
  hasRunnerNode,
  onAddNode,
}: WorkflowNodePaletteProps) {
  const [paletteTooltip, setPaletteTooltip] = useState<PaletteTooltipState | null>(null);
  const paletteDefinitions = useMemo(() => listWorkflowNodeDefinitions(), []);
  const paletteTooltipStyle = paletteTooltip
    ? ({
        top: `${paletteTooltip.top}px`,
        left: `${paletteTooltip.left}px`,
      } satisfies CSSProperties)
    : undefined;

  const showPaletteTooltip = (
    target: HTMLElement,
    definition: WorkflowNodeCatalogEntry,
    isDisabled: boolean
  ) => {
    const rect = target.getBoundingClientRect();
    setPaletteTooltip({
      label: definition.label,
      description: isDisabled ? "Already on canvas" : definition.description,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  return (
    <>
      <aside className="workflow-node-palette" aria-label="Workflow node palette">
        <div className="workflow-node-palette-header">
          <h2>Add node</h2>
          <span>{paletteDefinitions.length} types</span>
        </div>

        {paletteSections.map((section) => {
          const sectionDefinitions = paletteDefinitions.filter(
            (definition) => definition.category === section.category
          );

          if (!sectionDefinitions.length) return null;

          return (
            <section className="mt-[var(--space-2)] first:mt-0 max-[760px]:contents" key={section.category}>
              <h3 className="sr-only">{section.label}</h3>
              <div className="grid gap-[var(--space-2)] max-[760px]:contents">
                {sectionDefinitions.map((definition) => {
                  const Icon = workflowNodeIcons[definition.type] ?? fallbackWorkflowNodeIcon;
                  const isDisabled = definition.type === "runner" && hasRunnerNode;

                  return (
                    <span
                      className="block min-w-0"
                      key={definition.type}
                      onBlur={() => setPaletteTooltip(null)}
                      onFocus={(event) =>
                        showPaletteTooltip(event.currentTarget, definition, isDisabled)
                      }
                      onMouseEnter={(event) =>
                        showPaletteTooltip(event.currentTarget, definition, isDisabled)
                      }
                      onMouseLeave={() => setPaletteTooltip(null)}
                    >
                      <button
                        className="grid size-[2.85rem] min-h-[2.85rem] grid-cols-1 justify-items-center rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-0 text-left text-[var(--color-ink)] transition-transform hover:-translate-y-px hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:opacity-55"
                        disabled={isDisabled}
                        aria-label={`Add ${definition.label}`}
                        onClick={() => onAddNode(definition.type)}
                        type="button"
                      >
                        <span className="grid size-[2.85rem] place-items-center rounded-[1rem] text-[var(--color-primary-strong)]">
                          <Icon size={15} />
                        </span>
                        <span className="sr-only">
                          <strong className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.82rem] font-[780]">
                            {definition.label}
                          </strong>
                          <small className="mt-[0.14rem] block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.72rem] font-[700] capitalize text-[var(--color-ink-soft)]">
                            {isDisabled ? "Already on canvas" : definition.providerRequirement}
                          </small>
                        </span>
                      </button>
                    </span>
                  );
                })}
              </div>
            </section>
          );
        })}
      </aside>

      {paletteTooltip ? (
        <div
          className="pointer-events-none fixed z-[60] grid w-max max-w-[min(18rem,calc(100vw-7rem))] translate-y-[-50%] gap-[0.15rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--color-ink)] shadow-[var(--shadow-lg)] before:absolute before:left-[-0.34rem] before:top-1/2 before:size-[0.62rem] before:translate-y-[-50%] before:rotate-45 before:border-b before:border-l before:border-[var(--color-border)] before:bg-[var(--color-surface)] before:content-['']"
          role="tooltip"
          style={paletteTooltipStyle}
        >
          <strong className="text-[0.8rem] font-[780] leading-[1.2]">{paletteTooltip.label}</strong>
          <span className="text-[0.72rem] font-[650] leading-[1.35] text-[var(--color-ink-muted)]">{paletteTooltip.description}</span>
        </div>
      ) : null}
    </>
  );
}

import { Bug, Send, Square } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { AssetListItem } from "../assets/AssetListItem";
import { AssetPreviewModal } from "../assets/AssetPreviewModal";
import type { AssetPreviewItem } from "../assets/assetTypes";
import {
  RichMentionTextarea,
  type RichMentionToken,
} from "../../components/references/RichMentionTextarea";
import type {
  AgentCreateCheckpointMode,
  AgentCreateMentionOption,
  AgentCreateSelectedMention,
} from "./agentCreateTypes";
import {
  agentCreateClassNames,
  formatAgentCreateEntityType,
  mentionTokenForLabel,
} from "./agentCreateUi";

type MentionSelection = {
  mention: AgentCreateSelectedMention;
  option: AgentCreateMentionOption;
  range: {
    end: number;
    start: number;
  };
};

function optionMatchesQuery(option: AgentCreateMentionOption, query: string) {
  if (!query) return true;

  return [
    option.label,
    option.description,
    option.sourceLabel,
    option.mediaType,
    formatAgentCreateEntityType(option.entityType),
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(query));
}

function uniqueMentionOptions(options: AgentCreateMentionOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

export function AgentCreatePrompt({
  className,
  checkpointMode = "debug",
  disabled = false,
  isSubmitting = false,
  isStopping = false,
  isWorking = false,
  mentionOptions = [],
  onChange,
  onCheckpointModeChange,
  onMentionSelect,
  onPasteFiles,
  onStop,
  onSubmit,
  placeholder = "Describe what you want to create",
  selectedMentions = [],
  submitLabel = "Send",
  value,
}: {
  className?: string;
  checkpointMode?: AgentCreateCheckpointMode;
  disabled?: boolean;
  isSubmitting?: boolean;
  isStopping?: boolean;
  isWorking?: boolean;
  mentionOptions?: AgentCreateMentionOption[];
  onChange: (value: string) => void;
  onCheckpointModeChange?: (mode: AgentCreateCheckpointMode) => void;
  onMentionSelect?: (selection: MentionSelection) => void;
  onPasteFiles?: (files: File[]) => Promise<RichMentionToken[]> | RichMentionToken[];
  onStop?: () => void;
  onSubmit?: () => void;
  placeholder?: string;
  selectedMentions?: AgentCreateSelectedMention[];
  submitLabel?: string;
  value: string;
}) {
  const [previewAsset, setPreviewAsset] = useState<AssetPreviewItem | null>(null);
  const availableOptions = useMemo(() => uniqueMentionOptions(mentionOptions), [mentionOptions]);
  const inlineMentionTokens = useMemo(
    () =>
      selectedMentions.map((mention) => ({
        token: mention.token,
        asset: {
          id: mention.entityId,
          title: mention.label,
          storageUrl: mention.previewUrl ?? mention.thumbnailUrl,
          thumbnailUrl: mention.thumbnailUrl,
          mimeType: mention.mimeType,
          mediaKind: mention.mediaType,
        },
        meta: [mention.token, mention.sourceLabel].filter(Boolean).join(" · "),
      })),
    [selectedMentions]
  );
  const canStop = isWorking && !isStopping && Boolean(onStop);
  const canSubmit = Boolean(value.trim()) && !disabled && !isSubmitting && !isWorking;
  const debugMode = checkpointMode === "debug";

  const assetForMentionOption = (option: AgentCreateMentionOption): AssetPreviewItem => ({
    id: option.id,
    title: option.label,
    storageUrl: option.previewUrl ?? option.thumbnailUrl,
    thumbnailUrl: option.thumbnailUrl,
    mimeType: option.mimeType,
    mediaKind: option.mediaType,
  });

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    onSubmit?.();
  };

  return (
    <form
      className={agentCreateClassNames(
        "grid min-w-0 gap-[var(--space-2)] rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)] shadow-[var(--shadow-lg)]",
        className
      )}
      onSubmit={handleSubmit}
    >
      <label className="grid min-w-0 gap-[var(--space-1)]">
        <span className="sr-only">{placeholder}</span>
        <RichMentionTextarea
          assetForOption={assetForMentionOption}
          className="max-h-[15rem] min-h-[3.35rem] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-[0.9rem] border-0 bg-[var(--color-page-quiet)] px-[var(--space-3)] py-[var(--space-2)] pr-[3.25rem] text-[0.92rem] leading-[1.45] text-[var(--color-ink)] outline-none transition focus:bg-[var(--color-page)] focus:shadow-[0_0_0_2px_oklch(57%_0.14_166_/_0.16)] aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          disabled={disabled}
          getReplacement={(option) => option.token ?? mentionTokenForLabel(option.label)}
          menuClassName="absolute bottom-[calc(100%+0.55rem)] left-2 z-30 grid max-h-72 w-[min(30rem,calc(100%-1rem))] overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-1)] shadow-[var(--shadow-lg)]"
          metaForOption={(option) =>
            `${option.sourceLabel ?? formatAgentCreateEntityType(option.entityType)}${
              option.description ? ` - ${option.description}` : ""
            }`
          }
          onChange={onChange}
          onPasteFiles={onPasteFiles}
          onSelect={({ option, range, replacement }) => {
            const mention: AgentCreateSelectedMention = {
              token: replacement,
              label: option.label,
              entityType: option.entityType,
              entityId: option.id,
              mediaType: option.mediaType,
              mimeType: option.mimeType,
              previewUrl: option.previewUrl,
              sourceLabel: option.sourceLabel,
              thumbnailUrl: option.thumbnailUrl,
            };

            onMentionSelect?.({
              mention,
              option,
              range,
            });
          }}
          onSubmitShortcut={() => handleSubmit()}
          optionKey={(option) => option.id}
          optionMatchesQuery={optionMatchesQuery}
          options={availableOptions}
          placeholder={placeholder}
          renderOption={({ active, option, select }) => {
            const optionAsset = assetForMentionOption(option);
            const meta = `${option.sourceLabel ?? formatAgentCreateEntityType(option.entityType)}${
              option.description ? ` - ${option.description}` : ""
            }`;

            return (
              <AssetListItem
                active={active}
                asset={optionAsset}
                disabled={option.disabled}
                meta={meta}
                onPreview={setPreviewAsset}
                onSelect={select}
              />
            );
          }}
          tokens={inlineMentionTokens}
          value={value}
        />
      </label>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-[var(--space-2)] px-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[var(--space-2)]">
          <button
            aria-pressed={debugMode}
            className={agentCreateClassNames(
              "inline-flex min-h-8 shrink-0 items-center gap-[0.4rem] rounded-full border px-[var(--space-2)] text-[0.73rem] font-[760] transition",
              debugMode
                ? "border-[oklch(72%_0.14_156_/_0.45)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            )}
            disabled={disabled || isSubmitting}
            onClick={() => onCheckpointModeChange?.(debugMode ? "auto" : "debug")}
            title={debugMode ? "Debug Mode pauses at checkpoints" : "Auto mode runs through to the result"}
            type="button"
          >
            <Bug size={13} />
            Debug
            <span
              className={agentCreateClassNames(
                "relative h-[1rem] w-[1.85rem] overflow-hidden rounded-full transition",
                debugMode ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
              )}
              aria-hidden="true"
            >
              <span
                className={agentCreateClassNames(
                  "absolute left-[0.125rem] top-[0.125rem] size-3 rounded-full bg-white transition-transform",
                  debugMode ? "translate-x-[0.85rem]" : "translate-x-0"
                )}
              />
            </span>
          </button>
        </div>

        {isWorking ? (
          <button
            aria-label={isStopping ? "Stopping" : "Stop generation"}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-ink)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canStop}
            onClick={onStop}
            title="Stop generation"
            type="button"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            aria-label={isSubmitting ? "Sending" : submitLabel}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSubmit}
            type="submit"
          >
            <Send size={16} />
          </button>
        )}
      </div>
      <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </form>
  );
}

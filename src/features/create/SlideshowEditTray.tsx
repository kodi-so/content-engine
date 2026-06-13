import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { LoadingSignal, Select } from "../../components/ui";
import type { SlideshowTextBlock } from "../../types";
import {
  applyPreset,
  editableBlockText,
  presetForBlock,
  type TextStylePreset,
} from "./slideshowEditorModel";

export type SlideshowEditTrayMode = "text" | "image" | null;

function CompactIconButton({
  children,
  className = "",
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={[
        "secondary-button size-9 justify-center rounded-[0.7rem] p-0",
        className,
      ].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SliderControl({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid min-w-[9rem] flex-1 gap-1 text-[0.74rem] font-[760] text-[var(--color-ink-muted)]">
      <span className="flex items-center justify-between gap-2">
        {label}
        <strong className="font-[780] text-[var(--color-ink)]">{value}px</strong>
      </span>
      <input
        className="w-full accent-[var(--color-primary)]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
    </label>
  );
}

export function SlideshowEditTray({
  activeTray,
  addTextBlock,
  canEditText,
  deleteTextBlock,
  imagePromptDraft,
  onClose,
  pendingAction,
  regenerateImage,
  selectedBlock,
  selectedBlockIndex,
  setImagePromptDraft,
  status,
  textBlocksCount,
  updateSelectedBlock,
}: {
  activeTray: SlideshowEditTrayMode;
  addTextBlock: () => void;
  canEditText: boolean;
  deleteTextBlock: () => void;
  imagePromptDraft: string;
  onClose: () => void;
  pendingAction: string | null;
  regenerateImage: () => void;
  selectedBlock?: SlideshowTextBlock;
  selectedBlockIndex: number;
  setImagePromptDraft: (value: string) => void;
  status: string;
  textBlocksCount: number;
  updateSelectedBlock: (patch: Partial<SlideshowTextBlock>) => void;
}) {
  if (!activeTray) return null;

  return (
    <div className="mx-auto grid w-full max-w-[54rem] gap-2 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[0_18px_38px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[0.78rem] font-[760] text-[var(--color-ink-muted)]">
          {activeTray === "image" ? <ImageIcon size={15} /> : <Type size={15} />}
          <span className="truncate">
            {activeTray === "text"
              ? `Text ${textBlocksCount === 0 ? "0" : `${Math.max(1, selectedBlockIndex + 1)}/${textBlocksCount}`}`
              : "Image prompt"}
          </span>
        </div>
        <CompactIconButton label="Close editor controls" onClick={onClose}>
          <X size={16} />
        </CompactIconButton>
      </div>

      {activeTray === "text" && !canEditText ? (
        <div className="rounded-[0.75rem] bg-[var(--color-page)] px-3 py-2 text-[0.82rem] text-[var(--color-ink-muted)]">
          Text overlays are editable for background + overlay slides.
        </div>
      ) : null}

      {activeTray === "text" && canEditText && !selectedBlock ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 flex-1 text-[0.86rem] text-[var(--color-ink-muted)]">
            This slide has no text boxes.
          </p>
          <button className="primary-button min-h-10 px-4 py-2 text-[0.82rem]" onClick={addTextBlock} type="button">
            <Plus size={16} />
            Text box
          </button>
        </div>
      ) : null}

      {activeTray === "text" && canEditText && selectedBlock ? (
        <div className="flex flex-wrap items-end gap-2">
          <input
            className="min-h-10 min-w-[16rem] flex-[1_1_22rem] rounded-[0.7rem] border border-[var(--color-border)] bg-[var(--color-page)] px-3 text-[0.9rem] text-[var(--color-ink)] outline-none transition focus:border-[var(--color-primary)]"
            onChange={(event) => updateSelectedBlock({ text: event.target.value, items: [] })}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Slide text"
            value={editableBlockText(selectedBlock)}
          />
          <div className="flex min-h-10 items-center gap-1 rounded-[0.75rem] border border-[var(--color-border)] bg-[var(--color-page)] p-1">
            <CompactIconButton label="Add text box" onClick={addTextBlock}>
              <Plus size={16} />
            </CompactIconButton>
            <CompactIconButton
              className="text-[var(--color-danger)]"
              label="Delete text box"
              onClick={deleteTextBlock}
            >
              <Trash2 size={16} />
            </CompactIconButton>
          </div>
          <div className="min-w-[9rem] flex-1">
            <Select
              label="Style"
              onChange={(value) =>
                updateSelectedBlock(applyPreset(selectedBlock, value as TextStylePreset))
              }
              value={presetForBlock(selectedBlock)}
            >
              <option value="outline">Outline</option>
              <option value="white">White text</option>
              <option value="black">Black text</option>
              <option value="yellow">Yellow text</option>
              <option value="white_background">White background</option>
              <option value="white_50_background">White 50% background</option>
            </Select>
          </div>
          <div className="flex min-h-10 items-center gap-1 rounded-[0.75rem] border border-[var(--color-border)] bg-[var(--color-page)] p-1">
            <CompactIconButton label="Align left" onClick={() => updateSelectedBlock({ align: "left" })}>
              <AlignLeft size={16} />
            </CompactIconButton>
            <CompactIconButton label="Align center" onClick={() => updateSelectedBlock({ align: "center" })}>
              <AlignCenter size={16} />
            </CompactIconButton>
            <CompactIconButton label="Align right" onClick={() => updateSelectedBlock({ align: "right" })}>
              <AlignRight size={16} />
            </CompactIconButton>
          </div>
          <SliderControl
            label="Size"
            max={150}
            min={20}
            onChange={(value) => updateSelectedBlock({ fontSize: value })}
            value={Math.round(selectedBlock.fontSize ?? 72)}
          />
          <SliderControl
            label="Outline"
            max={48}
            min={0}
            onChange={(value) => updateSelectedBlock({ strokeWidth: value })}
            value={Math.round(selectedBlock.strokeWidth ?? 8)}
          />
        </div>
      ) : null}

      {activeTray === "image" ? (
        <div className="grid gap-2">
          <textarea
            className="min-h-[4.8rem] rounded-[0.7rem] border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-2 text-[0.86rem] text-[var(--color-ink)] outline-none transition focus:border-[var(--color-primary)]"
            onChange={(event) => setImagePromptDraft(event.target.value)}
            placeholder="Describe the slide image"
            value={imagePromptDraft}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="secondary-button min-h-9 px-3 py-2 text-[0.8rem]"
              disabled={pendingAction !== null || !imagePromptDraft.trim()}
              onClick={regenerateImage}
              type="button"
            >
              {pendingAction === "regenerate" ? (
                <LoadingSignal label="Regenerating" size="sm" />
              ) : (
                <RefreshCw size={15} />
              )}
              Regenerate
            </button>
          </div>
        </div>
      ) : null}

      {status ? (
        <p className="m-0 px-1 text-[0.78rem] font-[650] text-[var(--color-ink-muted)]">
          {status}
        </p>
      ) : null}
    </div>
  );
}

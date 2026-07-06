import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Film,
  Music,
  Plus,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { CustomSelect } from "../../components/CustomSelect";
import { isImageOutput } from "../library/libraryMedia";
import type { LibraryOutput } from "../library/libraryTypes";
import {
  audioTrackRole,
  clipStartTime,
  DEFAULT_DUCK_VOLUME,
  formatTimelineTime,
  mediaKindForClip,
  type AudioTrackRole,
  type ClipTransitionType,
  type CompositionCaptions,
  type TimedTextOverlay,
  type VideoComposerAudioTrack,
  type VideoComposerClip,
} from "./videoComposerModel";
import {
  COMPOSITION_ASPECT_RATIO_OPTIONS,
  type CompositionAspectRatio,
} from "../../lib/composition/aspectRatios";
import {
  applyTextStylePreset,
  textStylePresetForBlock,
  type TextStylePreset,
} from "../../lib/composition/textOverlays";

type SliderControlProps = {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix?: string;
  value: number;
};

function SliderControl({
  label,
  max,
  min,
  onChange,
  suffix = "",
  value,
}: SliderControlProps) {
  return (
    <label className="grid min-w-[8rem] flex-1 gap-1 text-[0.74rem] font-[760] text-[var(--color-ink-muted)]">
      <span className="flex items-center justify-between gap-2">
        {label}
        <strong className="font-[780] text-[var(--color-ink)]">
          {Math.round(value)}
          {suffix}
        </strong>
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

function isCompositionAspectRatioValue(value: string): value is CompositionAspectRatio {
  return COMPOSITION_ASPECT_RATIO_OPTIONS.some((option) => option.value === value);
}

export function VideoComposerMediaPanel({
  selectedAssetId,
  visualOutputs,
  onAddSelectedClip,
  onAddTextOverlay,
  onSelectAsset,
}: {
  selectedAssetId: string;
  visualOutputs: LibraryOutput[];
  onAddSelectedClip: () => void;
  onAddTextOverlay: () => void;
  onSelectAsset: (assetId: string) => void;
}) {
  return (
    <aside className="grid min-h-0 grid-cols-[4.2rem_minmax(0,1fr)] overflow-hidden rounded-[0.4rem] bg-[var(--color-surface)]">
      <nav className="grid content-start gap-1 border-r border-[var(--color-border)] bg-[var(--color-page-quiet)] p-2">
        {[
          { label: "Media", icon: Film, active: true },
          { label: "Audio", icon: Music },
          { label: "Text", icon: Type },
          { label: "Adjust", icon: SlidersHorizontal },
        ].map((item) => (
          <button
            className={[
              "grid min-h-14 place-items-center rounded-[0.35rem] px-1 text-[0.68rem] font-[760] transition",
              item.active
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]",
            ].join(" ")}
            key={item.label}
            onClick={() => {
              if (item.label === "Text") onAddTextOverlay();
            }}
            type="button"
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-[0.9rem] font-[820] text-[var(--color-ink)]">Media</h2>
          <span className="text-[0.72rem] font-[760] text-[var(--color-ink-muted)]">
            {visualOutputs.length}
          </span>
        </div>
        <div className="grid gap-2">
          <CustomSelect
            dropdownClassName="!bg-[var(--color-surface)] !text-[var(--color-ink)]"
            onChange={onSelectAsset}
            options={visualOutputs.map((output) => ({
              value: output.id,
              label: output.title,
              description: output.source.replace(/_/g, " "),
              meta: isImageOutput(output) ? "image" : "video",
            }))}
            placeholder="Choose media"
            rich
            triggerClassName="grid min-h-9 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-2 text-left text-[0.8rem] font-[720] text-[var(--color-ink)] outline-none hover:border-[var(--color-border-strong)]"
            value={selectedAssetId}
          />
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[0.35rem] bg-[var(--color-primary-soft)] px-3 text-[0.78rem] font-[820] text-[var(--color-primary-strong)] transition hover:bg-[var(--color-surface-tinted)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!selectedAssetId}
            onClick={onAddSelectedClip}
            type="button"
          >
            <Plus size={15} />
            Add to timeline
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {visualOutputs.slice(0, 12).map((output) => (
              <button
                className={[
                  "grid overflow-hidden rounded-[0.45rem] border bg-[var(--color-page)] text-left transition hover:border-[var(--color-primary)]",
                  selectedAssetId === output.id
                    ? "border-[var(--color-primary)] shadow-[0_0_0_2px_oklch(45%_0.105_174_/_0.12)]"
                    : "border-[var(--color-border)]",
                ].join(" ")}
                key={output.id}
                onClick={() => onSelectAsset(output.id)}
                type="button"
              >
                <span className="relative aspect-video overflow-hidden bg-[var(--color-page-quiet)]">
                  {isImageOutput(output) ? (
                    <img
                      alt={output.title}
                      className="h-full w-full object-cover"
                      src={output.storageUrl}
                    />
                  ) : (
                    <video
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      src={output.storageUrl}
                    />
                  )}
                </span>
                <span className="px-2 py-2 text-[0.72rem] font-[760] leading-tight text-[var(--color-ink)] [overflow-wrap:anywhere]">
                  {output.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

const transitionOptions: Array<{ value: ClipTransitionType; label: string }> = [
  { value: "cut", label: "Cut" },
  { value: "crossfade", label: "Crossfade" },
  { value: "dip_to_black", label: "Dip to black" },
  { value: "dip_to_white", label: "Dip to white" },
  { value: "whip", label: "Whip" },
];

const kenBurnsOptions = [
  { value: "none", label: "Static" },
  { value: "zoom_in", label: "Zoom in" },
  { value: "zoom_out", label: "Zoom out" },
  { value: "pan_left", label: "Pan left" },
  { value: "pan_right", label: "Pan right" },
];

const captionPresetOptions = [
  { value: "clean_bold", label: "Clean bold" },
  { value: "karaoke_highlight", label: "Karaoke highlight" },
  { value: "boxed_lines", label: "Boxed lines" },
];

export function VideoComposerInspectorPanel({
  aspectRatio,
  audioTracks,
  captions,
  clips,
  durationSeconds,
  selectedClip,
  selectedClipIndex,
  selectedClipTrim,
  selectedText,
  textOverlays,
  onAddTextOverlay,
  onRemoveSelectedClip,
  onRemoveSelectedText,
  onSelectText,
  onSetAspectRatio,
  onSetPlayhead,
  onUpdateAudioTrack,
  onUpdateCaptions,
  onUpdateSelectedClip,
  onUpdateSelectedText,
}: {
  aspectRatio: CompositionAspectRatio;
  audioTracks: VideoComposerAudioTrack[];
  captions?: CompositionCaptions;
  clips: VideoComposerClip[];
  durationSeconds: number;
  selectedClip?: VideoComposerClip;
  selectedClipIndex: number;
  selectedClipTrim?: { startSeconds: number; endSeconds: number };
  selectedText?: TimedTextOverlay;
  textOverlays: TimedTextOverlay[];
  onAddTextOverlay: () => void;
  onRemoveSelectedClip: () => void;
  onRemoveSelectedText: () => void;
  onSelectText: Dispatch<SetStateAction<string>>;
  onSetAspectRatio: (aspectRatio: CompositionAspectRatio) => void;
  onSetPlayhead: (timeSeconds: number) => void;
  onUpdateAudioTrack: (trackId: string, patch: Partial<VideoComposerAudioTrack>) => void;
  onUpdateCaptions: (captions: CompositionCaptions | undefined) => void;
  onUpdateSelectedClip: (patch: Partial<VideoComposerClip>) => void;
  onUpdateSelectedText: (patch: Partial<TimedTextOverlay>) => void;
}) {
  const selectedClipIsImage = selectedClip ? mediaKindForClip(selectedClip) === "image" : false;
  const selectedClipIsLast = selectedClipIndex === clips.length - 1;
  return (
    <aside className="grid min-h-0 content-start gap-4 overflow-y-auto rounded-[0.4rem] bg-[var(--color-surface)] p-4">
      <div className="grid gap-2 border-b border-[var(--color-border)] pb-4">
        <h3 className="m-0 text-[0.9rem] font-[820] text-[var(--color-ink)]">Format</h3>
        <div className="grid grid-cols-2 gap-2">
          {COMPOSITION_ASPECT_RATIO_OPTIONS.map((option) => {
            const selected = option.value === aspectRatio;
            return (
              <button
                className={[
                  "grid min-h-12 gap-1 rounded-[0.35rem] border px-3 py-2 text-left transition",
                  selected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                    : "border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink)] hover:border-[var(--color-border-strong)]",
                ].join(" ")}
                key={option.value}
                onClick={() => {
                  if (isCompositionAspectRatioValue(option.value)) onSetAspectRatio(option.value);
                }}
                type="button"
              >
                <span className="text-[0.86rem] font-[820]">{option.label}</span>
                <span className="text-[0.66rem] font-[650] text-[var(--color-ink-muted)]">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="m-0 text-[0.9rem] font-[820] text-[var(--color-ink)]">Visual</h3>
        {selectedClip && selectedClipTrim ? (
          <div className="grid gap-3 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[0.88rem] font-[820] leading-tight text-[var(--color-ink)] [overflow-wrap:anywhere]">
                  {selectedClipIndex + 1}. {selectedClip.title}
                </p>
                <p className="m-0 text-[0.74rem] font-[700] text-[var(--color-ink-muted)]">
                  {formatTimelineTime(selectedClipTrim.endSeconds - selectedClipTrim.startSeconds)} in edit
                </p>
              </div>
              <button
                aria-label="Remove selected clip"
                className="grid size-8 place-items-center rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-danger)] transition hover:border-[var(--color-danger)]"
                onClick={onRemoveSelectedClip}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.78rem] font-[760] text-[var(--color-ink-muted)]">
              <Scissors size={15} />
              Trim source range
            </div>
            <div className="flex flex-wrap gap-3">
              <SliderControl
                label="Start"
                max={Math.max(0.1, (selectedClip.durationSeconds ?? 0) - 0.1)}
                min={0}
                onChange={(trimStartSeconds) => {
                  onUpdateSelectedClip({
                    trimStartSeconds: Math.min(
                      trimStartSeconds,
                      (selectedClip.trimEndSeconds ?? selectedClip.durationSeconds ?? 0) - 0.1
                    ),
                  });
                  onSetPlayhead(clipStartTime(clips, selectedClip.id));
                }}
                suffix="s"
                value={selectedClipTrim.startSeconds}
              />
              <SliderControl
                label="End"
                max={selectedClip.durationSeconds ?? 0.1}
                min={Math.min(selectedClip.durationSeconds ?? 0, selectedClipTrim.startSeconds + 0.1)}
                onChange={(trimEndSeconds) => {
                  onUpdateSelectedClip({
                    trimEndSeconds: Math.max(trimEndSeconds, selectedClipTrim.startSeconds + 0.1),
                  });
                }}
                suffix="s"
                value={selectedClipTrim.endSeconds}
              />
            </div>
            {selectedClipIsImage ? (
              <div className="grid gap-2">
                <span className="text-[0.76rem] font-[760] text-[var(--color-ink-muted)]">Motion</span>
                <div className="flex flex-wrap items-center gap-2">
                  <CustomSelect
                    onChange={(value) =>
                      onUpdateSelectedClip({
                        kenBurns: value === "none"
                          ? undefined
                          : {
                              direction: value as NonNullable<VideoComposerClip["kenBurns"]>["direction"],
                              intensity: selectedClip.kenBurns?.intensity ?? "subtle",
                            },
                      })
                    }
                    options={kenBurnsOptions}
                    placeholder="Motion"
                    value={selectedClip.kenBurns?.direction ?? "none"}
                  />
                  {selectedClip.kenBurns ? (
                    <CustomSelect
                      onChange={(value) =>
                        onUpdateSelectedClip({
                          kenBurns: {
                            direction: selectedClip.kenBurns!.direction,
                            intensity: value === "medium" ? "medium" : "subtle",
                          },
                        })
                      }
                      options={[
                        { value: "subtle", label: "Subtle" },
                        { value: "medium", label: "Medium" },
                      ]}
                      placeholder="Intensity"
                      value={selectedClip.kenBurns.intensity}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            {!selectedClipIsLast ? (
              <div className="grid gap-2">
                <span className="text-[0.76rem] font-[760] text-[var(--color-ink-muted)]">
                  Transition to next clip
                </span>
                <CustomSelect
                  onChange={(value) =>
                    onUpdateSelectedClip({
                      transitionToNext: value === "cut"
                        ? undefined
                        : {
                            type: value as ClipTransitionType,
                            durationSeconds: value === "whip"
                              ? 0.3
                              : selectedClip.transitionToNext?.durationSeconds ?? 0.5,
                          },
                    })
                  }
                  options={transitionOptions}
                  placeholder="Transition"
                  value={selectedClip.transitionToNext?.type ?? "cut"}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] p-3 text-[0.78rem] font-[700] text-[var(--color-ink-muted)]">
            Select a timeline visual to trim it.
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[0.9rem] font-[820] text-[var(--color-ink)]">Text</h3>
          <button
            aria-label="Add text overlay"
            className="grid size-8 place-items-center rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
            onClick={onAddTextOverlay}
            type="button"
          >
            <Plus size={15} />
          </button>
        </div>
        {textOverlays.length > 0 ? (
          <CustomSelect
            onChange={onSelectText}
            options={textOverlays.map((overlay, index) => ({
              value: overlay.id ?? String(index),
              label: overlay.text?.trim() || `Text ${index + 1}`,
              meta: `${formatTimelineTime(overlay.startSeconds)} start`,
            }))}
            placeholder="Choose text"
            value={selectedText?.id ?? ""}
          />
        ) : null}
        {selectedText ? (
          <div className="grid gap-3 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] p-3">
            <label className="grid gap-1 text-[0.76rem] font-[760] text-[var(--color-ink-muted)]">
              <span>Copy</span>
              <input
                className="min-h-9 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[0.82rem] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
                onChange={(event) => onUpdateSelectedText({ text: event.target.value, items: [] })}
                value={selectedText.text ?? ""}
              />
            </label>
            <CustomSelect
              onChange={(value) =>
                onUpdateSelectedText(
                  applyTextStylePreset(selectedText, value as TextStylePreset) as TimedTextOverlay
                )
              }
              options={[
                { value: "outline", label: "Outline" },
                { value: "white", label: "White text" },
                { value: "black", label: "Black text" },
                { value: "yellow", label: "Yellow text" },
                { value: "white_background", label: "White background" },
                { value: "white_50_background", label: "White 50% background" },
              ]}
              placeholder="Style"
              value={textStylePresetForBlock(selectedText)}
            />
            <div className="flex min-h-10 items-center gap-1 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
              <button
                aria-label="Align left"
                className="grid size-8 place-items-center rounded-[0.35rem] text-[var(--color-ink-muted)] hover:bg-[var(--color-page-quiet)] hover:text-[var(--color-ink)]"
                onClick={() => onUpdateSelectedText({ align: "left" })}
                type="button"
              >
                <AlignLeft size={15} />
              </button>
              <button
                aria-label="Align center"
                className="grid size-8 place-items-center rounded-[0.35rem] text-[var(--color-ink-muted)] hover:bg-[var(--color-page-quiet)] hover:text-[var(--color-ink)]"
                onClick={() => onUpdateSelectedText({ align: "center" })}
                type="button"
              >
                <AlignCenter size={15} />
              </button>
              <button
                aria-label="Align right"
                className="grid size-8 place-items-center rounded-[0.35rem] text-[var(--color-ink-muted)] hover:bg-[var(--color-page-quiet)] hover:text-[var(--color-ink)]"
                onClick={() => onUpdateSelectedText({ align: "right" })}
                type="button"
              >
                <AlignRight size={15} />
              </button>
              <button
                aria-label="Delete text overlay"
                className="ml-auto grid size-8 place-items-center rounded-[0.35rem] text-[var(--color-danger)] hover:bg-[var(--color-page-quiet)]"
                onClick={onRemoveSelectedText}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <SliderControl
                label="Start"
                max={Math.max(durationSeconds, 0.1)}
                min={0}
                onChange={(startSeconds) =>
                  onUpdateSelectedText({
                    startSeconds: Math.min(
                      startSeconds,
                      (selectedText.endSeconds ?? durationSeconds) - 0.1
                    ),
                  })
                }
                suffix="s"
                value={selectedText.startSeconds ?? 0}
              />
              <SliderControl
                label="End"
                max={Math.max(durationSeconds, 0.1)}
                min={Math.min(durationSeconds, (selectedText.startSeconds ?? 0) + 0.1)}
                onChange={(endSeconds) =>
                  onUpdateSelectedText({
                    endSeconds: Math.max(endSeconds, (selectedText.startSeconds ?? 0) + 0.1),
                  })
                }
                suffix="s"
                value={selectedText.endSeconds ?? durationSeconds}
              />
              <SliderControl label="X" max={88} min={0} onChange={(x) => onUpdateSelectedText({ x })} suffix="%" value={selectedText.x ?? 10} />
              <SliderControl label="Y" max={92} min={0} onChange={(y) => onUpdateSelectedText({ y })} suffix="%" value={selectedText.y ?? 42} />
              <SliderControl label="Width" max={100} min={12} onChange={(width) => onUpdateSelectedText({ width })} suffix="%" value={selectedText.width ?? 80} />
              <SliderControl label="Size" max={150} min={20} onChange={(fontSize) => onUpdateSelectedText({ fontSize })} suffix="px" value={selectedText.fontSize ?? 72} />
            </div>
          </div>
        ) : null}
      </div>

      {audioTracks.length > 0 ? (
        <div className="grid gap-2 border-t border-[var(--color-border)] pt-4">
          <h3 className="m-0 text-[0.9rem] font-[820] text-[var(--color-ink)]">Audio</h3>
          {audioTracks.map((track) => {
            const role = audioTrackRole(track);
            return (
              <div
                className="grid gap-2 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] p-3"
                key={track.id}
              >
                <p className="m-0 text-[0.8rem] font-[780] leading-tight text-[var(--color-ink)] [overflow-wrap:anywhere]">
                  {track.title}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <CustomSelect
                    onChange={(value) =>
                      onUpdateAudioTrack(track.id, {
                        role: value as AudioTrackRole,
                        ducking: value === "music"
                          ? track.ducking ?? { enabled: true, duckVolume: DEFAULT_DUCK_VOLUME }
                          : track.ducking,
                      })
                    }
                    options={[
                      { value: "voiceover", label: "Voiceover" },
                      { value: "music", label: "Music" },
                      { value: "sfx", label: "Sound effect" },
                    ]}
                    placeholder="Role"
                    value={role}
                  />
                  {role !== "voiceover" ? (
                    <label className="flex items-center gap-2 text-[0.74rem] font-[760] text-[var(--color-ink-muted)]">
                      <input
                        checked={track.ducking?.enabled === true}
                        onChange={(event) =>
                          onUpdateAudioTrack(track.id, {
                            ducking: event.target.checked
                              ? { enabled: true, duckVolume: track.ducking?.duckVolume ?? DEFAULT_DUCK_VOLUME }
                              : undefined,
                          })
                        }
                        type="checkbox"
                      />
                      Duck under voiceover
                    </label>
                  ) : null}
                </div>
                <SliderControl
                  label="Volume"
                  max={100}
                  min={0}
                  onChange={(volume) => onUpdateAudioTrack(track.id, { volume: volume / 100 })}
                  suffix="%"
                  value={Math.round((track.volume ?? 1) * 100)}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-2 border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[0.9rem] font-[820] text-[var(--color-ink)]">Captions</h3>
          {captions ? (
            <button
              aria-label="Remove captions"
              className="grid size-8 place-items-center rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-danger)] transition hover:border-[var(--color-danger)]"
              onClick={() => onUpdateCaptions(undefined)}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
        {!captions ? (
          <div className="rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] p-3 text-[0.78rem] font-[700] text-[var(--color-ink-muted)]">
            No captions. Ask the agent to caption this video from its voiceover script.
          </div>
        ) : (
          <div className="grid gap-3 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-page)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <CustomSelect
                onChange={(value) =>
                  onUpdateCaptions({
                    ...captions,
                    stylePreset: value as CompositionCaptions["stylePreset"],
                  })
                }
                options={captionPresetOptions}
                placeholder="Style"
                value={captions.stylePreset}
              />
              <CustomSelect
                onChange={(value) =>
                  onUpdateCaptions({
                    ...captions,
                    zone: value === "center" ? "center" : "bottom",
                  })
                }
                options={[
                  { value: "bottom", label: "Bottom" },
                  { value: "center", label: "Center" },
                ]}
                placeholder="Zone"
                value={captions.zone}
              />
            </div>
            <div className="grid max-h-56 gap-2 overflow-y-auto">
              {captions.segments.map((segment) => (
                <div className="grid gap-1" key={segment.id}>
                  <div className="flex items-center gap-2">
                    <input
                      className="min-h-8 flex-1 rounded-[0.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[0.78rem] text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)]"
                      onChange={(event) =>
                        onUpdateCaptions({
                          ...captions,
                          segments: captions.segments.map((item) =>
                            item.id === segment.id
                              ? { ...item, text: event.target.value, words: undefined }
                              : item
                          ),
                        })
                      }
                      value={segment.text}
                    />
                    <button
                      aria-label="Remove caption segment"
                      className="grid size-7 place-items-center rounded-[0.35rem] text-[var(--color-danger)] hover:bg-[var(--color-page-quiet)]"
                      onClick={() =>
                        onUpdateCaptions({
                          ...captions,
                          segments: captions.segments.filter((item) => item.id !== segment.id),
                        })
                      }
                      type="button"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <span className="text-[0.68rem] font-[700] text-[var(--color-ink-muted)]">
                    {formatTimelineTime(segment.startSeconds, 1)} - {formatTimelineTime(segment.endSeconds, 1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

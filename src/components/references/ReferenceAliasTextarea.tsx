import { useMemo, useState } from "react";
import { AssetListItem } from "../../features/assets/AssetListItem";
import { AssetPreviewModal } from "../../features/assets/AssetPreviewModal";
import type { AssetPreviewItem } from "../../features/assets/assetTypes";
import { RichMentionTextarea } from "./RichMentionTextarea";

export type ReferenceMentionOption = {
  alias: string;
  title?: string;
  kind?: string;
  mimeType?: string;
  storageUrl?: string;
};

type ReferenceAliasTextareaProps = {
  className?: string;
  helperText?: string;
  label: string;
  onChange: (value: string) => void;
  options?: ReferenceMentionOption[];
  required?: boolean;
  textareaClassName?: string;
  value: string;
};

const fieldShellClass = "grid min-w-0 gap-[var(--space-2)]";
const fieldLabelClass = "text-[0.74rem] font-[780] text-[var(--color-ink-soft)]";
const helperTextClass = "text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]";

function uniqueOptions(options: ReferenceMentionOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const alias = option.alias.trim();
    if (!alias || seen.has(alias.toLowerCase())) return false;
    seen.add(alias.toLowerCase());
    return true;
  });
}

function optionMatchesQuery(option: ReferenceMentionOption, query: string) {
  if (!query) return true;
  return [option.alias, option.title, option.kind]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(query));
}

function assetForOption(option: ReferenceMentionOption): AssetPreviewItem {
  return {
    id: option.alias,
    title: option.title || option.alias,
    storageUrl: option.storageUrl,
    mimeType: option.mimeType,
    mediaKind: option.kind,
  };
}

export function ReferenceAliasTextarea({
  className,
  helperText,
  label,
  onChange,
  options = [],
  required = false,
  textareaClassName,
  value,
}: ReferenceAliasTextareaProps) {
  const [previewAsset, setPreviewAsset] = useState<AssetPreviewItem | null>(null);
  const mentionOptions = useMemo(() => uniqueOptions(options), [options]);
  const inlineMentionTokens = useMemo(
    () =>
      mentionOptions.map((option) => ({
        token: option.alias,
        asset: assetForOption(option),
        meta: [option.alias, option.kind].filter(Boolean).join(" · "),
      })),
    [mentionOptions]
  );
  const emptyMentionHint = mentionOptions.length
    ? "No matching attached references."
    : "Add reference media below to mention it in your prompt.";

  return (
    <div className={`${fieldShellClass}${className ? ` ${className}` : ""}`}>
      <span className={fieldLabelClass}>
        {label}
        {required ? " *" : ""}
      </span>
      <RichMentionTextarea
        assetForOption={assetForOption}
        className={`${textareaClassName ?? ""} whitespace-pre-wrap break-words`}
        emptyHint={emptyMentionHint}
        getReplacement={(option) => option.alias}
        metaForOption={(option) => [option.alias, option.kind].filter(Boolean).join(" · ")}
        onChange={onChange}
        optionKey={(option) => option.alias}
        optionMatchesQuery={optionMatchesQuery}
        options={mentionOptions}
        renderOption={({ active, option, select }) => (
          <AssetListItem
            active={active}
            asset={assetForOption(option)}
            meta={[option.alias, option.kind].filter(Boolean).join(" · ")}
            onPreview={setPreviewAsset}
            onSelect={select}
          />
        )}
        showEmptyHint
        tokens={inlineMentionTokens}
        triggerChars={["@", "#"]}
        value={value}
      />
      <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      {helperText ? <small className={helperTextClass}>{helperText}</small> : null}
    </div>
  );
}

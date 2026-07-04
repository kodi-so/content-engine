import { useAction, useMutation, useQuery } from "convex/react";
import { CalendarClock, Check, Save, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LoadingSignal } from "../../components/ui";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { blobToDataUrl } from "../../lib/browser/dataUrl";
import { DEFAULT_PUBLISHING_PROVIDER } from "../../lib/publishingRouting";
import { renderSlideshowToBlobs } from "../../lib/slideshowCanvas";
import { PLATFORM_LABELS, type SocialAccount } from "../accounts/accountDisplay";
import type {
  CanonicalSlideshowSpec,
  Platform,
  SlideshowDoc,
} from "../../types";
import {
  PLATFORM_CONFIG_FIELDS,
  PLATFORM_CONFIG_LABELS,
  buildPlatformConfigurations,
  postBridgePlatformKey,
  type PlatformConfigsState,
  type PostBridgePlatformKey,
} from "./platformConfigs";
import type { PostComposerMedia, PostMediaItem } from "./postMedia";

const CAPTION_LIMIT = 2200;

type PostMode = "draft" | "schedule" | "now";

function activeSlides(spec: CanonicalSlideshowSpec) {
  return [...(spec.slides ?? [])]
    .filter((slide) => slide.status !== "deleted")
    .sort((first, second) => first.index - second.index);
}

function defaultScheduleValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ToggleSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={[
        "relative h-6 w-11 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-page-quiet)]",
      ].join(" ")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={[
          "absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-[var(--shadow-sm)] transition-all",
          checked ? "left-[calc(100%-1.25rem)]" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}

function AccountChip({
  account,
  disabled,
  onToggle,
  selected,
}: {
  account: SocialAccount;
  disabled?: boolean;
  onToggle: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={[
        "flex min-w-0 items-center gap-[var(--space-2)] rounded-full border py-1 pl-1 pr-[var(--space-3)] text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-accent-soft,var(--color-page-quiet))] ring-2 ring-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]",
      ].join(" ")}
      disabled={disabled}
      onClick={onToggle}
      title={`${PLATFORM_LABELS[account.platform]} · @${account.username}`}
      type="button"
    >
      <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-page-quiet)] text-[0.72rem] font-[820] uppercase text-[var(--color-ink-soft)]">
        {account.avatarUrl ? (
          <img alt="" className="size-full object-cover" src={account.avatarUrl} />
        ) : (
          account.username.slice(0, 2)
        )}
        {selected ? (
          <span className="absolute inset-0 grid place-items-center bg-[oklch(8%_0.018_220_/_0.45)] text-white">
            <Check size={14} strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-[0.8rem] font-[760] text-[var(--color-ink)]">
          @{account.username}
        </span>
        <span className="truncate text-[0.68rem] font-[700] text-[var(--color-ink-muted)]">
          {PLATFORM_LABELS[account.platform]}
        </span>
      </span>
    </button>
  );
}

function MediaHero({ media }: { media: PostComposerMedia }) {
  if (media.kind === "video") {
    return (
      <div className="grid place-items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page-quiet)] p-[var(--space-2)]">
        <video
          className="max-h-[19rem] w-auto max-w-full rounded-[var(--radius-sm)]"
          controls
          playsInline
          preload="metadata"
          src={media.item.storageUrl}
        />
      </div>
    );
  }

  return <SlideshowHero slideshow={media.slideshow} />;
}

function SlideshowHero({ slideshow }: { slideshow: SlideshowDoc }) {
  const spec = slideshow.spec as CanonicalSlideshowSpec;
  const slideCount = activeSlides(spec).length;
  const [previewUrls, setPreviewUrls] = useState<string[] | null>(null);
  const [previewError, setPreviewError] = useState("");

  // Render previews through the same canvas pipeline used when posting, so
  // the strip shows exactly what gets published (all text blocks included).
  useEffect(() => {
    let canceled = false;
    let urls: string[] = [];
    setPreviewUrls(null);
    setPreviewError("");

    renderSlideshowToBlobs(slideshow.spec as CanonicalSlideshowSpec, {
      mimeType: "image/webp",
      quality: 0.85,
    })
      .then((blobs) => {
        if (canceled) return;
        urls = blobs.map((blob) => URL.createObjectURL(blob));
        setPreviewUrls(urls);
      })
      .catch((renderError: unknown) => {
        if (canceled) return;
        setPreviewError(
          renderError instanceof Error
            ? renderError.message
            : "Could not render slide previews"
        );
      });

    return () => {
      canceled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [slideshow]);

  return (
    <div className="grid gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page-quiet)] p-[var(--space-2)]">
      {previewError ? (
        <p className="m-0 px-1 py-[var(--space-4)] text-center text-[0.82rem] text-[var(--color-ink-muted)]">
          {previewError}
        </p>
      ) : previewUrls === null ? (
        <div className="grid min-h-[13rem] place-items-center">
          <LoadingSignal label="Rendering slide previews" size="sm" />
        </div>
      ) : (
        <div className="flex gap-[var(--space-2)] overflow-x-auto pb-1">
          {previewUrls.map((url, index) => (
            <img
              alt={`Slide ${index + 1}`}
              className="h-[13rem] w-auto shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[#111513]"
              key={url}
              src={url}
            />
          ))}
        </div>
      )}
      <p className="m-0 text-[0.74rem] font-[700] text-[var(--color-ink-muted)]">
        {slideCount} slide{slideCount === 1 ? "" : "s"} · rendered as images when posting
      </p>
    </div>
  );
}

export function PostComposerModal({
  media,
  onClose,
}: {
  media: PostComposerMedia;
  onClose: () => void;
}) {
  const { activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const createPlan = useMutation(api.publishing.composer.createPlanFromMedia);
  const publishPlan = useAction(api.publishing.distributionPlans.publish);
  const uploadMedia = useAction(api.storage.files.uploadBase64ImageWithMetadata);

  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
    () => new Set()
  );
  const [caption, setCaption] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleValue, setScheduleValue] = useState(defaultScheduleValue);
  const [configState, setConfigState] = useState<PlatformConfigsState>({});
  const [pendingMode, setPendingMode] = useState<PostMode | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingMode) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pendingMode]);

  const postableAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (account) =>
          account.provider === DEFAULT_PUBLISHING_PROVIDER &&
          account.status === "connected"
      ),
    [accounts]
  );

  const selectedAccounts = useMemo(
    () =>
      postableAccounts.filter((account) =>
        selectedAccountIds.has(String(account._id))
      ),
    [postableAccounts, selectedAccountIds]
  );
  const selectedPlatforms = useMemo(
    () => Array.from(new Set(selectedAccounts.map((account) => account.platform))),
    [selectedAccounts]
  );
  const configurablePlatformKeys = useMemo(() => {
    const keys: PostBridgePlatformKey[] = [];
    for (const platform of selectedPlatforms) {
      const key = postBridgePlatformKey(platform as Platform);
      if (key && !keys.includes(key) && PLATFORM_CONFIG_FIELDS[key].length > 0) {
        keys.push(key);
      }
    }
    return keys;
  }, [selectedPlatforms]);

  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const setConfigValue = (
    platformKey: PostBridgePlatformKey,
    fieldKey: string,
    value: boolean | string
  ) => {
    setConfigState((current) => ({
      ...current,
      [platformKey]: { ...current[platformKey], [fieldKey]: value },
    }));
  };

  const mediaItemsForPost = async (): Promise<PostMediaItem[]> => {
    if (media.kind === "video") return [media.item];

    const spec = media.slideshow.spec as CanonicalSlideshowSpec;
    if (activeSlides(spec).length === 0) {
      throw new Error("This slideshow has no slides to post");
    }

    setStatus("Rendering slides...");
    const blobs = await renderSlideshowToBlobs(spec, { mimeType: "image/png" });

    setStatus("Uploading slides...");
    const uploads = await Promise.all(
      blobs.map(async (blob, index) =>
        uploadMedia({
          base64Data: await blobToDataUrl(blob),
          filename: `${media.title || "slide"}-${index + 1}.png`,
        })
      )
    );

    return uploads.map((upload, index) => ({
      storageUrl: upload.storageUrl,
      mimeType: upload.mimeType,
      kind: "image" as const,
      title: `${media.title} slide ${index + 1}`,
    }));
  };

  const submit = async (mode: PostMode) => {
    setError("");
    if (selectedAccounts.length === 0) {
      setError("Select at least one account to post to.");
      return;
    }

    let scheduledFor: number | undefined;
    if (mode === "schedule") {
      scheduledFor = scheduleValue ? new Date(scheduleValue).getTime() : Number.NaN;
      if (!Number.isFinite(scheduledFor)) {
        setError("Pick a valid date and time for the scheduled post.");
        return;
      }
      if (scheduledFor <= Date.now()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }

    setPendingMode(mode);
    setStatus("");
    try {
      const items = await mediaItemsForPost();

      setStatus(mode === "draft" ? "Saving draft..." : "Creating post...");
      const planId: Id<"distributionPlans"> = await createPlan({
        ...(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
        socialAccountIds: selectedAccounts.map((account) => account._id),
        media: items,
        caption: caption.trim(),
        scheduledFor,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platformConfigurations: buildPlatformConfigurations(
          configState,
          selectedPlatforms as Platform[]
        ),
        source: media.kind === "slideshow" ? "slideshow" : "post_composer",
      });

      if (mode !== "draft") {
        setStatus(mode === "schedule" ? "Scheduling post..." : "Publishing post...");
        await publishPlan({ id: planId, mode });
      }

      setStatus("");
      setCompleted(
        mode === "draft"
          ? "Saved to drafts. Publish it anytime from your distribution plans."
          : mode === "schedule"
            ? "Post scheduled."
            : "Post sent. It may take a moment to appear on each platform."
      );
    } catch (submitError) {
      setStatus("");
      setError(
        submitError instanceof Error ? submitError.message : "Posting failed"
      );
    } finally {
      setPendingMode(null);
    }
  };

  const busy = pendingMode !== null;

  // Portal keeps the fixed overlay viewport-relative even when the trigger
  // sits inside a transformed ancestor (e.g. cards with hover translate).
  return createPortal(
    <div
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/35 p-[var(--space-4)] backdrop-blur-[2px]"
      role="dialog"
      aria-label={`Post ${media.title}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="grid max-h-[calc(100vh-3rem)] w-[min(100%,52rem)] content-start gap-[var(--space-4)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] shadow-[var(--shadow-lg)]">
        <header className="flex items-start justify-between gap-[var(--space-4)]">
          <div className="grid min-w-0 gap-1">
            <p className="entity-eyebrow m-0">
              {media.kind === "slideshow" ? "Slideshow" : "Video"}
            </p>
            <h2 className="m-0 text-[1.1rem] font-[780] leading-tight text-[var(--color-ink)]">
              Post {media.title}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        {completed ? (
          <div className="grid gap-[var(--space-3)]">
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[0.88rem] leading-relaxed text-emerald-950">
              <Check className="mt-0.5 shrink-0" size={16} />
              <span>{completed}</span>
            </div>
            <button className="primary-button w-fit" onClick={onClose} type="button">
              Done
            </button>
          </div>
        ) : (
          <>
            <section className="grid gap-[var(--space-2)]">
              <span className="text-[0.78rem] font-[760] text-[var(--color-ink-soft)]">
                Accounts
              </span>
              {accounts === undefined ? (
                <LoadingSignal label="Loading accounts" size="sm" />
              ) : postableAccounts.length === 0 ? (
                <p className="m-0 text-[0.84rem] leading-[1.5] text-[var(--color-ink-muted)]">
                  No connected accounts available for publishing. Sync your
                  PostBridge accounts from the Accounts page first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-[var(--space-2)]">
                  {postableAccounts.map((account) => (
                    <AccountChip
                      account={account}
                      disabled={busy}
                      key={account._id}
                      onToggle={() => toggleAccount(String(account._id))}
                      selected={selectedAccountIds.has(String(account._id))}
                    />
                  ))}
                </div>
              )}
            </section>

            <MediaHero media={media} />

            <section className="grid gap-[var(--space-2)]">
              <span className="text-[0.78rem] font-[760] text-[var(--color-ink-soft)]">
                Caption
              </span>
              <div className="grid gap-1">
                <textarea
                  className="min-h-[6.5rem] w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)] py-[var(--space-2)] text-[0.9rem] leading-[1.5] text-[var(--color-ink)] outline-none transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.13)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy}
                  maxLength={CAPTION_LIMIT}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Start writing your post here..."
                  value={caption}
                />
                <span className="justify-self-end text-[0.72rem] font-[700] text-[var(--color-ink-muted)]">
                  {caption.length}/{CAPTION_LIMIT}
                </span>
              </div>
            </section>

            {configurablePlatformKeys.length > 0 ? (
              <section className="grid gap-[var(--space-2)]">
                <span className="text-[0.78rem] font-[760] text-[var(--color-ink-soft)]">
                  Platform options
                </span>
                <div className="grid gap-[var(--space-2)]">
                  {configurablePlatformKeys.map((platformKey) => (
                    <details
                      className="group rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)]"
                      key={platformKey}
                    >
                      <summary className="cursor-pointer list-none px-[var(--space-3)] py-[var(--space-2)] text-[0.84rem] font-[780] text-[var(--color-ink)] marker:hidden">
                        {PLATFORM_CONFIG_LABELS[platformKey]} settings
                      </summary>
                      <div className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-3)]">
                        {PLATFORM_CONFIG_FIELDS[platformKey]
                          .filter((field) => !field.videoOnly || media.kind === "video")
                          .map((field) => {
                            const value = configState[platformKey]?.[field.key];
                            if (field.type === "toggle") {
                              return (
                                <div
                                  className="flex items-start justify-between gap-[var(--space-4)]"
                                  key={field.key}
                                >
                                  <div className="grid min-w-0 gap-1">
                                    <span className="text-[0.84rem] font-[760] text-[var(--color-ink)]">
                                      {field.label}
                                    </span>
                                    {field.description ? (
                                      <span className="text-[0.76rem] leading-[1.45] text-[var(--color-ink-muted)]">
                                        {field.description}
                                      </span>
                                    ) : null}
                                  </div>
                                  <ToggleSwitch
                                    checked={value === true}
                                    disabled={busy}
                                    label={field.label}
                                    onChange={(checked) =>
                                      setConfigValue(platformKey, field.key, checked)
                                    }
                                  />
                                </div>
                              );
                            }
                            if (field.type === "select") {
                              return (
                                <label className="grid gap-1" key={field.key}>
                                  <span className="text-[0.8rem] font-[760] text-[var(--color-ink)]">
                                    {field.label}
                                  </span>
                                  {field.description ? (
                                    <span className="text-[0.76rem] leading-[1.45] text-[var(--color-ink-muted)]">
                                      {field.description}
                                    </span>
                                  ) : null}
                                  <select
                                    className="w-full max-w-[16rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2)] py-[0.4rem] text-[0.84rem] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                                    disabled={busy}
                                    onChange={(event) =>
                                      setConfigValue(platformKey, field.key, event.target.value)
                                    }
                                    value={typeof value === "string" ? value : ""}
                                  >
                                    {field.options?.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              );
                            }
                            return (
                              <label className="grid gap-1" key={field.key}>
                                <span className="text-[0.8rem] font-[760] text-[var(--color-ink)]">
                                  {field.label}
                                </span>
                                {field.description ? (
                                  <span className="text-[0.76rem] leading-[1.45] text-[var(--color-ink-muted)]">
                                    {field.description}
                                  </span>
                                ) : null}
                                <input
                                  className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2)] py-[0.4rem] text-[0.84rem] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                                  disabled={busy}
                                  onChange={(event) =>
                                    setConfigValue(platformKey, field.key, event.target.value)
                                  }
                                  placeholder={field.placeholder}
                                  type="text"
                                  value={typeof value === "string" ? value : ""}
                                />
                              </label>
                            );
                          })}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="grid gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] p-[var(--space-3)]">
              <div className="flex items-center justify-between gap-[var(--space-4)]">
                <div className="grid gap-1">
                  <span className="text-[0.84rem] font-[780] text-[var(--color-ink)]">
                    Schedule post
                  </span>
                  <span className="text-[0.76rem] text-[var(--color-ink-muted)]">
                    Pick a future time instead of posting right away.
                  </span>
                </div>
                <ToggleSwitch
                  checked={isScheduling}
                  disabled={busy}
                  label="Schedule post"
                  onChange={setIsScheduling}
                />
              </div>
              {isScheduling ? (
                <input
                  aria-label="Scheduled time"
                  className="w-fit rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-2)] py-[0.4rem] text-[0.84rem] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                  disabled={busy}
                  onChange={(event) => setScheduleValue(event.target.value)}
                  type="datetime-local"
                  value={scheduleValue}
                />
              ) : null}
            </section>

            {error ? (
              <p className="m-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[0.84rem] leading-relaxed text-amber-950" role="alert">
                {error}
              </p>
            ) : null}
            {status ? (
              <p className="m-0 text-[0.82rem] font-[650] text-[var(--color-ink-muted)]" role="status">
                {status}
              </p>
            ) : null}

            <footer className="flex flex-wrap items-center justify-end gap-[var(--space-2)]">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void submit("draft")}
                type="button"
              >
                {pendingMode === "draft" ? (
                  <LoadingSignal label="Saving" size="sm" />
                ) : (
                  <Save size={16} />
                )}
                Save to Drafts
              </button>
              <button
                className="primary-button"
                disabled={busy || postableAccounts.length === 0}
                onClick={() => void submit(isScheduling ? "schedule" : "now")}
                type="button"
              >
                {pendingMode === "schedule" || pendingMode === "now" ? (
                  <LoadingSignal label="Posting" size="sm" />
                ) : isScheduling ? (
                  <CalendarClock size={16} />
                ) : (
                  <Send size={16} />
                )}
                {isScheduling ? "Schedule post" : "Post now"}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

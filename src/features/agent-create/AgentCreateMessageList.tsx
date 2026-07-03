import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { MediaLightbox, type MediaLightboxItem } from "../../components/MediaLightbox";
import { AssetMentionChip } from "../assets/AssetMentionChip";
import { AgentCreateArtifactGrid } from "./AgentCreateArtifactCard";
import { isInlineSlideshowArtifact } from "./AgentCreateSlideshowArtifact";
import type {
  AgentCreateArtifact,
  AgentCreateMessage,
  AgentCreateToolProgressStep,
} from "./agentCreateTypes";
import {
  agentCreateClassNames,
  formatAgentCreateEntityType,
} from "./agentCreateUi";
import { ToolProgressTimeline } from "./ToolProgressTimeline";

function TypewriterText({ animate, text }: { animate: boolean; text: string }) {
  const [visibleLength, setVisibleLength] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) {
      setVisibleLength(text.length);
      return;
    }

    setVisibleLength(0);
    const step = Math.max(2, Math.ceil(text.length / 80));
    const interval = window.setInterval(() => {
      setVisibleLength((current) => {
        const next = Math.min(text.length, current + step);
        if (next >= text.length) window.clearInterval(interval);
        return next;
      });
    }, 14);

    return () => window.clearInterval(interval);
  }, [animate, text]);

  return <>{text.slice(0, visibleLength)}</>;
}

function visibleChatArtifacts(artifacts: AgentCreateArtifact[] = []) {
  return artifacts.filter((artifact) =>
    artifact.status !== "generating" &&
    artifact.status !== "placeholder" &&
    artifact.status !== "failed" &&
    !(artifact.kind === "document" && artifact.text?.trim())
  );
}

function formatWorkDuration(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function workDurationForSteps(
  steps: AgentCreateToolProgressStep[],
  nowMs: number,
  isWorking: boolean,
  startedAt?: number
) {
  const timestamps = [
    startedAt,
    ...steps.flatMap((step) => [
      step.startedAt,
      step.createdAt,
    ]),
  ].filter((value): value is number => typeof value === "number");
  if (!timestamps.length) return undefined;

  const start = Math.min(...timestamps);
  const completedTimes = steps
    .map((step) => step.completedAt)
    .filter((value): value is number => typeof value === "number");
  const end = isWorking || !completedTimes.length ? nowMs : Math.max(...completedTimes);
  return Math.max(0, end - start);
}

function activeWorkStep(steps: AgentCreateToolProgressStep[]) {
  return steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "queued") ??
    steps.find((step) => step.status === "blocked");
}

function lightboxMediaForArtifact(artifact: AgentCreateArtifact): MediaLightboxItem | null {
  const src = artifact.url ?? artifact.thumbnailUrl;
  if (!src || (artifact.kind !== "image" && artifact.kind !== "video")) return null;
  return {
    kind: artifact.kind,
    src,
    title: artifact.title,
    meta: [artifact.modelLabel, artifact.mimeType].filter(Boolean).join(" · "),
  };
}

function AgentMessageWorkLog({
  defaultOpen = false,
  isWorking,
  onArtifactOpen,
  startedAt,
  steps = [],
}: {
  defaultOpen?: boolean;
  isWorking: boolean;
  onArtifactOpen?: (artifact: AgentCreateArtifact) => void;
  startedAt?: number;
  steps?: AgentCreateToolProgressStep[];
}) {
  const [nowMs, setNowMs] = useState(Date.now());
  const [isOpen, setIsOpen] = useState(isWorking || defaultOpen);
  const [lightboxMedia, setLightboxMedia] = useState<MediaLightboxItem | null>(null);

  useEffect(() => {
    if (!isWorking) {
      setNowMs(Date.now());
      return;
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isWorking]);

  useEffect(() => {
    setIsOpen(isWorking || defaultOpen);
  }, [defaultOpen, isWorking]);

  if (!isWorking && !steps.length) return null;

  const duration = workDurationForSteps(steps, nowMs, isWorking, startedAt);
  const label = isWorking
    ? duration !== undefined
      ? `Working for ${formatWorkDuration(duration)}`
      : "Working"
    : duration !== undefined
      ? `Worked for ${formatWorkDuration(duration)}`
      : "Worked";
  const activeStep = activeWorkStep(steps);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (isWorking) {
      setIsOpen(true);
      return;
    }
    setIsOpen(event.currentTarget.open);
  };

  return (
    <>
      <details
        className="group grid min-w-0 justify-items-start border-b border-[var(--color-border)] pb-[var(--space-3)]"
        onToggle={handleToggle}
        open={isOpen}
      >
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[0.78rem] font-[720] text-[var(--color-ink-muted)] marker:hidden">
          <span>{label}</span>
          {isWorking ? (
            <span className="ml-1 flex items-center gap-1" aria-hidden="true">
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)] [animation-delay:120ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)] [animation-delay:240ms]" />
            </span>
          ) : null}
          <ChevronRight
            className="transition-transform group-open:rotate-90"
            size={14}
          />
        </summary>
        <div className="mt-[var(--space-3)] grid w-full max-w-[min(44rem,100%)] gap-[var(--space-3)]">
          {isWorking && activeStep ? (
            <p className="m-0 text-[0.8rem] leading-[1.45] text-[var(--color-ink-muted)]">
              Currently: <span className="font-[760] text-[var(--color-ink-soft)]">{activeStep.label}</span>
            </p>
          ) : null}
          {steps.length ? (
            <ToolProgressTimeline
              className="text-[0.82rem]"
              onArtifactOpen={onArtifactOpen}
              onArtifactPreview={(artifact) => {
                const media = lightboxMediaForArtifact(artifact);
                if (media) setLightboxMedia(media);
              }}
              steps={steps}
              title="Work log"
            />
          ) : (
            <p className="m-0 text-[0.82rem] text-[var(--color-ink-muted)]">Preparing the next step.</p>
          )}
        </div>
      </details>
      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />
    </>
  );
}

function ThinkingMessage({
  step,
}: {
  step?: AgentCreateToolProgressStep;
}) {
  if (step) {
    return (
      <article className="grid min-w-0 justify-items-start">
        <div className="grid w-full max-w-[min(48rem,100%)] min-w-0 gap-[var(--space-3)]">
          <AgentMessageWorkLog
            defaultOpen
            isWorking
            startedAt={step.createdAt}
            steps={[step]}
          />
        </div>
      </article>
    );
  }

  return (
    <article className="grid min-w-0 justify-items-start">
      <div className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--color-page-quiet)] px-[var(--space-3)] text-[0.88rem] font-[690] text-[var(--color-ink-muted)]">
        <span className="animate-pulse">Thinking</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)] [animation-delay:120ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)] [animation-delay:240ms]" />
        </span>
      </div>
    </article>
  );
}

function stripRedundantPlan(content: string) {
  return content
    .replace(/\n+Plan:\s*\n(?:\d+\.\s.*(?:\n|$))+/i, "")
    .trim();
}

export function AgentCreateMessageList({
  className,
  emptyLabel = "Start with a brief and the agent will build from there.",
  isLoading = false,
  messages,
  onArtifactDownload,
  onArtifactOpen,
  onArtifactOpenStudio,
  onArtifactSave,
  activeThinkingStep,
  showThinkingPlaceholder = false,
  workingMessageId,
  threadKey,
}: {
  className?: string;
  emptyLabel?: string;
  isLoading?: boolean;
  messages: AgentCreateMessage[];
  onArtifactDownload?: (artifact: AgentCreateArtifact) => void;
  onArtifactOpen?: (artifact: AgentCreateArtifact) => void;
  onArtifactOpenStudio?: (artifact: AgentCreateArtifact) => void;
  onArtifactSave?: (artifact: AgentCreateArtifact) => void;
  activeThinkingStep?: AgentCreateToolProgressStep;
  showThinkingPlaceholder?: boolean;
  workingMessageId?: string;
  threadKey?: string | null;
}) {
  const initializedRef = useRef(false);
  const previousMessageIdsRef = useRef<Set<string>>(new Set());
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(new Set());
  const [lightboxMedia, setLightboxMedia] = useState<MediaLightboxItem | null>(null);

  useEffect(() => {
    initializedRef.current = false;
    previousMessageIdsRef.current = new Set();
    setAnimatedMessageIds(new Set());
  }, [threadKey]);

  useEffect(() => {
    if (isLoading) return;

    const nextIds = new Set(messages.map((message) => message.id));
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousMessageIdsRef.current = nextIds;
      return;
    }

    const newAgentMessageIds = messages
      .filter((message) => message.role !== "user" && !previousMessageIdsRef.current.has(message.id))
      .map((message) => message.id);
    previousMessageIdsRef.current = nextIds;
    if (!newAgentMessageIds.length) return;

    setAnimatedMessageIds((current) => new Set([...current, ...newAgentMessageIds]));
  }, [isLoading, messages]);

  if (!messages.length && !showThinkingPlaceholder) {
    return (
      <div
        className={agentCreateClassNames(
          "grid min-h-[18rem] place-items-center px-[var(--space-4)] py-[var(--space-8)] text-center",
          className
        )}
      >
        <p className="m-0 max-w-[24rem] text-[0.92rem] leading-[1.5] text-[var(--color-ink-muted)]">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={agentCreateClassNames("grid min-w-0 gap-[var(--space-6)]", className)}>
        {messages.map((message, messageIndex) => {
          const isUser = message.role === "user";
          const isSystem = message.role === "system";
          const artifacts = visibleChatArtifacts(message.artifacts);
          const hasInlineSlideshow = artifacts.some((artifact) =>
            isInlineSlideshowArtifact(artifact, false)
          );
          const steps = workingMessageId === message.id && activeThinkingStep
            ? [...(message.toolSteps ?? []), activeThinkingStep]
            : message.toolSteps;
          const showWorkLog = !isUser && (Boolean(steps?.length) || workingMessageId === message.id);
          const content = showWorkLog ? stripRedundantPlan(message.content) : message.content;
          const previousUserMessage = !isUser
            ? messages
                .slice(0, messageIndex)
                .reverse()
                .find((candidate) => candidate.role === "user")
            : undefined;

          return (
            <article
              className={agentCreateClassNames(
                "grid min-w-0",
                isUser ? "justify-items-end" : "justify-items-start"
              )}
              key={message.id}
            >
              <div
                className={agentCreateClassNames(
                  "grid min-w-0 gap-[var(--space-3)]",
                  isUser
                    ? "max-w-[min(34rem,78%)] rounded-[1.25rem] bg-[var(--color-ink)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--color-surface)] shadow-[var(--shadow-sm)]"
                    : isSystem
                      ? "max-w-[min(42rem,100%)] rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)] px-[var(--space-3)] py-[var(--space-2)]"
                      : hasInlineSlideshow
                        ? "w-full max-w-[min(54rem,100%)]"
                        : "max-w-[min(48rem,100%)]"
                )}
              >
                {showWorkLog ? (
                  <AgentMessageWorkLog
                    defaultOpen={message.kind === "plan"}
                    isWorking={workingMessageId === message.id}
                    onArtifactOpen={onArtifactOpen}
                    startedAt={previousUserMessage?.createdAt}
                    steps={steps}
                  />
                ) : null}

                {content ? (
                  <p
                    className={agentCreateClassNames(
                      "m-0 whitespace-pre-wrap text-[0.94rem] leading-[1.6]",
                      isUser ? "text-[var(--color-surface)]" : "text-[var(--color-ink)]"
                    )}
                  >
                    <TypewriterText
                      animate={animatedMessageIds.has(message.id)}
                      text={content}
                    />
                  </p>
                ) : null}

                {message.referenceMentions?.length ? (
                  <div className="flex min-w-0 flex-wrap gap-[var(--space-2)]">
                    {message.referenceMentions.map((mention) => (
                      <AssetMentionChip
                        asset={{
                          id: mention.entityId,
                          title: mention.label,
                          storageUrl: mention.previewUrl ?? mention.storageUrl ?? mention.thumbnailUrl,
                          thumbnailUrl: mention.thumbnailUrl ?? mention.storageUrl,
                          mimeType: mention.mimeType,
                          mediaKind: mention.mediaType,
                        }}
                        key={`${message.id}:${mention.entityType}:${mention.entityId}:${mention.token}`}
                        meta={[
                          mention.token,
                          mention.sourceLabel ?? formatAgentCreateEntityType(mention.entityType),
                        ].filter(Boolean).join(" · ")}
                        tone={isUser ? "inverse" : "default"}
                      />
                    ))}
                  </div>
                ) : null}

                {artifacts.length ? (
                  <AgentCreateArtifactGrid
                    artifacts={artifacts}
                    onDownload={onArtifactDownload}
                    onOpen={onArtifactOpen}
                    onOpenStudio={onArtifactOpenStudio}
                    onPreview={(artifact) => {
                      const media = lightboxMediaForArtifact(artifact);
                      if (media) setLightboxMedia(media);
                    }}
                    onSave={onArtifactSave}
                  />
                ) : null}
              </div>
            </article>
          );
        })}
        {showThinkingPlaceholder ? <ThinkingMessage step={activeThinkingStep} /> : null}
      </div>
      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />
    </>
  );
}

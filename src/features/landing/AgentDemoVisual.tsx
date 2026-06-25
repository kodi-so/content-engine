import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clapperboard,
  Film,
  Image,
  Mic2,
  PackageCheck,
  PenLine,
  Send,
  Sparkles,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";

type DemoToolStatus = "queued" | "running" | "succeeded";

const demoDurationMs = 34000;
const runStartMs = 5200;

const demoPrompt =
  "Create a TikTok video where a marathon runner refuels with our protein bar after a long training run.";

const agentMessage =
  "Absolutely. I'll build this as a fast vertical ad with a clear hook, product refuel moment, and review-ready package.";

const agentSteps = [
  {
    icon: PenLine,
    label: "Plan the TikTok ad",
    detail: "15-second arc: tired runner, refuel moment, second wind, product end card",
    model: "Gemini 2.5 Flash",
    startMs: 6200,
    endMs: 8400,
  },
  {
    icon: Image,
    label: "Generate runner keyframes",
    detail: "Marathon runner on a sunlit trail holding the protein bar after a hard run",
    model: "Nano Banana Pro",
    startMs: 8400,
    endMs: 11200,
  },
  {
    icon: Film,
    label: "Animate training clips",
    detail: "9:16 image-to-video shots with runner motion and product continuity",
    model: "Kling v3 Pro",
    startMs: 11200,
    endMs: 14600,
  },
  {
    icon: Mic2,
    label: "Generate voiceover",
    detail: "Punchy spoken line timed to the refuel and second-wind beats",
    model: "Seed Speech TTS v2",
    startMs: 14600,
    endMs: 17200,
  },
  {
    icon: Clapperboard,
    label: "Compose vertical edit",
    detail: "Cut runner clips, product close-up, voiceover, and pacing into one timeline",
    model: "Studio Composer",
    startMs: 17200,
    endMs: 20600,
  },
  {
    icon: Type,
    label: "Render caption overlays",
    detail: "Add readable TikTok text: Fuel the final miles",
    model: "Studio Renderer",
    startMs: 20600,
    endMs: 23000,
  },
  {
    icon: PackageCheck,
    label: "Package review assets",
    detail: "Final video, caption copy, thumbnail, and source clips ready for approval",
    model: "Content Engine",
    startMs: 23000,
    endMs: 25400,
  },
];

function useLoopingDemoClock() {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      setElapsedMs((performance.now() - startedAt) % demoDurationMs);
    }, 80);

    return () => window.clearInterval(interval);
  }, []);

  return elapsedMs;
}

function visibleText(text: string, elapsedMs: number, startMs: number, msPerCharacter: number) {
  if (elapsedMs < startMs) return "";
  const visibleLength = Math.min(text.length, Math.floor((elapsedMs - startMs) / msPerCharacter));
  return text.slice(0, visibleLength);
}

function toolStatus(step: { startMs: number; endMs: number }, elapsedMs: number): DemoToolStatus {
  if (elapsedMs < step.startMs) return "queued";
  if (elapsedMs < step.endMs) return "running";
  return "succeeded";
}

function formatDemoDuration(elapsedMs: number) {
  const seconds = Math.max(1, Math.floor((elapsedMs - runStartMs) / 1000));
  return `${seconds}s`;
}

function RunningDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
      <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)] [animation-delay:120ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-primary)] [animation-delay:240ms]" />
    </span>
  );
}

function ToolStatusIcon({ status }: { status: DemoToolStatus }) {
  if (status === "running") return <RunningDots />;
  if (status === "succeeded") return <CheckCircle2 size={16} />;
  return <Circle size={14} />;
}

function statusTone(status: DemoToolStatus) {
  if (status === "succeeded") {
    return "border-[oklch(70%_0.105_155_/_0.45)] bg-[oklch(94%_0.045_155)] text-[oklch(34%_0.105_155)]";
  }
  if (status === "running") {
    return "border-[var(--color-accent)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]";
  }
  return "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]";
}

function WorkLog({ elapsedMs }: { elapsedMs: number }) {
  const visibleSteps = agentSteps.filter((step) => elapsedMs >= step.startMs - 350);
  const steps = visibleSteps.length ? visibleSteps : [agentSteps[0]];
  const completedCount = agentSteps.filter((step) => toolStatus(step, elapsedMs) === "succeeded").length;
  const activeStep = agentSteps.find((step) => toolStatus(step, elapsedMs) === "running");

  return (
    <div className="group grid min-w-0 justify-items-start border-b border-[var(--color-border)] pb-[var(--space-3)]">
      <div className="flex cursor-default list-none items-center gap-1 text-[0.78rem] font-[720] text-[var(--color-ink-muted)]">
        <span>{completedCount === agentSteps.length ? "Worked" : `Working for ${formatDemoDuration(elapsedMs)}`}</span>
        {completedCount === agentSteps.length ? null : <RunningDots />}
        <ChevronRight className="rotate-90" size={14} />
      </div>

      <div className="mt-[var(--space-3)] grid w-full max-w-[min(44rem,100%)] gap-[var(--space-3)]">
        {activeStep ? (
          <p className="m-0 text-[0.8rem] leading-[1.45] text-[var(--color-ink-muted)]">
            Currently: <span className="font-[760] text-[var(--color-ink-soft)]">{activeStep.label}</span>
          </p>
        ) : null}

        <section className="grid min-w-0 gap-[var(--space-3)] text-[0.82rem]">
          <div className="flex min-w-0 items-center justify-between gap-[var(--space-3)]">
            <h3 className="m-0 text-[0.86rem] font-[820] text-[var(--color-ink)]">Work log</h3>
            <span className="text-[0.72rem] font-[720] text-[var(--color-ink-muted)]">
              {completedCount} / {agentSteps.length} complete
            </span>
          </div>

          <ol className="grid min-w-0 gap-[var(--space-2)]">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const status = toolStatus(step, elapsedMs);
              return (
                <li
                  className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-[var(--space-2)] transition duration-300"
                  key={step.label}
                >
                  <div className="grid justify-items-center">
                    <span className={`grid size-7 place-items-center rounded-full border ${statusTone(status)}`}>
                      <ToolStatusIcon status={status} />
                    </span>
                    {index < steps.length - 1 ? (
                      <span className="h-full min-h-5 w-px bg-[var(--color-border)]" />
                    ) : null}
                  </div>

                  <div className="min-w-0 pb-[var(--space-3)]">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-2)] gap-y-1">
                      <strong className="text-[0.84rem] font-[780] text-[var(--color-ink)]">
                        {step.label}
                      </strong>
                      {status === "running" ? (
                        <span className="text-[0.7rem] font-[700] text-[var(--color-ink-muted)]">
                          running
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 grid min-w-0 justify-items-start gap-1">
                      <span className="inline-flex max-w-full items-center rounded-full border border-[var(--color-border)] bg-[var(--color-page-quiet)] px-2 py-0.5 text-[0.68rem] font-[760] leading-[1.2] text-[var(--color-ink-soft)]">
                        <Icon size={12} />
                        <span className="ml-1 truncate">{step.model}</span>
                      </span>
                      <p className="m-0 whitespace-normal break-words text-[0.76rem] leading-[1.4] text-[var(--color-ink-muted)]">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

export function AgentDemoVisual() {
  const elapsedMs = useLoopingDemoClock();
  const typedPrompt = visibleText(demoPrompt, elapsedMs, 650, 28);
  const sentPrompt = elapsedMs >= 4300;
  const thinking = elapsedMs >= 4600 && elapsedMs < 5400;
  const showWorkLog = elapsedMs >= runStartMs;
  const streamedMessage = visibleText(agentMessage, elapsedMs, 5400, 26);
  const composerValue = sentPrompt ? "" : typedPrompt;

  return (
    <div className="relative mx-auto w-full max-w-[74rem] overflow-hidden rounded-[1.35rem] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_34px_100px_oklch(19%_0.025_232_/_0.14)]">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[oklch(99%_0.004_232_/_0.92)] px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0">
            <p className="m-0 truncate text-[0.88rem] font-[820] text-[var(--color-ink)]">
              Create
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-[35rem] bg-[var(--color-page)]">
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
          <div className="min-h-0 px-4 py-6 sm:px-8">
            <div className="grid min-w-0 gap-[var(--space-6)]">
              {sentPrompt ? (
                <article className="grid min-w-0 justify-items-end">
                  <div className="grid min-w-0 max-w-[min(34rem,78%)] gap-[var(--space-3)] rounded-[1.25rem] bg-[var(--color-ink)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--color-surface)] shadow-[var(--shadow-sm)]">
                    <p className="m-0 whitespace-pre-wrap text-[0.94rem] leading-[1.6] text-[var(--color-surface)]">
                      {demoPrompt}
                    </p>
                  </div>
                </article>
              ) : null}

              {thinking ? (
                <article className="grid min-w-0 justify-items-start">
                  <div className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--color-page-quiet)] px-[var(--space-3)] text-[0.88rem] font-[690] text-[var(--color-ink-muted)]">
                    <span>Thinking</span>
                    <RunningDots />
                  </div>
                </article>
              ) : null}

              {(showWorkLog || streamedMessage) ? (
                <article className="grid min-w-0 justify-items-start">
                  <div className="grid min-w-0 max-w-[min(48rem,100%)] gap-[var(--space-3)]">
                    {showWorkLog ? <WorkLog elapsedMs={elapsedMs} /> : null}
                    {streamedMessage ? (
                      <p className="m-0 whitespace-pre-wrap text-[0.94rem] leading-[1.6] text-[var(--color-ink)]">
                        {streamedMessage}
                        {streamedMessage.length < agentMessage.length ? (
                          <span className="ml-1 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </article>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)]">
              <div className="flex min-h-11 items-center rounded-[0.85rem] bg-[var(--color-page-quiet)] px-3 text-[0.92rem] font-[650] leading-5 text-[var(--color-ink)]">
                {composerValue}
                {!sentPrompt ? (
                  <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
                ) : (
                  <span className="text-[var(--color-ink-muted)]">Describe what you want to create</span>
                )}
              </div>
              <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-[var(--color-ink)] text-[var(--color-surface)]">
                <Send size={15} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

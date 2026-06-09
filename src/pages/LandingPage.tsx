import { SignInButton, useAuth } from "@clerk/clerk-react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  GalleryHorizontalEnd,
  Layers3,
  Play,
  RadioTower,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type StudioMode = "create" | "orchestrate" | "publish";

const studioModes: Array<{
  id: StudioMode;
  label: string;
  eyebrow: string;
  title: string;
  detail: string;
  nodes: string[];
}> = [
  {
    id: "create",
    label: "Create",
    eyebrow: "Prompt to asset",
    title: "Generate images, clips, audio, and slides without leaving the studio.",
    detail: "Reference files, brand memory, and model controls stay attached to every output.",
    nodes: ["Brand memory", "Image model", "Video render", "Review"],
  },
  {
    id: "orchestrate",
    label: "Orchestrate",
    eyebrow: "Canvas native",
    title: "Turn repeatable content ideas into workflow graphs your team can run.",
    detail: "Nodes branch, merge, retain artifacts, and expose execution state as each run moves.",
    nodes: ["Runner", "AI agent", "Post compiler", "Export"],
  },
  {
    id: "publish",
    label: "Publish",
    eyebrow: "Provider backed",
    title: "Package content for social accounts, approvals, scheduling, and metrics.",
    detail: "Final media, captions, destinations, status, and performance live together.",
    nodes: ["Postiz", "Approval", "Auto post", "Analytics"],
  },
];

const signalRows = [
  ["TikTok UGC launch", "Founder clip", "App demo", "Before and after", "Carousel idea"],
  ["Caption variants", "Voiceover", "Hook test", "AI influencer", "Metric sync"],
  ["Product screenshot", "Prompt library", "Publishing plan", "Team review", "Saved asset"],
];

function CtaButton({ isSignedIn }: { isSignedIn?: boolean }) {
  if (isSignedIn) {
    return (
      <Link
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-ink)] px-5 text-[0.95rem] font-[780] text-[var(--color-surface)] shadow-[0_18px_48px_oklch(19%_0.025_232_/_0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--color-primary-strong)]"
        to="/dashboard"
      >
        Open studio
        <ArrowRight size={17} />
      </Link>
    );
  }

  return (
    <SignInButton mode="modal">
      <button
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-ink)] px-5 text-[0.95rem] font-[780] text-[var(--color-surface)] shadow-[0_18px_48px_oklch(19%_0.025_232_/_0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--color-primary-strong)]"
        type="button"
      >
        Start building
        <ArrowRight size={17} />
      </button>
    </SignInButton>
  );
}

function WorkflowVisual({ activeMode }: { activeMode: (typeof studioModes)[number] }) {
  return (
    <div className="relative min-h-[28rem] overflow-hidden border border-[oklch(86%_0.025_220)] bg-[oklch(98.6%_0.006_220)] shadow-[0_30px_90px_oklch(19%_0.025_232_/_0.12)]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(87%_0.02_220)_1px,transparent_1px),linear-gradient(180deg,oklch(87%_0.02_220)_1px,transparent_1px)] bg-[size:4.8rem_4.8rem] opacity-70" />
      <div className="absolute inset-x-0 top-0 flex h-12 items-center justify-between border-b border-[oklch(87%_0.018_232)] bg-[oklch(99%_0.004_232_/_0.92)] px-4 backdrop-blur">
        <div className="flex items-center gap-2 text-[0.78rem] font-[760] text-[var(--color-ink)]">
          <BrainCircuit size={16} />
          Workflow canvas
        </div>
        <div className="flex items-center gap-2 text-[0.72rem] font-[760] text-[var(--color-primary-strong)]">
          <span className="size-2 rounded-full bg-[var(--color-accent)]" />
          Live run
        </div>
      </div>

      <div className="relative z-10 grid min-h-[28rem] content-center gap-5 px-6 pt-16 sm:px-9">
        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <div className="grid gap-3">
            <div className="w-fit rounded-full border border-[oklch(82%_0.035_174)] bg-[var(--color-primary-soft)] px-3 py-1 text-[0.72rem] font-[800] uppercase tracking-[0.08em] text-[var(--color-primary-strong)]">
              {activeMode.eyebrow}
            </div>
            <h2 className="m-0 max-w-[18rem] text-[clamp(1.75rem,3vw,2.6rem)] font-[820] leading-[0.98] tracking-[0] text-[var(--color-ink)]">
              {activeMode.title}
            </h2>
            <p className="m-0 max-w-[24rem] text-[0.95rem] leading-6 text-[var(--color-ink-muted)]">
              {activeMode.detail}
            </p>
          </div>

          <div className="relative grid min-h-[18rem] place-items-center">
            <div className="absolute left-[12%] right-[13%] top-1/2 h-px bg-[oklch(74%_0.04_174)]" />
            <div className="absolute left-[50%] top-[18%] h-[64%] w-px bg-[oklch(80%_0.027_220)]" />
            <div className="relative grid w-full grid-cols-2 gap-4">
              {activeMode.nodes.map((node, index) => (
                <div
                  className="animate-[ce-rise_580ms_cubic-bezier(0.16,1,0.3,1)_both] border border-[oklch(83%_0.026_220)] bg-[oklch(99%_0.004_232_/_0.94)] p-4 shadow-[0_18px_42px_oklch(19%_0.025_232_/_0.08)] backdrop-blur"
                  key={node}
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="grid size-8 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-page-quiet)] text-[var(--color-primary-strong)]">
                      {index === 0 ? <Sparkles size={16} /> : index === 1 ? <Bot size={16} /> : index === 2 ? <Layers3 size={16} /> : <CheckCircle2 size={16} />}
                    </span>
                    <span className="size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_7px_oklch(79%_0.15_92_/_0.16)]" />
                  </div>
                  <strong className="block text-[0.9rem] font-[780] leading-tight text-[var(--color-ink)]">
                    {node}
                  </strong>
                  <span className="mt-1 block text-[0.72rem] font-[650] text-[var(--color-ink-muted)]">
                    {index === 3 ? "final output" : "typed port"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalMarquee() {
  return (
    <div className="grid gap-3 overflow-hidden py-4">
      {signalRows.map((row, rowIndex) => (
        <div
          className="flex w-max gap-3 animate-[ce-marquee_26s_linear_infinite]"
          key={row.join("-")}
          style={{
            animationDirection: rowIndex % 2 ? "reverse" : "normal",
            animationDuration: `${24 + rowIndex * 6}s`,
          }}
        >
          {[...row, ...row, ...row].map((item, index) => (
            <span
              className="rounded-full border border-[oklch(83%_0.024_220)] bg-[oklch(99%_0.004_232)] px-4 py-2 text-[0.84rem] font-[720] text-[var(--color-ink-soft)] shadow-[var(--shadow-sm)]"
              key={`${item}-${index}`}
            >
              {item}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function LandingPage() {
  const { isSignedIn } = useAuth();
  const [activeModeId, setActiveModeId] = useState<StudioMode>("orchestrate");
  const activeMode = useMemo(
    () => studioModes.find((mode) => mode.id === activeModeId) ?? studioModes[1],
    [activeModeId]
  );

  return (
    <main className="min-h-screen bg-[var(--color-page)] text-[var(--color-ink)]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[oklch(88%_0.016_232_/_0.72)] bg-[oklch(96.7%_0.012_232_/_0.86)] backdrop-blur-xl">
        <nav className="mx-auto flex h-16 w-[min(100%,92rem)] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3 text-[0.95rem] font-[820] text-[var(--color-ink)] no-underline" to="/">
            <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-ink)] text-[var(--color-accent)]">
              <BrainCircuit size={18} />
            </span>
            Content Engine
          </Link>
          <div className="hidden items-center gap-6 text-[0.85rem] font-[680] text-[var(--color-ink-soft)] md:flex">
            <a className="transition hover:text-[var(--color-ink)]" href="#studio">Studio</a>
            <a className="transition hover:text-[var(--color-ink)]" href="#workflow">Workflows</a>
            <a className="transition hover:text-[var(--color-ink)]" href="#security">Access</a>
          </div>
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <Link className="secondary-button min-h-10 px-3 text-[0.84rem]" to="/dashboard">
                Dashboard
              </Link>
            ) : (
              <SignInButton mode="modal">
                <button className="secondary-button min-h-10 px-3 text-[0.84rem]" type="button">
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>
        </nav>
      </header>

      <section className="relative isolate min-h-[calc(100svh-0rem)] overflow-hidden pt-16">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,oklch(88%_0.018_232)_1px,transparent_1px),linear-gradient(180deg,oklch(88%_0.018_232)_1px,transparent_1px)] bg-[size:4.5rem_4.5rem]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,oklch(96.7%_0.012_232)_0%,oklch(92%_0.045_174)_58%,oklch(96.7%_0.012_232)_100%)] opacity-90" />
        <div className="mx-auto grid w-[min(100%,92rem)] gap-6 px-4 pb-10 pt-[clamp(2rem,5vw,4rem)] sm:px-6 lg:px-8">
          <div className="grid justify-items-center gap-4 text-center">
            <div className="animate-[ce-rise_600ms_cubic-bezier(0.16,1,0.3,1)_both] inline-flex items-center gap-2 rounded-full border border-[oklch(82%_0.035_174)] bg-[oklch(99%_0.004_232_/_0.68)] px-3 py-1 text-[0.78rem] font-[780] text-[var(--color-primary-strong)] shadow-[var(--shadow-sm)] backdrop-blur">
              <RadioTower size={15} />
              AI content systems for creators and teams
            </div>
            <div className="grid max-w-[62rem] gap-5">
              <h1 className="animate-[ce-rise_700ms_cubic-bezier(0.16,1,0.3,1)_80ms_both] m-0 text-[clamp(3rem,7vw,6.6rem)] font-[850] leading-[0.88] tracking-[0] text-[var(--color-ink)]">
                Content Engine
              </h1>
              <p className="animate-[ce-rise_700ms_cubic-bezier(0.16,1,0.3,1)_160ms_both] mx-auto m-0 max-w-[42rem] text-[clamp(1.1rem,2vw,1.45rem)] leading-[1.38] text-[var(--color-ink-soft)]">
                Build the system behind every post: brand memory, AI generation, workflow runs, review, publishing, and metrics in one calm workspace.
              </p>
            </div>
            <div className="animate-[ce-rise_700ms_cubic-bezier(0.16,1,0.3,1)_240ms_both] flex flex-wrap justify-center gap-3">
              <CtaButton isSignedIn={isSignedIn} />
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[oklch(76%_0.032_220)] bg-[oklch(99%_0.004_232_/_0.74)] px-5 text-[0.95rem] font-[760] text-[var(--color-ink)] shadow-[var(--shadow-sm)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[var(--color-surface)]"
                href="#studio"
              >
                <Play size={16} />
                See the studio
              </a>
            </div>
          </div>

          <div className="animate-[ce-rise_800ms_cubic-bezier(0.16,1,0.3,1)_300ms_both] mx-auto grid w-full max-w-[68rem] gap-3">
            <div className="flex flex-wrap justify-center gap-2" id="studio">
              {studioModes.map((mode) => (
                <button
                  className={[
                    "min-h-10 rounded-full px-4 text-[0.84rem] font-[780] transition",
                    activeModeId === mode.id
                      ? "bg-[var(--color-ink)] text-[var(--color-surface)] shadow-[0_12px_32px_oklch(19%_0.025_232_/_0.18)]"
                      : "border border-[oklch(82%_0.024_220)] bg-[oklch(99%_0.004_232_/_0.74)] text-[var(--color-ink-soft)] hover:border-[var(--color-primary)] hover:text-[var(--color-ink)]",
                  ].join(" ")}
                  key={mode.id}
                  onClick={() => setActiveModeId(mode.id)}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <WorkflowVisual activeMode={activeMode} />
          </div>
        </div>
      </section>

      <section className="border-y border-[oklch(86%_0.018_232)] bg-[var(--color-surface)] py-[clamp(4rem,8vw,7rem)]" id="workflow">
        <div className="mx-auto grid w-[min(100%,92rem)] gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div className="grid content-start gap-5">
            <span className="w-fit rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[oklch(35%_0.09_92)]">
              From idea to operating system
            </span>
            <h2 className="m-0 max-w-[13ch] text-[clamp(2.4rem,5vw,5.6rem)] font-[840] leading-[0.92] tracking-[0]">
              One canvas for the whole content loop.
            </h2>
            <p className="m-0 max-w-[34rem] text-[1.02rem] leading-7 text-[var(--color-ink-muted)]">
              Create one-off assets when you need speed, then promote what works into repeatable workflows that your team can run, inspect, and improve.
            </p>
          </div>

          <div className="grid gap-4">
            {[
              ["01", "Define the memory", "Brands, personas, source assets, voice references, and reusable context stay attached to the work."],
              ["02", "Run the graph", "LLMs, agents, media generators, renderers, and publishing nodes execute with typed inputs and visible state."],
              ["03", "Keep what matters", "Final packages land in the library, with prompts, models, providers, and review status preserved."],
            ].map(([step, title, body]) => (
              <article
                className="group grid gap-4 border-t border-[oklch(86%_0.018_232)] py-6 transition hover:border-[var(--color-primary)] sm:grid-cols-[5rem_minmax(0,1fr)]"
                key={step}
              >
                <span className="font-[820] text-[var(--color-primary)]">{step}</span>
                <div className="grid gap-2">
                  <h3 className="m-0 text-[clamp(1.3rem,2.5vw,2rem)] font-[790] leading-tight">{title}</h3>
                  <p className="m-0 max-w-[46rem] text-[0.98rem] leading-7 text-[var(--color-ink-muted)]">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden bg-[oklch(19%_0.025_232)] py-[clamp(4rem,8vw,7rem)] text-[oklch(96%_0.008_232)]">
        <div className="mx-auto grid w-[min(100%,92rem)] gap-9 px-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-[0.8fr_1fr] md:items-end">
            <div className="grid gap-3">
              <span className="text-[0.75rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-accent)]">
                Signals in motion
              </span>
              <h2 className="m-0 text-[clamp(2.2rem,5vw,5.2rem)] font-[840] leading-[0.94] tracking-[0]">
                Every prompt becomes a reusable asset.
              </h2>
            </div>
            <p className="m-0 max-w-[38rem] text-[1rem] leading-7 text-[oklch(79%_0.018_232)]">
              Content Engine treats requests, references, model choices, outputs, approvals, and metrics as connected system data, not disposable chat history.
            </p>
          </div>
          <SignalMarquee />
        </div>
      </section>

      <section className="bg-[var(--color-page)] py-[clamp(4rem,8vw,7rem)]" id="security">
        <div className="mx-auto grid w-[min(100%,92rem)] gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="grid content-start gap-4">
            <span className="w-fit rounded-full border border-[oklch(82%_0.035_174)] bg-[var(--color-primary-soft)] px-3 py-1 text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-primary-strong)]">
              Built for separation
            </span>
            <h2 className="m-0 text-[clamp(2.2rem,5vw,5rem)] font-[840] leading-[0.94] tracking-[0]">
              Personal work and team work should not blur together.
            </h2>
          </div>
          <div className="grid gap-4">
            {[
              [Workflow, "Private workspace", "Your drafts, experiments, and saved assets can stay tied to your own account."],
              [GalleryHorizontalEnd, "Team workspace", "Shared brands, workflows, accounts, and libraries belong to a workspace with members and roles."],
              [BarChart3, "Operational visibility", "Runs, approvals, exports, and metrics inherit the same ownership boundary."],
            ].map(([Icon, title, body]) => {
              const TypedIcon = Icon as typeof Workflow;
              return (
                <div className="grid grid-cols-[2.6rem_minmax(0,1fr)] gap-4 border-t border-[oklch(86%_0.018_232)] py-5" key={String(title)}>
                  <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-primary-strong)] shadow-[var(--shadow-sm)]">
                    <TypedIcon size={18} />
                  </span>
                  <div className="grid gap-1">
                    <h3 className="m-0 text-[1.1rem] font-[780]">{title as string}</h3>
                    <p className="m-0 text-[0.96rem] leading-6 text-[var(--color-ink-muted)]">{body as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-[oklch(86%_0.018_232)] bg-[var(--color-surface)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-[min(100%,92rem)] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 font-[820]">
            <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-ink)] text-[var(--color-accent)]">
              <Zap size={17} />
            </span>
            Content Engine
          </div>
          <CtaButton isSignedIn={isSignedIn} />
        </div>
      </footer>
    </main>
  );
}

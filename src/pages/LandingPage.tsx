import { SignInButton, useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  GalleryHorizontalEnd,
  MessageSquareText,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { ContentEngineMark } from "../components/BrandLogo";

const demoSteps = [
  {
    icon: MessageSquareText,
    label: "Brief",
    title: "Launch a weekly creator post series",
    meta: "References, offer, audience, voice",
  },
  {
    icon: Workflow,
    label: "Run",
    title: "Generate variants, compile captions, request review",
    meta: "Models, prompts, files, approvals",
  },
  {
    icon: CheckCircle2,
    label: "Keep",
    title: "Save the package as a reusable workflow",
    meta: "Assets, decisions, metrics, next run",
  },
];

const operatingSteps = [
  {
    number: "01",
    title: "Capture the idea",
    body: "Start with a prompt, a campaign brief, a source file, or a messy request from the team.",
  },
  {
    number: "02",
    title: "Run the system",
    body: "Turn the work into a visible workflow with models, agents, review, and publishing steps.",
  },
  {
    number: "03",
    title: "Reuse what worked",
    body: "Keep the prompt, references, outputs, approvals, and performance together for the next run.",
  },
];

const proofPoints = [
  {
    icon: BrainCircuit,
    title: "Memory that travels with the work",
    body: "Brand context, personas, references, and prior outputs stay attached to the process.",
  },
  {
    icon: Route,
    title: "Workflows people can inspect",
    body: "Every run has state, outputs, and ownership, so teams can improve the system instead of guessing.",
  },
  {
    icon: GalleryHorizontalEnd,
    title: "A library of finished decisions",
    body: "Approved content lands with the story of how it was made, not just a final file.",
  },
];

const signalRows = [
  ["Creator brief", "Hook test", "Product screenshot", "Voice reference", "Caption set"],
  ["Review note", "Prompt variant", "UGC concept", "Publishing package", "Saved workflow"],
];

function PrimaryCta({ isSignedIn }: { isSignedIn?: boolean }) {
  const className =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-ink)] px-5 text-[0.95rem] font-[780] text-[var(--color-surface)] shadow-[0_18px_48px_oklch(19%_0.025_232_/_0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--color-primary-strong)]";

  if (isSignedIn) {
    return (
      <Link className={className} to="/dashboard">
        Open studio
        <ArrowRight size={17} />
      </Link>
    );
  }

  return (
    <a className={className} href="#request-access">
      Request access
      <ArrowRight size={17} />
    </a>
  );
}

function AccessRequestForm() {
  const requestAccess = useMutation(api.waitlist.requestAccess);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const emailValue = email.trim();
    if (!emailValue) return;

    setStatus("Sending request...");
    try {
      await requestAccess({
        email: emailValue,
        name: name.trim() || undefined,
        intendedUse: intendedUse.trim() || undefined,
        source: "landing",
      });
      setName("");
      setEmail("");
      setIntendedUse("");
      setStatus("Request received. We will follow up when your workspace is ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed. Please try again.");
    }
  };

  return (
    <form
      className="grid w-full max-w-[34rem] gap-3 rounded-[1.1rem] border border-[oklch(100%_0_0_/_0.13)] bg-[oklch(100%_0_0_/_0.06)] p-3 text-left shadow-[0_24px_70px_oklch(0%_0_0_/_0.2)] backdrop-blur"
      id="request-access"
      onSubmit={handleSubmit}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="min-h-12 rounded-[var(--radius-sm)] border border-[oklch(100%_0_0_/_0.14)] bg-[oklch(96%_0.008_232)] px-3 text-[0.92rem] font-[650] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)]"
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="min-h-12 rounded-[var(--radius-sm)] border border-[oklch(100%_0_0_/_0.14)] bg-[oklch(96%_0.008_232)] px-3 text-[0.92rem] font-[650] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)]"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <input
        className="min-h-12 rounded-[var(--radius-sm)] border border-[oklch(100%_0_0_/_0.14)] bg-[oklch(96%_0.008_232)] px-3 text-[0.92rem] font-[650] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)]"
        placeholder="What do you want to use it for?"
        value={intendedUse}
        onChange={(event) => setIntendedUse(event.target.value)}
      />
      <button className="primary-button min-h-12" disabled={!email.trim()} type="submit">
        Request access
        <ArrowRight size={16} />
      </button>
      {status ? (
        <p className="m-0 text-center text-[0.82rem] font-[650] leading-5 text-[oklch(82%_0.018_232)]">
          {status}
        </p>
      ) : null}
    </form>
  );
}

function SignalRail() {
  return (
    <div className="grid gap-2 overflow-hidden">
      {signalRows.map((row, rowIndex) => (
        <div
          className="flex w-max gap-2 animate-[ce-marquee_30s_linear_infinite]"
          key={row.join("-")}
          style={{
            animationDirection: rowIndex % 2 ? "reverse" : "normal",
            animationDuration: `${28 + rowIndex * 6}s`,
          }}
        >
          {[...row, ...row, ...row].map((item, index) => (
            <span
              className="rounded-full border border-[oklch(84%_0.018_232)] bg-[oklch(99%_0.004_232)] px-3 py-1.5 text-[0.74rem] font-[720] text-[var(--color-ink-soft)] shadow-[var(--shadow-sm)]"
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

function FlowLine() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-x-[8%] top-[42%] hidden h-12 text-[var(--color-primary)] md:block"
      preserveAspectRatio="none"
      viewBox="0 0 1000 80"
    >
      <path
        d="M 10 42 C 190 42 190 42 350 42 S 510 42 670 42 S 830 42 990 42"
        fill="none"
        stroke="currentColor"
        strokeDasharray="6 14"
        strokeLinecap="round"
        strokeWidth="2"
      >
        <animate
          attributeName="stroke-dashoffset"
          dur="4s"
          from="80"
          repeatCount="indefinite"
          to="0"
        />
      </path>
    </svg>
  );
}

function ProductScene() {
  return (
    <div className="relative mx-auto w-full max-w-[70rem] overflow-hidden rounded-[1.4rem] border border-[oklch(86%_0.018_232)] bg-[oklch(99%_0.004_232)] shadow-[0_34px_100px_oklch(19%_0.025_232_/_0.14)]">
      <div className="grid min-h-[30rem] gap-0 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative grid content-between gap-8 border-b border-[oklch(88%_0.014_232)] p-6 lg:border-b-0 lg:border-r lg:p-8">
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[oklch(82%_0.035_174)] bg-[var(--color-primary-soft)] px-3 py-1 text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-primary-strong)]">
                <CircleDot className="animate-pulse" size={13} />
                Live content run
              </span>
              <span className="text-[0.72rem] font-[760] text-[var(--color-ink-muted)]">
                3 min ago
              </span>
            </div>
            <div className="grid gap-3">
              <h2 className="m-0 max-w-[12ch] text-[clamp(1.9rem,3.4vw,3.4rem)] font-[850] leading-[0.94] tracking-[0] text-[var(--color-ink)]">
                Briefs become systems.
              </h2>
              <p className="m-0 max-w-[34rem] text-[1rem] leading-7 text-[var(--color-ink-muted)]">
                A good content idea should not disappear after the first post. Content Engine keeps the process reusable.
              </p>
            </div>
          </div>
          <SignalRail />
        </div>

        <div className="relative grid content-center gap-5 overflow-hidden bg-[linear-gradient(180deg,oklch(98.5%_0.006_232),oklch(94%_0.024_184))] p-5 sm:p-8">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(87%_0.018_232)_1px,transparent_1px),linear-gradient(180deg,oklch(87%_0.018_232)_1px,transparent_1px)] bg-[size:4.8rem_4.8rem] opacity-45" />
          <FlowLine />
          <div className="relative z-10 grid gap-4 md:grid-cols-3">
            {demoSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article
                  className="animate-[ce-rise_620ms_cubic-bezier(0.16,1,0.3,1)_both] rounded-[1rem] border border-[oklch(84%_0.018_232)] bg-[oklch(99%_0.004_232_/_0.92)] p-4 shadow-[0_22px_52px_oklch(19%_0.025_232_/_0.1)] backdrop-blur"
                  key={step.label}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-page-quiet)] text-[var(--color-primary-strong)]">
                      <Icon size={18} />
                    </span>
                    <span className="text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
                      {step.label}
                    </span>
                  </div>
                  <h3 className="m-0 text-[1rem] font-[800] leading-tight text-[var(--color-ink)]">
                    {step.title}
                  </h3>
                  <p className="m-0 mt-3 text-[0.78rem] font-[650] leading-5 text-[var(--color-ink-muted)]">
                    {step.meta}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="relative z-10 mx-auto grid w-full max-w-[35rem] gap-2 rounded-[1rem] border border-[oklch(84%_0.018_232)] bg-[oklch(99%_0.004_232_/_0.82)] p-3 shadow-[var(--shadow-sm)] backdrop-blur">
            {["Generated 12 hooks", "2 assets approved", "Workflow saved for next week"].map(
              (item, index) => (
                <div
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-sm)] bg-[oklch(96.5%_0.01_232)] px-3 py-2"
                  key={item}
                >
                  <CheckCircle2
                    className={index === 2 ? "text-[var(--color-primary)]" : "text-[var(--color-ink-muted)]"}
                    size={15}
                  />
                  <span className="truncate text-[0.82rem] font-[700] text-[var(--color-ink)]">
                    {item}
                  </span>
                  <span className="text-[0.7rem] font-[760] text-[var(--color-ink-muted)]">
                    done
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { isSignedIn } = useAuth();
  const showSignIn = import.meta.env.DEV;

  return (
    <main className="min-h-screen bg-[oklch(97.4%_0.008_232)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 border-b border-[oklch(88%_0.014_232)] bg-[oklch(99%_0.004_232_/_0.88)] backdrop-blur-xl">
        <nav className="mx-auto flex h-16 w-[min(100%,88rem)] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            className="flex items-center gap-3 text-[0.95rem] font-[820] text-[var(--color-ink)] no-underline"
            to="/"
          >
            <ContentEngineMark className="size-9 shrink-0" />
            Content Engine
          </Link>
          {isSignedIn ? (
            <Link className="secondary-button min-h-10 px-3 text-[0.84rem]" to="/dashboard">
              Dashboard
            </Link>
          ) : showSignIn ? (
            <SignInButton mode="modal">
              <button className="secondary-button min-h-10 px-3 text-[0.84rem]" type="button">
                Sign in
              </button>
            </SignInButton>
          ) : (
            <a className="secondary-button min-h-10 px-3 text-[0.84rem]" href="#request-access">
              Request access
            </a>
          )}
        </nav>
      </header>

      <section className="relative isolate overflow-hidden border-b border-[oklch(88%_0.014_232)]">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,oklch(88%_0.014_232)_1px,transparent_1px),linear-gradient(180deg,oklch(88%_0.014_232)_1px,transparent_1px)] bg-[size:4.5rem_4.5rem] opacity-65" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[48rem] bg-[radial-gradient(circle_at_50%_12%,oklch(91%_0.055_174),transparent_58%)]" />

        <div className="mx-auto grid w-[min(100%,88rem)] gap-10 px-4 pb-[clamp(4rem,8vw,7rem)] pt-[clamp(4rem,8vw,6.5rem)] sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[66rem] justify-items-center gap-5 text-center">
            <span className="animate-[ce-rise_560ms_cubic-bezier(0.16,1,0.3,1)_both] inline-flex items-center gap-2 rounded-full border border-[oklch(82%_0.035_174)] bg-[oklch(99%_0.004_232_/_0.72)] px-3 py-1 text-[0.78rem] font-[780] text-[var(--color-primary-strong)] shadow-[var(--shadow-sm)] backdrop-blur">
              <Sparkles size={14} />
              AI content operations for repeatable creative work
            </span>
            <h1 className="animate-[ce-rise_640ms_cubic-bezier(0.16,1,0.3,1)_80ms_both] m-0 max-w-[11ch] text-[clamp(3rem,6.6vw,6.2rem)] font-[850] leading-[0.9] tracking-[0] text-[var(--color-ink)]">
              Turn content ideas into systems.
            </h1>
            <p className="animate-[ce-rise_700ms_cubic-bezier(0.16,1,0.3,1)_160ms_both] m-0 max-w-[40rem] text-[clamp(1rem,1.5vw,1.18rem)] leading-[1.5] text-[var(--color-ink-soft)]">
              Content Engine helps teams create, run, review, and reuse AI content workflows from one calm workspace.
            </p>
            <div className="animate-[ce-rise_740ms_cubic-bezier(0.16,1,0.3,1)_240ms_both] flex flex-wrap justify-center gap-3">
              <PrimaryCta isSignedIn={isSignedIn} />
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[oklch(76%_0.032_220)] bg-[oklch(99%_0.004_232_/_0.74)] px-5 text-[0.95rem] font-[760] text-[var(--color-ink)] shadow-[var(--shadow-sm)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[var(--color-surface)]"
                href="#system"
              >
                <Play size={16} />
                See how it works
              </a>
            </div>
          </div>

          <div className="animate-[ce-rise_820ms_cubic-bezier(0.16,1,0.3,1)_320ms_both]">
            <ProductScene />
          </div>
        </div>
      </section>

      <section className="bg-[oklch(99%_0.004_232)] py-[clamp(4.5rem,8vw,7rem)]" id="system">
        <div className="mx-auto grid w-[min(100%,88rem)] gap-12 px-4 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
          <div className="grid content-start gap-4">
            <span className="w-fit rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[oklch(35%_0.09_92)]">
              The problem
            </span>
            <h2 className="m-0 max-w-[14ch] text-[clamp(2.1rem,3.8vw,4rem)] font-[850] leading-[0.94] tracking-[0]">
              Your best AI work is too easy to lose.
            </h2>
          </div>

          <div className="grid gap-0">
            {[
              "Prompts live in chats that nobody can audit.",
              "References and source files drift away from the final asset.",
              "A successful post rarely becomes a repeatable process.",
            ].map((line, index) => (
              <div
                className="grid gap-3 border-t border-[oklch(86%_0.014_232)] py-7 sm:grid-cols-[4rem_minmax(0,1fr)]"
                key={line}
              >
                <span className="font-[820] text-[var(--color-primary)]">
                  0{index + 1}
                </span>
                <p className="m-0 max-w-[42rem] text-[clamp(1.12rem,1.8vw,1.45rem)] font-[760] leading-snug text-[var(--color-ink)]">
                  {line}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden bg-[oklch(19%_0.025_232)] py-[clamp(4.5rem,8vw,7.2rem)] text-[oklch(96%_0.008_232)]" id="workflow">
        <div className="mx-auto grid w-[min(100%,88rem)] gap-12 px-4 sm:px-6 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div className="grid gap-3">
              <span className="text-[0.75rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-accent)]">
                The system
              </span>
              <h2 className="m-0 max-w-[14ch] text-[clamp(2.1rem,3.8vw,4rem)] font-[850] leading-[0.94] tracking-[0]">
                One flow your team can run again.
              </h2>
            </div>
            <p className="m-0 max-w-[38rem] text-[1.05rem] leading-7 text-[oklch(80%_0.018_232)]">
              The point is not more AI output. The point is a creative process that becomes visible, reusable, and better every time it runs.
            </p>
          </div>

          <div className="grid border-y border-[oklch(100%_0_0_/_0.14)] lg:grid-cols-3">
            {operatingSteps.map((step) => (
              <article
                className="grid min-h-[17rem] content-between gap-8 border-b border-[oklch(100%_0_0_/_0.14)] py-7 lg:border-b-0 lg:border-r lg:px-7 lg:last:border-r-0"
                key={step.number}
              >
                <span className="font-[820] text-[var(--color-accent)]">{step.number}</span>
                <div className="grid gap-3">
                  <h3 className="m-0 text-[clamp(1.25rem,2vw,1.8rem)] font-[820] leading-tight">
                    {step.title}
                  </h3>
                  <p className="m-0 text-[0.98rem] leading-7 text-[oklch(80%_0.018_232)]">
                    {step.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[oklch(99%_0.004_232)] py-[clamp(4.5rem,8vw,7rem)]">
        <div className="mx-auto grid w-[min(100%,88rem)] gap-12 px-4 sm:px-6 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1fr] lg:items-end">
            <h2 className="m-0 max-w-[15ch] text-[clamp(2.1rem,3.8vw,4rem)] font-[850] leading-[0.94] tracking-[0]">
              Built for the content loop.
            </h2>
            <p className="m-0 max-w-[37rem] text-[1.05rem] leading-7 text-[var(--color-ink-muted)]">
              Create quickly when the work is new. Turn what works into a system when the pattern is worth keeping.
            </p>
          </div>

          <div className="grid border-y border-[oklch(86%_0.014_232)] lg:grid-cols-3">
            {proofPoints.map((point) => {
              const Icon = point.icon;
              return (
                <article
                  className="grid min-h-[17rem] content-between gap-8 border-b border-[oklch(86%_0.014_232)] py-7 lg:border-b-0 lg:border-r lg:px-7 lg:last:border-r-0"
                  key={point.title}
                >
                  <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-[var(--color-page-quiet)] text-[var(--color-primary-strong)] shadow-[var(--shadow-sm)]">
                    <Icon size={19} />
                  </span>
                  <div className="grid gap-3">
                    <h3 className="m-0 text-[1.45rem] font-[820] leading-tight">
                      {point.title}
                    </h3>
                    <p className="m-0 text-[0.98rem] leading-7 text-[var(--color-ink-muted)]">
                      {point.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[oklch(94.5%_0.018_232)] py-[clamp(4.5rem,8vw,7rem)]" id="team">
        <div className="mx-auto grid w-[min(100%,88rem)] gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="grid content-start gap-4">
            <span className="w-fit rounded-full border border-[oklch(82%_0.035_174)] bg-[var(--color-primary-soft)] px-3 py-1 text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-primary-strong)]">
              For teams
            </span>
            <h2 className="m-0 max-w-[14ch] text-[clamp(2.1rem,3.8vw,4rem)] font-[850] leading-[0.94] tracking-[0]">
              Start alone. Bring the team when it works.
            </h2>
          </div>

          <div className="grid gap-4">
            {[
              [FolderKanban, "Separate workspaces", "Keep experiments, clients, and team systems in the right place."],
              [UsersRound, "Roles for collaboration", "Invite people into the work without exposing everything else."],
              [ShieldCheck, "A calmer operating layer", "Reviews, publishing, and metrics inherit the same workspace boundary."],
            ].map(([Icon, title, body]) => {
              const TypedIcon = Icon as typeof FolderKanban;
              return (
                <div
                  className="grid grid-cols-[2.8rem_minmax(0,1fr)] gap-4 border-t border-[oklch(82%_0.014_232)] py-5"
                  key={String(title)}
                >
                  <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-[oklch(99%_0.004_232)] text-[var(--color-primary-strong)] shadow-[var(--shadow-sm)]">
                    <TypedIcon size={18} />
                  </span>
                  <div className="grid gap-1">
                    <h3 className="m-0 text-[1.15rem] font-[820]">{title as string}</h3>
                    <p className="m-0 text-[0.98rem] leading-7 text-[var(--color-ink-muted)]">
                      {body as string}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden bg-[oklch(19%_0.025_232)] text-[oklch(96%_0.008_232)]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(100%_0_0_/_0.08)_1px,transparent_1px),linear-gradient(180deg,oklch(100%_0_0_/_0.08)_1px,transparent_1px)] bg-[size:5rem_5rem] opacity-45" />
        <div className="relative mx-auto grid min-h-[30rem] w-[min(100%,88rem)] content-center justify-items-center gap-6 px-4 py-[clamp(5rem,9vw,8rem)] text-center sm:px-6 lg:px-8">
          <ContentEngineMark className="size-14 shadow-[0_24px_70px_oklch(0%_0_0_/_0.28)]" />
          <h2 className="m-0 max-w-[14ch] text-[clamp(2.25rem,4.5vw,4.6rem)] font-[850] leading-[0.92] tracking-[0]">
            Make the next great post repeatable.
          </h2>
          <p className="m-0 max-w-[34rem] text-[1.05rem] leading-7 text-[oklch(80%_0.018_232)]">
            Build the system once. Run it, review it, and improve it with every campaign.
          </p>
          {isSignedIn ? <PrimaryCta isSignedIn /> : <AccessRequestForm />}
        </div>
      </footer>
    </main>
  );
}

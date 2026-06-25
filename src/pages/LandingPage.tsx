import { SignInButton, useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import {
  ArrowRight,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { ContentEngineMark } from "../components/BrandLogo";
import { AgentDemoVisual } from "../features/landing/AgentDemoVisual";

const manualProductionSteps = [
  "Open Gemini and generate runner/product images.",
  "Move to Kling and turn the best frames into clips.",
  "Generate or record the voiceover somewhere else.",
  "Bring everything into CapCut and assemble the edit.",
  "Add captions, export, and organize the final files.",
];

function PrimaryCta({ isSignedIn }: { isSignedIn?: boolean }) {
  const className =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-ink)] px-5 text-[0.95rem] font-[780] text-[var(--color-surface)] shadow-[0_18px_48px_oklch(19%_0.025_232_/_0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--color-primary-strong)]";

  if (isSignedIn) {
    return (
      <Link className={className} to="/create">
        Start creating
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
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const emailValue = email.trim();
    if (!emailValue) return;

    setStatus("Sending request...");
    try {
      await requestAccess({
        email: emailValue,
        source: "landing",
      });
      setEmail("");
      setStatus("Request received. We will follow up when your workspace is ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed. Please try again.");
    }
  };

  return (
    <form
      className="grid w-full max-w-[30rem] gap-3 rounded-[1.1rem] border border-[oklch(100%_0_0_/_0.13)] bg-[oklch(100%_0_0_/_0.06)] p-3 text-left shadow-[0_24px_70px_oklch(0%_0_0_/_0.2)] backdrop-blur sm:grid-cols-[minmax(0,1fr)_auto]"
      id="request-access"
      onSubmit={handleSubmit}
    >
      <input
        className="min-h-12 rounded-[var(--radius-sm)] border border-[oklch(100%_0_0_/_0.14)] bg-[oklch(96%_0.008_232)] px-3 text-[0.92rem] font-[650] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)]"
        placeholder="Email address"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button className="primary-button min-h-12 px-5" disabled={!email.trim()} type="submit">
        Request access
        <ArrowRight size={16} />
      </button>
      {status ? (
        <p className="m-0 text-center text-[0.82rem] font-[650] leading-5 text-[oklch(82%_0.018_232)] sm:col-span-2">
          {status}
        </p>
      ) : null}
    </form>
  );
}

function ToolHoppingVisual() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
      <div className="grid gap-4">
        <h2 className="m-0 max-w-[12ch] text-[clamp(2.15rem,4vw,4.3rem)] font-[850] leading-[0.94] tracking-[0] text-[var(--color-ink)]">
          No more tool-hopping.
        </h2>
        <p className="m-0 max-w-[34rem] text-[1.05rem] leading-7 text-[var(--color-ink-muted)]">
          The agent plans the sequence, calls the tools, and brings the pieces
          back into one production thread.
        </p>
      </div>

      <div className="grid gap-5">
        <div className="grid gap-2">
          <span className="text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Before
          </span>
          <ol className="grid gap-2">
            {manualProductionSteps.map((step, index) => (
              <li
                className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 rounded-[var(--radius-md)] border border-[oklch(84%_0.018_232)] bg-[oklch(99%_0.004_232)] p-3 shadow-[var(--shadow-sm)]"
                key={step}
              >
                <span className="grid size-8 place-items-center rounded-full bg-[var(--color-page-quiet)] text-[0.76rem] font-[820] text-[var(--color-ink-muted)]">
                  {index + 1}
                </span>
                <span className="text-[0.9rem] font-[720] leading-6 text-[var(--color-ink-soft)]">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid gap-2">
          <span className="text-[0.72rem] font-[820] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            After
          </span>
          <div className="relative overflow-hidden rounded-[1.15rem] border border-[oklch(82%_0.035_174)] bg-[var(--color-primary-soft)] p-5">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(90deg,transparent,oklch(100%_0_0_/_0.48))]" />
            <div className="relative flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[oklch(99%_0.004_232)] text-[var(--color-primary-strong)] shadow-[var(--shadow-sm)]">
                <WandSparkles size={20} />
              </span>
              <div>
                <p className="m-0 text-[1.35rem] font-[850] leading-tight text-[var(--color-ink)]">
                  One agent run
                </p>
                <p className="m-0 mt-1 text-[0.9rem] font-[650] text-[var(--color-ink-muted)]">
                  Prompt to production package, in one place.
                </p>
              </div>
            </div>
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
            <Link className="secondary-button min-h-10 px-3 text-[0.84rem]" to="/create">
              Start creating
            </Link>
          ) : showSignIn ? (
            <SignInButton mode="modal">
              <button className="secondary-button min-h-10 px-3 text-[0.84rem]" type="button">
                Sign in
              </button>
            </SignInButton>
          ) : null}
        </nav>
      </header>

      <section className="relative isolate overflow-hidden border-b border-[oklch(88%_0.014_232)]">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,oklch(88%_0.014_232)_1px,transparent_1px),linear-gradient(180deg,oklch(88%_0.014_232)_1px,transparent_1px)] bg-[size:4.5rem_4.5rem] opacity-65" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_50%_8%,oklch(91%_0.055_174),transparent_58%)]" />

        <div className="mx-auto grid w-[min(100%,88rem)] gap-10 px-4 pb-[clamp(4rem,8vw,7rem)] pt-[clamp(4rem,8vw,6.5rem)] sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[66rem] justify-items-center gap-5 text-center">
            <span className="animate-[ce-rise_560ms_cubic-bezier(0.16,1,0.3,1)_both] inline-flex items-center gap-2 rounded-full border border-[oklch(82%_0.035_174)] bg-[oklch(99%_0.004_232_/_0.72)] px-3 py-1 text-[0.78rem] font-[780] text-[var(--color-primary-strong)] shadow-[var(--shadow-sm)] backdrop-blur">
              <Sparkles size={14} />
              Content Engine
            </span>
            <h1 className="animate-[ce-rise_640ms_cubic-bezier(0.16,1,0.3,1)_80ms_both] m-0 max-w-[12ch] text-[clamp(3rem,6.4vw,6.4rem)] font-[850] leading-[0.9] tracking-[0] text-[var(--color-ink)]">
              Meet your AI Content Agent.
            </h1>
            <p className="animate-[ce-rise_700ms_cubic-bezier(0.16,1,0.3,1)_160ms_both] m-0 max-w-[34rem] text-[clamp(1.05rem,1.7vw,1.32rem)] font-[650] leading-[1.45] text-[var(--color-ink-soft)]">
              Describe your idea. The agent handles the rest.
            </p>
            <div className="animate-[ce-rise_740ms_cubic-bezier(0.16,1,0.3,1)_240ms_both] flex flex-wrap justify-center gap-3">
              <PrimaryCta isSignedIn={isSignedIn} />
            </div>
          </div>

          <div className="animate-[ce-rise_820ms_cubic-bezier(0.16,1,0.3,1)_320ms_both]">
            <AgentDemoVisual />
          </div>
        </div>
      </section>

      <section className="bg-[oklch(99%_0.004_232)] py-[clamp(4.5rem,8vw,7rem)]">
        <div className="mx-auto w-[min(100%,88rem)] px-4 sm:px-6 lg:px-8">
          <ToolHoppingVisual />
        </div>
      </section>

      <footer className="relative overflow-hidden bg-[oklch(19%_0.025_232)] text-[oklch(96%_0.008_232)]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(100%_0_0_/_0.08)_1px,transparent_1px),linear-gradient(180deg,oklch(100%_0_0_/_0.08)_1px,transparent_1px)] bg-[size:5rem_5rem] opacity-45" />
        <div className="relative mx-auto grid min-h-[26rem] w-[min(100%,88rem)] content-center justify-items-center gap-6 px-4 py-[clamp(5rem,9vw,8rem)] text-center sm:px-6 lg:px-8">
          <ContentEngineMark className="size-14 shadow-[0_24px_70px_oklch(0%_0_0_/_0.28)]" />
          <h2 className="m-0 max-w-[18ch] text-[clamp(2.6rem,5vw,5.2rem)] font-[850] leading-[0.9] tracking-[0]">
            Start with one idea.
          </h2>
          <p className="m-0 max-w-[30rem] text-[1.05rem] leading-7 text-[oklch(80%_0.018_232)]">
            Join the waitlist for early access to Content Engine.
          </p>
          {isSignedIn ? <PrimaryCta isSignedIn /> : <AccessRequestForm />}
        </div>
      </footer>
    </main>
  );
}

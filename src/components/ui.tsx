import { SignInButton, SignOutButton, useUser } from "@clerk/clerk-react";
import { CheckCircle2 } from "lucide-react";
import { Children, isValidElement, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CustomSelect, type CustomSelectOption } from "./CustomSelect";
import { ContentEngineMark } from "./BrandLogo";

export function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export function Panel({
  title,
  children,
  className,
  style,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={["panel", className].filter(Boolean).join(" ")} style={style}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function FormPanel({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form className="panel form-grid" onSubmit={onSubmit}>
      <h2>{title}</h2>
      {children}
    </form>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  className,
  textareaClassName,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  textareaClassName?: string;
  rows?: number;
}) {
  return (
    <label className={["field prompt-field", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <textarea
        className={textareaClassName}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement<{ children?: ReactNode; disabled?: boolean; value?: string | number }>)
    .map((child): CustomSelectOption => ({
      disabled: child.props.disabled,
      label: Children.toArray(child.props.children).join(""),
      value: String(child.props.value ?? ""),
    }));

  return (
    <div className="field">
      <span>{label}</span>
      <CustomSelect onChange={onChange} options={options} placeholder={label} value={value} />
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

export function ChecklistItem({ done = false, label }: { done?: boolean; label: string }) {
  return (
    <div className="check-item">
      <CheckCircle2 size={16} className={done ? "done" : ""} />
      <span>{label}</span>
    </div>
  );
}

export function EntityGrid({
  empty,
  items,
}: {
  empty: string;
  items?: Array<{
    id: string;
    title: string;
    eyebrow: string;
    body: string;
    meta: string;
  }>;
}) {
  if (!items) return <LoadingState title="Loading" compact />;
  if (items.length === 0) return <div className="empty-state">{empty}</div>;

  return (
    <div className="entity-grid">
      {items.map((item) => (
        <article className="entity-card" key={item.id}>
          <div className="entity-eyebrow">{item.eyebrow}</div>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <span>{item.meta}</span>
        </article>
      ))}
    </div>
  );
}

type LoadingSize = "sm" | "md" | "lg";

const loadingSignalSizes: Record<LoadingSize, string> = {
  sm: "size-4",
  md: "size-6",
  lg: "size-9",
};

export function LoadingSignal({
  className,
  label = "Loading",
  showLabel = false,
  size = "md",
}: {
  className?: string;
  label?: string;
  showLabel?: boolean;
  size?: LoadingSize;
}) {
  return (
    <span
      aria-label={label}
      className={[
        "inline-flex min-w-0 items-center gap-[var(--space-2)] text-current",
        className,
      ].filter(Boolean).join(" ")}
      role="status"
    >
      <svg
        aria-hidden="true"
        className={`${loadingSignalSizes[size]} shrink-0 overflow-visible`}
        fill="none"
        viewBox="0 0 48 48"
      >
        <path
          d="M8 25.5C14.5 16 21 16 27.5 25.5C31.8 31.8 36.2 33.6 40 27.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
          opacity="0.22"
        />
        <path
          d="M8 25.5C14.5 16 21 16 27.5 25.5C31.8 31.8 36.2 33.6 40 27.5"
          stroke="currentColor"
          strokeDasharray="18 56"
          strokeLinecap="round"
          strokeWidth="4"
        >
          <animate
            attributeName="stroke-dashoffset"
            dur="1.35s"
            repeatCount="indefinite"
            values="74;0"
          />
        </path>
        {[8, 24, 40].map((cx, index) => (
          <circle cx={cx} cy={index === 1 ? 20 : 27.5} fill="currentColor" key={cx} r="3.5">
            <animate
              attributeName="opacity"
              dur="1.35s"
              repeatCount="indefinite"
              values="0.28;1;0.28"
              begin={`${index * 0.18}s`}
            />
            <animate
              attributeName="r"
              dur="1.35s"
              repeatCount="indefinite"
              values="2.8;4.4;2.8"
              begin={`${index * 0.18}s`}
            />
          </circle>
        ))}
      </svg>
      {showLabel ? <span className="truncate">{label}</span> : null}
    </span>
  );
}

export function LoadingState({
  className,
  compact = false,
  detail,
  title = "Loading",
}: {
  className?: string;
  compact?: boolean;
  detail?: string;
  title?: string;
}) {
  return (
    <div
      aria-busy="true"
      className={[
        "grid place-items-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-page-quiet)] text-center",
        compact ? "min-h-[5.5rem] p-[var(--space-3)]" : "min-h-[12rem] p-[var(--space-6)]",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="grid max-w-[22rem] justify-items-center gap-[var(--space-3)]">
        <LoadingSignal className="text-[var(--color-primary)]" label={title} size={compact ? "md" : "lg"} />
        <div className="grid gap-[var(--space-1)]">
          <strong className="text-[0.9rem] font-[780] text-[var(--color-ink)]">{title}</strong>
          {detail ? (
            <p className="m-0 text-[0.8rem] leading-[1.45] text-[var(--color-ink-muted)]">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function GenerationLoadingState({
  className,
  detail,
  steps = ["Preparing context", "Running model", "Packaging output"],
  title = "Generating",
}: {
  className?: string;
  detail?: string;
  steps?: string[];
  title?: string;
}) {
  return (
    <div
      aria-busy="true"
      className={[
        "grid min-h-[16rem] content-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[linear-gradient(135deg,var(--color-page),var(--color-page-quiet))] p-[var(--space-4)]",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="mx-auto grid w-full max-w-[24rem] gap-[var(--space-4)]">
        <div className="grid justify-items-center gap-[var(--space-3)] text-center">
          <div className="grid size-16 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[var(--shadow-sm)]">
            <LoadingSignal label={title} size="lg" />
          </div>
          <div className="grid gap-[var(--space-1)]">
            <strong className="text-[1rem] font-[820] text-[var(--color-ink)]">{title}</strong>
            {detail ? (
              <p className="m-0 text-[0.82rem] leading-[1.45] text-[var(--color-ink-muted)]">
                {detail}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-[var(--space-2)]">
          {steps.map((step, index) => (
            <div
              className="grid grid-cols-[1.4rem_minmax(0,1fr)] items-center gap-[var(--space-2)] text-[0.76rem] font-[720] text-[var(--color-ink-soft)]"
              key={step}
            >
              <span
                className="grid size-5 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[0.64rem] text-[var(--color-primary)]"
                aria-hidden="true"
              >
                <span className="animate-pulse">{index + 1}</span>
              </span>
              <span className="truncate">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="center-screen" aria-busy="true">
      <LoadingState
        className="w-[min(100%,24rem)] border-solid bg-[var(--color-surface)]"
        detail="Preparing your workspace."
        title="Preparing Content Engine"
      />
    </div>
  );
}

export function SignInScreen() {
  return (
    <div className="signin-screen">
      <div className="signin-copy">
        <ContentEngineMark className="size-12" />
        <h1>Content Engine</h1>
        <p>Create reviewable content and run repeatable publishing automations from one focused workspace.</p>
        <SignInButton mode="modal">
          <button className="primary-button" type="button">
            Sign in
          </button>
        </SignInButton>
      </div>
    </div>
  );
}

export function PrivateBetaScreen() {
  const { user } = useUser();

  return (
    <div className="signin-screen">
      <div className="signin-copy">
        <ContentEngineMark className="size-12" />
        <h1>Private beta</h1>
        <p>
          Content Engine is invite-only right now. We have your request and will open access as
          soon as your workspace is approved.
        </p>
        <p className="muted">
          Signed in as {user?.primaryEmailAddress?.emailAddress ?? "this account"}.
        </p>
        <SignOutButton signOutOptions={{ redirectUrl: "/" }}>
          <button className="secondary-button" type="button">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}

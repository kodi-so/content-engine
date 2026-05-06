import { SignInButton } from "@clerk/clerk-react";
import { CheckCircle2, BrainCircuit } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

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

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
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
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
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
  if (!items) return <div className="empty-state">Loading...</div>;
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

export function LoadingScreen() {
  return (
    <div className="center-screen">
      <span className="loader">Preparing Content Engine...</span>
    </div>
  );
}

export function SignInScreen() {
  return (
    <div className="signin-screen">
      <div className="signin-copy">
        <BrainCircuit size={34} />
        <h1>Content Engine</h1>
        <p>Define brand memory, create reviewable content, and run repeatable publishing workflows from one focused workspace.</p>
        <SignInButton mode="modal">
          <button className="primary-button" type="button">
            Sign in
          </button>
        </SignInButton>
      </div>
    </div>
  );
}

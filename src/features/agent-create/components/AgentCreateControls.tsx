import { Bug, Plus, Zap } from "lucide-react";
import type { AgentCreateCheckpointMode } from "../model/agentCreateTypes";
import { agentCreateClassNames } from "../model/agentCreateUi";

export function DebugModeToggle({
  checkpointMode,
  disabled = false,
  onChange,
}: {
  checkpointMode: AgentCreateCheckpointMode;
  disabled?: boolean;
  onChange: (mode: AgentCreateCheckpointMode) => void;
}) {
  const debugEnabled = checkpointMode === "debug";

  return (
    <button
      aria-checked={debugEnabled}
      className={agentCreateClassNames(
        "inline-flex min-h-10 items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border px-[var(--space-3)] text-[0.82rem] font-[760] transition disabled:cursor-not-allowed disabled:opacity-55",
        debugEnabled
          ? "border-[oklch(70%_0.105_155_/_0.5)] bg-[oklch(94%_0.045_155)] text-[oklch(34%_0.105_155)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-accent)]"
      )}
      disabled={disabled}
      onClick={() => onChange(debugEnabled ? "auto" : "debug")}
      role="switch"
      type="button"
    >
      {debugEnabled ? <Bug size={16} /> : <Zap size={16} />}
      Debug Mode
      <span
        aria-hidden="true"
        className={agentCreateClassNames(
          "relative h-5 w-9 rounded-full border transition",
          debugEnabled
            ? "border-[oklch(54%_0.11_155)] bg-[oklch(50%_0.12_155)]"
            : "border-[var(--color-border)] bg-[var(--color-page)]"
        )}
      >
        <span
          className={agentCreateClassNames(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgb(15_23_42_/_0.2)] transition",
            debugEnabled ? "left-[1.05rem]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

export function NewChatButton({
  disabled = false,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="secondary-button" disabled={disabled} onClick={onClick} type="button">
      <Plus size={16} />
      New Chat
    </button>
  );
}

import { useAction, useMutation, useQuery } from "convex/react";
import {
  Bot,
  Check,
  ExternalLink,
  Pause,
  Play,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CustomSelect } from "../components/CustomSelect";
import { Field, LoadingState, Page, TextArea } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import {
  rosterModelById,
  rosterModelsForMode,
  rosterOptionsForModel,
} from "../lib/generation/modelRoster";
import { resolveAiGenerationSettings } from "../lib/providers/aiGenerationDefaults";

type AutomationRow = NonNullable<ReturnType<typeof useQuery<typeof api.automations.automations.list>>>[number];
type RunsResult = NonNullable<ReturnType<typeof useQuery<typeof api.automations.automations.listRuns>>>;
type RunItem = RunsResult["runs"][number];

type PostingTimeDraft = { dayOfWeek: number; hour: number; minute: number };

type AutomationDraft = {
  name: string;
  brief: string;
  pillars: string[];
  formatMix: string;
  timezone: string;
  postingTimes: PostingTimeDraft[];
  approvalMode: "require_approval" | "auto_publish";
  socialAccountIds: string[];
  aspectRatio: string;
  imageModel: string;
  imageResolution: string;
  videoModel: string;
  maxUsdPerRun: string;
  maxUsdPerMonth: string;
};

const dayOptions = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

const aspectRatioOptions = [
  { value: "", label: "Default (9:16)" },
  { value: "9:16", label: "9:16" },
  { value: "4:5", label: "4:5" },
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
];

const commonTimezones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

function emptyDraft(): AutomationDraft {
  return {
    name: "",
    brief: "",
    pillars: [],
    formatMix: "mostly slideshows",
    timezone: browserTimezone(),
    postingTimes: [{ dayOfWeek: 1, hour: 9, minute: 0 }],
    approvalMode: "require_approval",
    socialAccountIds: [],
    aspectRatio: "",
    imageModel: "",
    imageResolution: "",
    videoModel: "",
    maxUsdPerRun: "",
    maxUsdPerMonth: "",
  };
}

function draftFromAutomation(automation: AutomationRow): AutomationDraft {
  return {
    name: automation.name,
    brief: automation.brief,
    pillars: [...automation.pillars],
    formatMix: automation.formatMix ?? "",
    timezone: automation.scheduleConfig.timezone || browserTimezone(),
    postingTimes: automation.scheduleConfig.postingTimes.map((time) => ({
      dayOfWeek: time.dayOfWeek ?? 1,
      hour: time.hour,
      minute: time.minute,
    })),
    approvalMode: automation.approvalMode,
    socialAccountIds: automation.socialAccountIds.map(String),
    aspectRatio: automation.generationDefaults?.aspectRatio ?? "",
    imageModel: automation.generationDefaults?.imageModel ?? "",
    imageResolution: automation.generationDefaults?.imageResolution ?? "",
    videoModel: automation.generationDefaults?.videoModel ?? "",
    maxUsdPerRun: automation.budget?.maxUsdPerRun !== undefined ? String(automation.budget.maxUsdPerRun) : "",
    maxUsdPerMonth: automation.budget?.maxUsdPerMonth !== undefined ? String(automation.budget.maxUsdPerMonth) : "",
  };
}

function draftSnapshot(draft: AutomationDraft) {
  return JSON.stringify(draft);
}

function timeInputValue(time: PostingTimeDraft) {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

function formatClock(hour: number, minute: number, timezone: string) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date) + ` ${shortTimezone(timezone)}`;
  } catch {
    return `${hour}:${String(minute).padStart(2, "0")}`;
  }
}

function shortTimezone(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timezone;
  } catch {
    return timezone;
  }
}

function scheduleSummary(automation: AutomationRow) {
  const times = automation.scheduleConfig.postingTimes;
  if (!times.length) return "No schedule";
  const timezone = automation.scheduleConfig.timezone || "America/Chicago";
  const uniqueClocks = new Set(times.map((time) => `${time.hour}:${time.minute}`));
  const dayLabel = (dayOfWeek?: number) =>
    dayOptions.find((day) => day.value === String(dayOfWeek ?? 1))?.label ?? "Mon";
  if (uniqueClocks.size === 1) {
    const days = times.map((time) => dayLabel(time.dayOfWeek)).join("/");
    return `${days} · ${formatClock(times[0].hour, times[0].minute, timezone)}`;
  }
  return times
    .map((time) => `${dayLabel(time.dayOfWeek)} ${formatClock(time.hour, time.minute, timezone)}`)
    .join(", ");
}

function formatRunDate(timestamp: number, timezone?: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function nextRunLabel(automation: AutomationRow) {
  if (!automation.isActive || !automation.nextRunAt) return null;
  return `Next: ${formatRunDate(automation.nextRunAt, automation.scheduleConfig.timezone)}`;
}

function statusClass(status: string) {
  if (status === "published") return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-rose-100 text-rose-800";
  if (status === "awaiting_approval") return "bg-amber-100 text-amber-800";
  return "bg-[var(--color-page)] text-[var(--color-ink-muted)]";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid gap-1 border-t border-[var(--color-border)] pt-[var(--space-4)]">
      <h3 className="m-0 text-[0.95rem] font-[820] text-[var(--color-ink)]">{title}</h3>
      {hint ? <p className="m-0 text-[0.78rem] leading-snug text-[var(--color-ink-muted)]">{hint}</p> : null}
    </div>
  );
}

function PillarsInput({
  pillars,
  onChange,
}: {
  pillars: string[];
  onChange: (pillars: string[]) => void;
}) {
  const [pending, setPending] = useState("");
  const addPending = () => {
    const value = pending.trim().replace(/,+$/, "");
    if (value && !pillars.includes(value)) onChange([...pillars, value]);
    setPending("");
  };
  return (
    <div className="field">
      <span>Pillars</span>
      <div className="flex flex-wrap items-center gap-[var(--space-1)] rounded border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1.5">
        {pillars.map((pillar) => (
          <span
            className="flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[0.78rem] font-[700] text-[var(--color-ink)]"
            key={pillar}
          >
            {pillar}
            <button
              aria-label={`Remove ${pillar}`}
              className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              onClick={() => onChange(pillars.filter((item) => item !== pillar))}
              type="button"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[10rem] flex-1 border-0 bg-transparent text-[0.86rem] outline-none"
          onBlur={addPending}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addPending();
            }
          }}
          placeholder={pillars.length ? "Add pillar" : "ab exercises, posture tips, myth-busting"}
          value={pending}
        />
      </div>
    </div>
  );
}

function ApprovalModeControl({
  value,
  onChange,
}: {
  value: AutomationDraft["approvalMode"];
  onChange: (value: AutomationDraft["approvalMode"]) => void;
}) {
  const options: Array<{
    value: AutomationDraft["approvalMode"];
    title: string;
    description: string;
  }> = [
    {
      value: "require_approval",
      title: "Require approval",
      description: "Runs stop at a draft post. You approve from this screen.",
    },
    {
      value: "auto_publish",
      title: "Auto publish",
      description: "Posts go out without review.",
    },
  ];
  return (
    <div className="grid gap-[var(--space-2)]">
      <div className="grid gap-[var(--space-2)] sm:grid-cols-2">
        {options.map((option) => (
          <button
            className={[
              "grid gap-1 rounded border p-[var(--space-3)] text-left",
              value === option.value
                ? "border-[var(--color-accent)] bg-[var(--color-page)]"
                : "border-[var(--color-border)]",
            ].join(" ")}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <strong className="text-[0.88rem] text-[var(--color-ink)]">{option.title}</strong>
            <span className="text-[0.76rem] leading-snug text-[var(--color-ink-muted)]">{option.description}</span>
          </button>
        ))}
      </div>
      {value === "auto_publish" ? (
        <p className="m-0 rounded bg-amber-50 px-3 py-2 text-[0.78rem] text-amber-800">
          Auto publish posts without any review. Make sure the brief and guardrails are solid first.
        </p>
      ) : null}
    </div>
  );
}

function RunLinks({ run }: { run: RunItem }) {
  const externalUrl = run.plan?.externalPostIds?.find((value) => value.startsWith("http"));
  return (
    <span className="flex items-center gap-[var(--space-2)]">
      {run.createThreadId ? (
        <a
          className="flex items-center gap-1 text-[0.76rem] font-[700] text-[var(--color-accent)]"
          href={`/create?threadId=${run.createThreadId}`}
        >
          Thread
        </a>
      ) : null}
      {externalUrl ? (
        <a
          className="flex items-center gap-1 text-[0.76rem] font-[700] text-[var(--color-accent)]"
          href={externalUrl}
          rel="noreferrer"
          target="_blank"
        >
          Post <ExternalLink size={11} />
        </a>
      ) : null}
    </span>
  );
}

function RunMediaPreview({ run }: { run: RunItem }) {
  const previews = run.plan?.artifactPreviews ?? [];
  if (!previews.length) return null;
  return (
    <span className="flex gap-[var(--space-1)]">
      {previews.map((preview) =>
        preview.storageUrl ? (
          preview.mimeType?.startsWith("video/") ? (
            <video
              className="h-14 w-10 rounded object-cover"
              key={String(preview.artifactId)}
              muted
              src={preview.storageUrl}
            />
          ) : (
            <img
              alt={preview.title ?? "Post media"}
              className="h-14 w-10 rounded object-cover"
              key={String(preview.artifactId)}
              src={preview.storageUrl}
            />
          )
        ) : null
      )}
    </span>
  );
}

export function AutomationsPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const automations = useQuery(api.automations.automations.list, workspaceArgs);
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const createAutomation = useMutation(api.automations.automations.create);
  const updateAutomation = useMutation(api.automations.automations.update);
  const setAutomationActive = useMutation(api.automations.automations.setActive);
  const runAutomationNow = useMutation(api.automations.automations.runNow);
  const removeAutomation = useMutation(api.automations.automations.remove);
  const rejectRun = useMutation(api.automations.automations.rejectRun);
  const approveRun = useAction(api.automations.automations.approveRun);
  const submitAgentMessage = useMutation(api.create.agent.submit);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AutomationDraft>(emptyDraft);
  const [savedSnapshot, setSavedSnapshot] = useState(() => draftSnapshot(emptyDraft()));
  const [runsLimit, setRunsLimit] = useState(10);
  const [status, setStatus] = useState("");
  const [busyRunId, setBusyRunId] = useState<string | null>(null);

  const selected = useMemo(
    () => automations?.find((automation) => String(automation._id) === selectedId) ?? null,
    [automations, selectedId]
  );
  const runsResult = useQuery(
    api.automations.automations.listRuns,
    selected ? { automationId: selected._id, limit: runsLimit } : "skip"
  );
  const isDirty = draftSnapshot(draft) !== savedSnapshot;

  const workspaceSettings = resolveAiGenerationSettings(activeWorkspace?.aiGenerationSettings ?? null);
  const effectiveImageModel = rosterModelById(draft.imageModel || workspaceSettings.imageModel);
  const resolutionOption = effectiveImageModel
    ? rosterOptionsForModel(effectiveImageModel).resolution
    : undefined;
  const resolutionValues = resolutionOption?.kind === "enum" ? resolutionOption.values : [];

  const timezoneOptions = useMemo(() => {
    const zones = new Set([browserTimezone(), ...commonTimezones, draft.timezone]);
    return [...zones].sort().map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));
  }, [draft.timezone]);

  const patchDraft = (patch: Partial<AutomationDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const confirmDiscard = () =>
    !isDirty || window.confirm("Discard unsaved changes on this automation?");

  const selectDraft = () => {
    if (!confirmDiscard()) return;
    const next = emptyDraft();
    setSelectedId(null);
    setDraft(next);
    setSavedSnapshot(draftSnapshot(next));
    setRunsLimit(10);
    setStatus("");
  };

  const selectAutomation = (automation: AutomationRow) => {
    if (String(automation._id) === selectedId) return;
    if (!confirmDiscard()) return;
    const next = draftFromAutomation(automation);
    setSelectedId(String(automation._id));
    setDraft(next);
    setSavedSnapshot(draftSnapshot(next));
    setRunsLimit(10);
    setStatus("");
  };

  const canActivate = draft.socialAccountIds.length > 0 && draft.postingTimes.length > 0;

  const savePayload = () => ({
    socialAccountIds: draft.socialAccountIds as Id<"socialAccounts">[],
    name: draft.name.trim(),
    brief: draft.brief.trim(),
    pillars: draft.pillars,
    formatMix: draft.formatMix.trim() || undefined,
    scheduleConfig: {
      timezone: draft.timezone,
      postingTimes: draft.postingTimes.map((time) => ({
        dayOfWeek: time.dayOfWeek,
        hour: time.hour,
        minute: time.minute,
      })),
    },
    approvalMode: draft.approvalMode,
    generationDefaults: {
      imageResolution: draft.imageResolution || undefined,
      aspectRatio: draft.aspectRatio || undefined,
      imageModel: draft.imageModel || undefined,
      videoModel: draft.videoModel || undefined,
    },
    budget: {
      maxUsdPerRun: draft.maxUsdPerRun.trim() ? Number(draft.maxUsdPerRun) : undefined,
      maxUsdPerMonth: draft.maxUsdPerMonth.trim() ? Number(draft.maxUsdPerMonth) : undefined,
    },
  });

  const saveAutomation = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.brief.trim()) {
      setStatus("Name and brief are required.");
      return;
    }
    if (
      (draft.maxUsdPerRun.trim() && !Number.isFinite(Number(draft.maxUsdPerRun))) ||
      (draft.maxUsdPerMonth.trim() && !Number.isFinite(Number(draft.maxUsdPerMonth)))
    ) {
      setStatus("Budget limits must be numbers.");
      return;
    }
    setStatus(selectedId ? "Saving automation..." : "Creating automation...");
    try {
      if (selectedId) {
        await updateAutomation({ id: selectedId as Id<"automations">, ...savePayload() });
      } else {
        const id = await createAutomation({
          workspaceId: activeWorkspaceId,
          ...savePayload(),
        });
        setSelectedId(String(id));
      }
      setSavedSnapshot(draftSnapshot(draft));
      setStatus("Automation saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Automation save failed.");
    }
  };

  const manageInChat = async () => {
    if (!selected || !activeWorkspaceId) return;
    const result = await submitAgentMessage({
      workspaceId: activeWorkspaceId,
      checkpointMode: "auto",
      content: `Manage automation automation:${String(selected._id)} ("${selected.name}"). Current brief: ${selected.brief}`,
    });
    window.location.href = `/create?threadId=${result.threadId}`;
  };

  const handleRunNow = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      "Run this automation once now? It picks a topic and creates one post immediately. Approval mode still applies."
    );
    if (!confirmed) return;
    setStatus("Starting run...");
    try {
      await runAutomationNow({ id: selected._id });
      setStatus("Run started. It will appear in run history below.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Run failed to start.");
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete automation "${selected.name}" and its run history? This cannot be undone.`
    );
    if (!confirmed) return;
    await removeAutomation({ id: selected._id });
    selectDraft();
  };

  const handleApprove = async (run: RunItem) => {
    setBusyRunId(String(run._id));
    setStatus("Publishing approved post...");
    try {
      await approveRun({ runId: run._id });
      setStatus("Post published.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Publishing failed.");
    } finally {
      setBusyRunId(null);
    }
  };

  const handleReject = async (run: RunItem) => {
    setBusyRunId(String(run._id));
    try {
      await rejectRun({ runId: run._id });
      setStatus("Run rejected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reject failed.");
    } finally {
      setBusyRunId(null);
    }
  };

  const pendingRuns = (runsResult?.runs ?? []).filter((run) => run.status === "awaiting_approval");
  const historyRuns = runsResult?.runs ?? [];

  let headerPill: ReactNode = null;
  if (!selectedId) {
    headerPill = <span className="rounded-full bg-[var(--color-page)] px-2 py-0.5 text-[0.72rem] font-[780] text-[var(--color-ink-muted)]">Draft</span>;
  } else if (selected) {
    headerPill = (
      <span
        className={`rounded-full px-2 py-0.5 text-[0.72rem] font-[780] ${
          selected.isActive ? "bg-emerald-100 text-emerald-800" : "bg-[var(--color-page)] text-[var(--color-ink-muted)]"
        }`}
      >
        {selected.isActive ? "Active" : "Paused"}
      </span>
    );
  }

  return (
    <Page
      title="Automations"
      description={`Recurring agent-managed content for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <div className="grid min-w-0 gap-[var(--space-5)] xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <section className="grid content-start gap-[var(--space-3)] border-y border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]">
          <div className="flex items-center justify-between gap-[var(--space-3)]">
            <div className="grid gap-1">
              <h2 className="m-0 text-[1rem] font-[820] text-[var(--color-ink)]">Automations</h2>
              <p className="m-0 text-[0.76rem] leading-snug text-[var(--color-ink-muted)]">
                Recurring content briefs that the agent runs on a schedule.
              </p>
            </div>
            <button className="secondary-button" onClick={selectDraft} type="button">
              <Plus size={16} />
              New
            </button>
          </div>
          {!automations ? <LoadingState title="Loading automations" compact /> : null}
          {automations?.length === 0 ? (
            <div className="grid gap-[var(--space-2)]">
              <p className="m-0 text-[0.86rem] text-[var(--color-ink-muted)]">
                No automations yet. Describe a recurring content series and let the agent run it.
              </p>
            </div>
          ) : null}
          {automations?.map((automation) => (
            <button
              className={[
                "grid gap-[var(--space-2)] border-l-2 px-[var(--space-3)] py-[var(--space-2)] text-left",
                selected?._id === automation._id
                  ? "border-[var(--color-accent)] bg-[var(--color-page)]"
                  : "border-transparent",
              ].join(" ")}
              key={automation._id}
              onClick={() => selectAutomation(automation)}
              type="button"
            >
              <span className="flex items-center justify-between gap-[var(--space-2)]">
                <strong className="flex items-center gap-2 text-[0.92rem] text-[var(--color-ink)]">
                  {automation.name}
                  {automation.pendingApprovalCount > 0 ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.66rem] font-[800] text-amber-800">
                      {automation.pendingApprovalCount} pending
                    </span>
                  ) : null}
                </strong>
                <span className="text-[0.72rem] font-[780] text-[var(--color-ink-muted)]">
                  {automation.isActive ? "Active" : "Paused"}
                </span>
              </span>
              <span className="text-[0.76rem] text-[var(--color-ink-muted)]">{scheduleSummary(automation)}</span>
              {nextRunLabel(automation) ? (
                <span className="text-[0.72rem] text-[var(--color-ink-muted)]">{nextRunLabel(automation)}</span>
              ) : null}
              <span className="flex flex-wrap gap-[var(--space-1)]">
                {automation.recentRuns.map((run) => (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.68rem] font-[760] ${statusClass(run.status)}`}
                    key={run._id}
                  >
                    {statusLabel(run.status)}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </section>

        <form
          className="grid min-w-0 content-start gap-[var(--space-4)] border-y border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]"
          onSubmit={saveAutomation}
        >
          <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
            <div className="grid gap-1">
              <div className="entity-eyebrow">Automation detail</div>
              <h2 className="m-0 flex items-center gap-2 text-[1.1rem] font-[820] text-[var(--color-ink)]">
                {selectedId ? draft.name || "Edit automation" : "New automation"}
                {headerPill}
                {isDirty ? (
                  <span className="text-[0.72rem] font-[700] text-amber-700">Unsaved changes</span>
                ) : null}
              </h2>
            </div>
            <div className="flex flex-wrap gap-[var(--space-2)]">
              {selected ? (
                <button
                  className="secondary-button"
                  disabled={!selected.isActive && !canActivate}
                  onClick={() => void setAutomationActive({ id: selected._id, isActive: !selected.isActive })}
                  title={
                    !selected.isActive && !canActivate
                      ? "Add at least one account and one posting time before activating."
                      : undefined
                  }
                  type="button"
                >
                  {selected.isActive ? <Pause size={16} /> : <Play size={16} />}
                  {selected.isActive ? "Pause" : "Activate"}
                </button>
              ) : null}
              {selected ? (
                <button className="secondary-button" onClick={() => void handleRunNow()} type="button">
                  <Zap size={16} />
                  Run now
                </button>
              ) : null}
              {selected ? (
                <button className="secondary-button" onClick={() => void manageInChat()} type="button">
                  <Bot size={16} />
                  Manage in chat
                </button>
              ) : null}
              {selected ? (
                <button
                  className="secondary-button text-rose-700"
                  onClick={() => void handleDelete()}
                  type="button"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-[var(--space-3)] lg:grid-cols-2">
            <Field label="Name" onChange={(value) => patchDraft({ name: value })} placeholder="Pilates education series" value={draft.name} />
            <Field
              label="Format mix"
              onChange={(value) => patchDraft({ formatMix: value })}
              placeholder="mostly slideshows, occasional video"
              value={draft.formatMix}
            />
          </div>
          <TextArea
            label="Brief"
            onChange={(value) => patchDraft({ brief: value })}
            placeholder="Audience, voice, themes, guardrails, and output style. The agent reads this every run."
            rows={7}
            value={draft.brief}
          />
          <PillarsInput onChange={(pillars) => patchDraft({ pillars })} pillars={draft.pillars} />

          <SectionHeading title="Accounts & publishing" />
          <div className="grid gap-[var(--space-2)]">
            <span className="text-[0.8rem] font-[760] text-[var(--color-ink)]">Social accounts</span>
            {!accounts?.length ? (
              <p className="m-0 text-[0.8rem] text-[var(--color-ink-muted)]">
                No connected accounts. Connect an account in Accounts before activating an automation.
              </p>
            ) : (
              <div className="grid gap-[var(--space-1)]">
                {accounts.map((account) => {
                  const id = String(account._id);
                  const checked = draft.socialAccountIds.includes(id);
                  return (
                    <label
                      className="flex items-center gap-[var(--space-2)] rounded border border-[var(--color-border)] px-3 py-2 text-[0.86rem]"
                      key={id}
                    >
                      <input
                        checked={checked}
                        onChange={() =>
                          patchDraft({
                            socialAccountIds: checked
                              ? draft.socialAccountIds.filter((value) => value !== id)
                              : [...draft.socialAccountIds, id],
                          })
                        }
                        type="checkbox"
                      />
                      <span className="font-[740] capitalize text-[var(--color-ink)]">{account.platform}</span>
                      <span className="text-[var(--color-ink-muted)]">@{account.username}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <ApprovalModeControl onChange={(approvalMode) => patchDraft({ approvalMode })} value={draft.approvalMode} />

          <SectionHeading title="Schedule" />
          <div className="grid gap-[var(--space-3)] lg:grid-cols-2">
            <div className="field">
              <span>Timezone</span>
              <CustomSelect
                onChange={(timezone) => patchDraft({ timezone })}
                options={timezoneOptions}
                placeholder="Timezone"
                value={draft.timezone}
              />
            </div>
          </div>
          <div className="grid gap-[var(--space-2)]">
            <span className="text-[0.8rem] font-[760] text-[var(--color-ink)]">Posting times</span>
            {draft.postingTimes.map((time, index) => (
              <div className="flex flex-wrap items-center gap-[var(--space-2)]" key={index}>
                <CustomSelect
                  onChange={(value) => {
                    const next = [...draft.postingTimes];
                    next[index] = { ...next[index], dayOfWeek: Number(value) };
                    patchDraft({ postingTimes: next });
                  }}
                  options={dayOptions}
                  placeholder="Day"
                  value={String(time.dayOfWeek)}
                />
                <input
                  className="rounded border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1.5 text-[0.86rem]"
                  onChange={(event) => {
                    const [hour, minute] = event.target.value.split(":").map(Number);
                    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
                    const next = [...draft.postingTimes];
                    next[index] = { ...next[index], hour, minute };
                    patchDraft({ postingTimes: next });
                  }}
                  type="time"
                  value={timeInputValue(time)}
                />
                <button
                  aria-label="Remove posting time"
                  className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  disabled={draft.postingTimes.length <= 1}
                  onClick={() =>
                    patchDraft({ postingTimes: draft.postingTimes.filter((_, i) => i !== index) })
                  }
                  type="button"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <div>
              <button
                className="secondary-button"
                onClick={() =>
                  patchDraft({
                    postingTimes: [...draft.postingTimes, { dayOfWeek: 1, hour: 9, minute: 0 }],
                  })
                }
                type="button"
              >
                <Plus size={14} />
                Add time
              </button>
            </div>
            {selected?.nextRunAt && selected.isActive ? (
              <p className="m-0 text-[0.78rem] text-[var(--color-ink-muted)]">
                Next run: {formatRunDate(selected.nextRunAt, selected.scheduleConfig.timezone)}
                {isDirty ? " (save to update)" : ""}
              </p>
            ) : null}
          </div>

          <SectionHeading
            hint="Overrides workspace defaults for this automation's runs. The agent can still deviate when a specific request calls for it."
            title="Generation defaults"
          />
          <div className="grid gap-[var(--space-3)] lg:grid-cols-4">
            <div className="field">
              <span>Aspect ratio</span>
              <CustomSelect
                onChange={(aspectRatio) => patchDraft({ aspectRatio })}
                options={aspectRatioOptions}
                placeholder="Aspect ratio"
                value={draft.aspectRatio}
              />
            </div>
            <div className="field">
              <span>Image model</span>
              <CustomSelect
                onChange={(imageModel) => patchDraft({ imageModel, imageResolution: "" })}
                options={[
                  { value: "", label: "Workspace default" },
                  ...rosterModelsForMode("image").map((model) => ({ value: model.id, label: model.label })),
                ]}
                placeholder="Image model"
                value={draft.imageModel}
              />
            </div>
            {resolutionValues.length ? (
              <div className="field">
                <span>Image resolution</span>
                <CustomSelect
                  onChange={(imageResolution) => patchDraft({ imageResolution })}
                  options={[
                    { value: "", label: "Workspace default" },
                    ...resolutionValues.map((value) => ({ value, label: value })),
                  ]}
                  placeholder="Resolution"
                  value={draft.imageResolution}
                />
              </div>
            ) : null}
            <div className="field">
              <span>Video model</span>
              <CustomSelect
                onChange={(videoModel) => patchDraft({ videoModel })}
                options={[
                  { value: "", label: "Workspace default" },
                  ...rosterModelsForMode("video").map((model) => ({ value: model.id, label: model.label })),
                ]}
                placeholder="Video model"
                value={draft.videoModel}
              />
            </div>
          </div>

          <SectionHeading title="Guardrails" />
          <div className="grid gap-[var(--space-3)] lg:grid-cols-3">
            <Field
              label="Max cost per run (USD)"
              onChange={(value) => patchDraft({ maxUsdPerRun: value })}
              placeholder="e.g. 2.00"
              value={draft.maxUsdPerRun}
            />
            <Field
              label="Max cost per month (USD)"
              onChange={(value) => patchDraft({ maxUsdPerMonth: value })}
              placeholder="e.g. 30.00"
              value={draft.maxUsdPerMonth}
            />
            {selected ? (
              <div className="field">
                <span>Month-to-date spend</span>
                <p className="m-0 py-1.5 text-[0.9rem] font-[740] text-[var(--color-ink)]">
                  ${selected.monthToDateSpendUsd.toFixed(2)}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-[var(--space-3)]">
            <button className="primary-button" type="submit">
              <Check size={16} />
              Save automation
            </button>
            {status ? <p className="m-0 text-[0.84rem] text-[var(--color-ink-muted)]">{status}</p> : null}
          </div>

          {selected ? (
            <>
              <SectionHeading title="Runs & approvals" />
              {pendingRuns.length ? (
                <div className="grid gap-[var(--space-2)] rounded border border-amber-200 bg-amber-50 p-[var(--space-3)]">
                  <strong className="text-[0.86rem] text-amber-900">
                    Pending approval ({pendingRuns.length})
                  </strong>
                  {pendingRuns.map((run) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-[var(--space-3)] rounded bg-[var(--color-surface)] p-[var(--space-3)]"
                      key={run._id}
                    >
                      <div className="flex items-center gap-[var(--space-3)]">
                        <RunMediaPreview run={run} />
                        <div className="grid gap-1">
                          <strong className="text-[0.88rem] text-[var(--color-ink)]">{run.topic}</strong>
                          <span className="text-[0.74rem] text-[var(--color-ink-muted)]">
                            {formatRunDate(run.startedAt)}
                            {run.plan?.caption ? ` · ${run.plan.caption.slice(0, 80)}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-[var(--space-2)]">
                        <button
                          className="primary-button"
                          disabled={busyRunId === String(run._id)}
                          onClick={() => void handleApprove(run)}
                          type="button"
                        >
                          Approve & publish
                        </button>
                        {run.createThreadId ? (
                          <a className="secondary-button" href={`/create?threadId=${run.createThreadId}`}>
                            Open in chat
                          </a>
                        ) : null}
                        <button
                          className="secondary-button"
                          disabled={busyRunId === String(run._id)}
                          onClick={() => void handleReject(run)}
                          type="button"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!historyRuns.length ? (
                <p className="m-0 text-[0.84rem] text-[var(--color-ink-muted)]">
                  No runs yet. Use "Run now" to test this automation.
                </p>
              ) : (
                <div className="grid gap-[var(--space-1)]">
                  {historyRuns.map((run) => (
                    <div
                      className="grid gap-1 rounded border border-[var(--color-border)] px-[var(--space-3)] py-[var(--space-2)]"
                      key={run._id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
                        <span className="flex items-center gap-[var(--space-2)]">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.68rem] font-[760] ${statusClass(run.status)}`}
                          >
                            {statusLabel(run.status)}
                          </span>
                          <strong className="text-[0.86rem] text-[var(--color-ink)]">{run.topic}</strong>
                          {run.pillar ? (
                            <span className="text-[0.74rem] text-[var(--color-ink-muted)]">{run.pillar}</span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-[var(--space-3)] text-[0.74rem] text-[var(--color-ink-muted)]">
                          {run.costUsd !== undefined ? <span>${run.costUsd.toFixed(2)}</span> : null}
                          <span>{formatRunDate(run.startedAt)}</span>
                          <RunLinks run={run} />
                        </span>
                      </div>
                      {run.status === "failed" && run.errorMessage ? (
                        <details>
                          <summary className="cursor-pointer text-[0.74rem] text-rose-700">Error details</summary>
                          <p className="m-0 whitespace-pre-wrap text-[0.74rem] text-[var(--color-ink-muted)]">
                            {run.errorMessage}
                          </p>
                        </details>
                      ) : null}
                    </div>
                  ))}
                  {runsResult?.hasMore ? (
                    <div>
                      <button
                        className="secondary-button"
                        onClick={() => setRunsLimit((limit) => Math.min(50, limit + 10))}
                        type="button"
                      >
                        Load more
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </form>
      </div>
    </Page>
  );
}

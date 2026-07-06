import { useMutation, useQuery } from "convex/react";
import { Bot, Check, Pause, Play, Plus, Send } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CustomSelect } from "../components/CustomSelect";
import { Field, LoadingState, Page, TextArea } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { rosterModelsForMode } from "../lib/generation/modelRoster";

type AutomationRow = NonNullable<ReturnType<typeof useQuery<typeof api.automations.automations.list>>>[number];

const dayOptions = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

function formatSchedule(automation: AutomationRow) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: automation.scheduleConfig.timezone,
  });
  const days = automation.scheduleConfig.postingTimes
    .map((time) => dayOptions.find((day) => day.value === String(time.dayOfWeek))?.label ?? "Day")
    .join("/");
  const firstTime = automation.scheduleConfig.postingTimes[0];
  const date = new Date();
  date.setHours(firstTime?.hour ?? 9, firstTime?.minute ?? 0, 0, 0);
  return `${days || "Mon"} ${formatter.format(date)} ${automation.scheduleConfig.timezone}`;
}

function statusClass(status: string) {
  if (status === "published") return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-rose-100 text-rose-800";
  if (status === "awaiting_approval") return "bg-amber-100 text-amber-800";
  return "bg-[var(--color-page)] text-[var(--color-ink-muted)]";
}

export function AutomationsPage() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const automations = useQuery(api.automations.automations.list, workspaceArgs);
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const createAutomation = useMutation(api.automations.automations.create);
  const updateAutomation = useMutation(api.automations.automations.update);
  const setAutomationActive = useMutation(api.automations.automations.setActive);
  const submitAgentMessage = useMutation(api.create.agent.submit);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [pillars, setPillars] = useState("");
  const [formatMix, setFormatMix] = useState("mostly slideshows");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [hour, setHour] = useState("9");
  const [approvalMode, setApprovalMode] = useState<"require_approval" | "auto_publish">("require_approval");
  const [imageResolution, setImageResolution] = useState("2K");
  const [imageModel, setImageModel] = useState("");
  const [videoModel, setVideoModel] = useState("");
  const [status, setStatus] = useState("");
  const selected = useMemo(
    () => automations?.find((automation) => String(automation._id) === selectedId) ?? null,
    [automations, selectedId]
  );

  const resetDraft = () => {
    setSelectedId(null);
    setName("");
    setBrief("");
    setPillars("");
    setFormatMix("mostly slideshows");
    setDayOfWeek("1");
    setHour("9");
    setApprovalMode("require_approval");
    setImageResolution("2K");
    setImageModel("");
    setVideoModel("");
    setStatus("");
  };

  const loadAutomation = (automation: AutomationRow) => {
    const firstTime = automation.scheduleConfig.postingTimes[0];
    setSelectedId(String(automation._id));
    setName(automation.name);
    setBrief(automation.brief);
    setPillars(automation.pillars.join(", "));
    setFormatMix(automation.formatMix ?? "");
    setDayOfWeek(String(firstTime?.dayOfWeek ?? 1));
    setHour(String(firstTime?.hour ?? 9));
    setApprovalMode(automation.approvalMode);
    setImageResolution(automation.generationDefaults?.imageResolution ?? "2K");
    setImageModel(automation.generationDefaults?.imageModel ?? "");
    setVideoModel(automation.generationDefaults?.videoModel ?? "");
  };

  const saveAutomation = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeWorkspaceId || !name.trim() || !brief.trim()) return;
    const payload = {
      workspaceId: activeWorkspaceId,
      socialAccountIds: (accounts ?? []).slice(0, 1).map((account) => account._id),
      name: name.trim(),
      brief: brief.trim(),
      pillars: pillars.split(",").map((pillar) => pillar.trim()).filter(Boolean),
      formatMix: formatMix.trim() || undefined,
      scheduleConfig: {
        timezone: "America/Chicago",
        postingTimes: [{ dayOfWeek: Number(dayOfWeek), hour: Number(hour), minute: 0 }],
      },
      approvalMode,
      generationDefaults: {
        imageResolution,
        imageModel: imageModel || undefined,
        videoModel: videoModel || undefined,
      },
    };
    setStatus(selectedId ? "Saving automation..." : "Creating automation...");
    try {
      if (selectedId) {
        await updateAutomation({ id: selectedId as Id<"automations">, ...payload });
      } else {
        const id = await createAutomation(payload);
        setSelectedId(String(id));
      }
      setStatus("Automation saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Automation save failed.");
    }
  };

  const manageInChat = async () => {
    if (!selected || !activeWorkspaceId) return;
    const result = await submitAgentMessage({
      workspaceId: activeWorkspaceId,
      checkpointMode: "debug",
      content: `Help me manage the automation "${selected.name}". Current brief: ${selected.brief}`,
    });
    window.location.href = `/create?threadId=${result.threadId}`;
  };

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
            <button className="secondary-button" onClick={resetDraft} type="button">
              <Plus size={16} />
              New
            </button>
          </div>
          {!automations ? <LoadingState title="Loading automations" compact /> : null}
          {automations?.length === 0 ? (
            <p className="m-0 text-[0.86rem] text-[var(--color-ink-muted)]">No automations yet.</p>
          ) : null}
          {automations?.map((automation) => (
            <button
              className={[
                "grid gap-[var(--space-2)] border-l-2 px-[var(--space-3)] py-[var(--space-2)] text-left",
                selected?._id === automation._id ? "border-[var(--color-accent)] bg-[var(--color-page)]" : "border-transparent",
              ].join(" ")}
              key={automation._id}
              onClick={() => loadAutomation(automation)}
              type="button"
            >
              <span className="flex items-center justify-between gap-[var(--space-2)]">
                <strong className="text-[0.92rem] text-[var(--color-ink)]">{automation.name}</strong>
                <span className="text-[0.72rem] font-[780] text-[var(--color-ink-muted)]">
                  {automation.isActive ? "Active" : "Paused"}
                </span>
              </span>
              <span className="text-[0.76rem] text-[var(--color-ink-muted)]">{formatSchedule(automation)}</span>
              <span className="flex flex-wrap gap-[var(--space-1)]">
                {automation.recentRuns.map((run) => (
                  <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-[760] ${statusClass(run.status)}`} key={run._id}>
                    {run.status.replace(/_/g, " ")}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </section>

        <form className="grid min-w-0 gap-[var(--space-5)] border-y border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)]" onSubmit={saveAutomation}>
          <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
            <div>
              <div className="entity-eyebrow">Automation detail</div>
              <h2 className="m-0 text-[1.1rem] font-[820] text-[var(--color-ink)]">{selectedId ? "Edit automation" : "New automation"}</h2>
            </div>
            <div className="flex flex-wrap gap-[var(--space-2)]">
              {selected ? (
                <button
                  className="secondary-button"
                  onClick={() => void setAutomationActive({ id: selected._id, isActive: !selected.isActive })}
                  type="button"
                >
                  {selected.isActive ? <Pause size={16} /> : <Play size={16} />}
                  {selected.isActive ? "Pause" : "Activate"}
                </button>
              ) : null}
              {selected ? (
                <button className="secondary-button" onClick={() => void manageInChat()} type="button">
                  <Bot size={16} />
                  Manage in chat
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-[var(--space-3)] lg:grid-cols-2">
            <Field label="Name" onChange={setName} placeholder="Pilates education series" value={name} />
            <Field label="Pillars" onChange={setPillars} placeholder="posture tips, ab work, mobility" value={pillars} />
          </div>
          <TextArea label="Brief" onChange={setBrief} placeholder="Audience, voice, themes, guardrails, and output style." rows={7} value={brief} />
          <div className="grid gap-[var(--space-3)] lg:grid-cols-4">
            <Field label="Format mix" onChange={setFormatMix} placeholder="mostly slideshows" value={formatMix} />
            <div className="field">
              <span>Day</span>
              <CustomSelect onChange={setDayOfWeek} options={dayOptions} placeholder="Day" value={dayOfWeek} />
            </div>
            <Field label="Hour" onChange={setHour} placeholder="9" value={hour} />
            <div className="field">
              <span>Approval</span>
              <CustomSelect
                onChange={(value) => setApprovalMode(value as "require_approval" | "auto_publish")}
                options={[
                  { value: "require_approval", label: "Require approval" },
                  { value: "auto_publish", label: "Auto publish" },
                ]}
                placeholder="Approval"
                value={approvalMode}
              />
            </div>
          </div>
          <div className="grid gap-[var(--space-3)] border-t border-[var(--color-border)] pt-[var(--space-4)] lg:grid-cols-3">
            <div className="field">
              <span>Image resolution</span>
              <CustomSelect
                onChange={setImageResolution}
                options={["1K", "2K", "4K"].map((value) => ({ value, label: value }))}
                placeholder="Resolution"
                value={imageResolution}
              />
            </div>
            <div className="field">
              <span>Image model</span>
              <CustomSelect
                onChange={setImageModel}
                options={[{ value: "", label: "Workspace default" }, ...rosterModelsForMode("image").map((model) => ({ value: model.id, label: model.label }))]}
                placeholder="Image model"
                value={imageModel}
              />
            </div>
            <div className="field">
              <span>Video model</span>
              <CustomSelect
                onChange={setVideoModel}
                options={[{ value: "", label: "Workspace default" }, ...rosterModelsForMode("video").map((model) => ({ value: model.id, label: model.label }))]}
                placeholder="Video model"
                value={videoModel}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-[var(--space-3)]">
            <button className="primary-button" type="submit">
              <Check size={16} />
              Save automation
            </button>
            {selected ? (
              <button className="secondary-button" onClick={() => void manageInChat()} type="button">
                <Send size={16} />
                Open chat
              </button>
            ) : null}
            {status ? <p className="m-0 text-[0.84rem] text-[var(--color-ink-muted)]">{status}</p> : null}
          </div>
        </form>
      </div>
    </Page>
  );
}

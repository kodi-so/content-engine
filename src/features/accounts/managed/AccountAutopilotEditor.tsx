import { useMutation } from "convex/react";
import { Check, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { CustomSelect } from "../../../components/CustomSelect";
import type { SocialAccount } from "../accountDisplay";
import {
  AccountStatusPill,
  formatAccountDate,
  managedInputClassName,
  managedLabelClassName,
  ManagedSectionHeading,
} from "./managedAccountUi";

export function AccountAutopilotEditor({ account }: { account: SocialAccount }) {
  const updateAutopilot = useMutation(api.accounts.managedAccounts.updateAutopilot);
  const setAutopilotStatus = useMutation(api.accounts.managedAccounts.setAutopilotStatus);
  const currentSlot = account.autopilot?.cadence.kind === "weekly"
    ? account.autopilot.cadence.slots[0]
    : account.autopilot?.cadence.times[0];
  const [timezone, setTimezone] = useState(account.autopilot?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [cadenceKind, setCadenceKind] = useState<"daily" | "weekly">(account.autopilot?.cadence.kind ?? "daily");
  const [dayOfWeek, setDayOfWeek] = useState(String(account.autopilot?.cadence.kind === "weekly" ? account.autopilot.cadence.slots[0]?.dayOfWeek ?? 1 : 1));
  const [postTime, setPostTime] = useState(`${String(currentSlot?.hour ?? 9).padStart(2, "0")}:${String(currentSlot?.minute ?? 0).padStart(2, "0")}`);
  const [publishingMode, setPublishingMode] = useState<"require_approval" | "auto_publish">(account.autopilot?.publishingMode ?? "require_approval");
  const [monthlyBudget, setMonthlyBudget] = useState(account.autopilot?.budget?.maxUsdPerMonth?.toString() ?? "");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const autopilot = account.autopilot;
    const slot = autopilot?.cadence.kind === "weekly" ? autopilot.cadence.slots[0] : autopilot?.cadence.times[0];
    setTimezone(autopilot?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setCadenceKind(autopilot?.cadence.kind ?? "daily");
    setDayOfWeek(String(autopilot?.cadence.kind === "weekly" ? autopilot.cadence.slots[0]?.dayOfWeek ?? 1 : 1));
    setPostTime(`${String(slot?.hour ?? 9).padStart(2, "0")}:${String(slot?.minute ?? 0).padStart(2, "0")}`);
    setPublishingMode(autopilot?.publishingMode ?? "require_approval");
    setMonthlyBudget(autopilot?.budget?.maxUsdPerMonth?.toString() ?? "");
    setStatus("");
  }, [account._id, account.autopilot]);

  const save = async () => {
    const [hourText, minuteText] = postTime.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!timezone.trim() || !Number.isInteger(hour) || !Number.isInteger(minute)) {
      setStatus("Choose a valid timezone and posting time.");
      return;
    }
    const budgetValue = monthlyBudget.trim() ? Number(monthlyBudget) : undefined;
    setStatus("Saving…");
    try {
      await updateAutopilot({
        id: account._id,
        autopilot: {
          timezone: timezone.trim(),
          cadence: cadenceKind === "daily"
            ? { kind: "daily", times: [{ hour, minute }] }
            : { kind: "weekly", slots: [{ dayOfWeek: Number(dayOfWeek), hour, minute }] },
          publishingMode,
          generationDefaults: account.autopilot?.generationDefaults,
          budget: budgetValue === undefined ? account.autopilot?.budget : { maxUsdPerMonth: budgetValue },
        },
      });
      setStatus("Autopilot settings saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save Autopilot");
    }
  };

  const changeStatus = async (nextStatus: "active" | "paused" | "off") => {
    setStatus("Updating…");
    try {
      await setAutopilotStatus({ id: account._id, status: nextStatus });
      setStatus(nextStatus === "active" ? "Autopilot is active" : `Autopilot is ${nextStatus}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update Autopilot");
    }
  };

  return (
    <div className="grid gap-5">
      <ManagedSectionHeading title="Autopilot" description="Set the operating cadence and approval policy. At each run, the Agent chooses the next idea from the account's full history and playbook." />
      <div className="flex flex-wrap items-center gap-2 border-y border-[var(--color-border)] py-3">
        <AccountStatusPill status={account.autopilotStatus ?? "off"} />
        <span className="text-[0.76rem] text-[var(--color-ink-muted)]">Next run: {formatAccountDate(account.nextAutopilotRunAt)}</span>
        <div className="ml-auto flex gap-2">
          {account.autopilotStatus === "active" ? <button className="secondary-button" onClick={() => void changeStatus("paused")} type="button"><Pause size={14} />Pause</button> : <button className="secondary-button" onClick={() => void changeStatus("active")} type="button"><Play size={14} />Activate</button>}
          <button className="secondary-button" onClick={() => void changeStatus("off")} type="button">Turn off</button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className={managedLabelClassName}>Timezone<input className={managedInputClassName} onChange={(event) => setTimezone(event.target.value)} value={timezone} /></label>
        <label className={managedLabelClassName}>Cadence<CustomSelect onChange={(value) => setCadenceKind(value as "daily" | "weekly")} options={[{ value: "daily", label: "Every day" }, { value: "weekly", label: "Once a week" }]} placeholder="Cadence" value={cadenceKind} /></label>
        {cadenceKind === "weekly" ? <label className={managedLabelClassName}>Day<CustomSelect onChange={setDayOfWeek} options={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, value) => ({ label, value: String(value) }))} placeholder="Day" value={dayOfWeek} /></label> : null}
        <label className={managedLabelClassName}>Posting time<input className={managedInputClassName} onChange={(event) => setPostTime(event.target.value)} type="time" value={postTime} /></label>
        <label className={managedLabelClassName}>Publishing policy<CustomSelect onChange={(value) => setPublishingMode(value as "require_approval" | "auto_publish")} options={[{ value: "require_approval", label: "Ask for approval" }, { value: "auto_publish", label: "Publish automatically" }]} placeholder="Publishing policy" value={publishingMode} /></label>
        <label className={managedLabelClassName}>Monthly generation budget<input className={managedInputClassName} min="0" onChange={(event) => setMonthlyBudget(event.target.value)} placeholder="No limit" step="1" type="number" value={monthlyBudget} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button className="primary-button" onClick={() => void save()} type="button"><Check size={15} />Save settings</button>
        {status ? <span className="text-[0.76rem] font-[650] text-[var(--color-ink-muted)]">{status}</span> : null}
      </div>
    </div>
  );
}

import { useMutation } from "convex/react";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { SocialAccount } from "../accountDisplay";
import { AccountCharacterReferenceField } from "./AccountCharacterReferenceField";
import {
  joinLines,
  lines,
  managedInputClassName,
  managedLabelClassName,
  managedTextareaClassName,
  ManagedSectionHeading,
} from "./managedAccountUi";

type PlaybookDraft = {
  summary: string;
  audience: string;
  goals: string;
  creativeDirection: string;
  instructions: string;
  guardrails: string;
};

export function AccountPlaybookEditor({
  account,
  references,
}: {
  account: SocialAccount;
  references: Array<Doc<"accountReferences"> & { asset: Doc<"creativeAssets"> }>;
}) {
  const updatePlaybook = useMutation(api.accounts.managedAccounts.updatePlaybook);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<PlaybookDraft>({
    summary: "",
    audience: "",
    goals: "",
    creativeDirection: "",
    instructions: "",
    guardrails: "",
  });

  useEffect(() => {
    setDraft({
      summary: account.playbook?.summary ?? "",
      audience: account.playbook?.audience ?? "",
      goals: joinLines(account.playbook?.goals),
      creativeDirection: account.playbook?.creativeDirection ?? "",
      instructions: joinLines(account.playbook?.instructions),
      guardrails: joinLines(account.playbook?.guardrails),
    });
    setStatus("");
  }, [account._id, account.playbook]);

  const update = (field: keyof PlaybookDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (!draft.summary.trim()) {
      setStatus("Give the account a concise identity first.");
      return;
    }
    setStatus("Saving…");
    try {
      await updatePlaybook({
        id: account._id,
        playbook: {
          summary: draft.summary.trim(),
          audience: draft.audience.trim() || undefined,
          goals: lines(draft.goals),
          creativeDirection: draft.creativeDirection.trim() || undefined,
          instructions: lines(draft.instructions),
          guardrails: lines(draft.guardrails),
        },
      });
      setStatus("Playbook saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save playbook");
    }
  };

  return (
    <div className="grid gap-5">
      <ManagedSectionHeading
        title="Account playbook"
        description="This is the durable context the Agent carries into every idea. Describe the account, not a list of rigid content recipes."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <label className={`${managedLabelClassName} lg:col-span-2`}>Account identity<textarea className={managedTextareaClassName} onChange={(event) => update("summary", event.target.value)} placeholder="A warm, realistic account following one curious baby through everyday discoveries." value={draft.summary} /></label>
        <AccountCharacterReferenceField accountId={account._id} references={references} />
        <label className={managedLabelClassName}>Audience<input className={managedInputClassName} onChange={(event) => update("audience", event.target.value)} placeholder="Parents and people who enjoy wholesome short-form video" value={draft.audience} /></label>
        <label className={managedLabelClassName}>Creative direction<input className={managedInputClassName} onChange={(event) => update("creativeDirection", event.target.value)} placeholder="Realistic, intimate, playful, never overly staged" value={draft.creativeDirection} /></label>
        <label className={managedLabelClassName}>Goals · one per line<textarea className={managedTextareaClassName} onChange={(event) => update("goals", event.target.value)} placeholder={"Grow repeat viewers\nDevelop a recognizable personality"} value={draft.goals} /></label>
        <label className={managedLabelClassName}>Standing instructions · one per line<textarea className={managedTextareaClassName} onChange={(event) => update("instructions", event.target.value)} placeholder={"Keep the same baby identity\nPrefer simple visual stories"} value={draft.instructions} /></label>
        <label className={`${managedLabelClassName} lg:col-span-2`}>Guardrails · one per line<textarea className={managedTextareaClassName} onChange={(event) => update("guardrails", event.target.value)} placeholder={"Never show unsafe eating behavior\nAvoid embarrassing or distressing scenarios"} value={draft.guardrails} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button className="primary-button" onClick={() => void save()} type="button"><Check size={15} />Save playbook</button>
        {status ? <span className="text-[0.76rem] font-[650] text-[var(--color-ink-muted)]">{status}</span> : null}
      </div>
    </div>
  );
}

import { useMutation } from "convex/react";
import { Bot, Clock3, ExternalLink, MessageCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { accountProfileUrl, platformLabel } from "./accountDisplay";
import { AccountAutopilotEditor } from "./managed/AccountAutopilotEditor";
import { AccountPlaybookEditor } from "./managed/AccountPlaybookEditor";
import { AccountPostHistory } from "./managed/AccountPostHistory";
import {
  AccountStatusPill,
  type AccountDetail,
  formatAccountDate,
  ManagedSectionHeading,
} from "./managed/managedAccountUi";

type InspectorTab = "overview" | "playbook" | "autopilot" | "posts" | "connection";

const tabs: Array<{ id: InspectorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "playbook", label: "Playbook" },
  { id: "autopilot", label: "Autopilot" },
  { id: "posts", label: "Posts" },
  { id: "connection", label: "Connection" },
];

function AccountOverview({ detail, onWritePlaybook }: { detail: AccountDetail; onWritePlaybook: () => void }) {
  const { account } = detail;
  const activeInsights = detail.insights.filter((insight) => insight.status === "active");
  const recentRuns = useMemo(() => detail.runs.slice(0, 5), [detail.runs]);

  return (
    <div className="grid gap-7">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border-l-2 border-[var(--color-accent)] pl-3"><div className="text-[0.68rem] font-[760] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">Published</div><strong className="text-[1.35rem] text-[var(--color-ink)]">{detail.publishedCount}</strong></div>
        <div className="border-l-2 border-amber-300 pl-3"><div className="text-[0.68rem] font-[760] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">Needs approval</div><strong className="text-[1.35rem] text-[var(--color-ink)]">{detail.pendingApprovalCount}</strong></div>
        <div className="border-l-2 border-[var(--color-border-strong)] pl-3"><div className="text-[0.68rem] font-[760] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">Next run</div><strong className="text-[0.9rem] text-[var(--color-ink)]">{formatAccountDate(account.nextAutopilotRunAt)}</strong></div>
      </div>
      <div className="grid gap-2 border-y border-[var(--color-border)] py-4">
        <div className="flex items-center gap-2 text-[0.72rem] font-[760] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]"><Sparkles size={13} />Account identity</div>
        <p className="m-0 max-w-3xl text-[0.9rem] leading-relaxed text-[var(--color-ink-soft)]">{account.playbook?.summary || "No account identity has been written yet. Add a playbook so the Agent can make coherent choices across posts."}</p>
        {!account.playbook ? <button className="mt-1 w-fit border-0 bg-transparent p-0 text-[0.78rem] font-[730] text-[var(--color-accent-strong)]" onClick={onWritePlaybook} type="button">Write the playbook →</button> : null}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid content-start gap-3">
          <ManagedSectionHeading title="What the Agent has learned" description="Insights are evidence-backed observations from account posts and performance." />
          {activeInsights.length ? activeInsights.slice(0, 6).map((insight) => <div className="border-l border-[var(--color-border-strong)] pl-3 text-[0.82rem] leading-relaxed text-[var(--color-ink-soft)]" key={insight._id}>{insight.statement}</div>) : <p className="m-0 text-[0.8rem] text-[var(--color-ink-muted)]">Insights will appear as the account builds history.</p>}
        </div>
        <div className="grid content-start gap-3">
          <ManagedSectionHeading title="Recent Agent runs" description="Scheduled and on-demand work use the same account memory." />
          {recentRuns.length ? recentRuns.map((run) => <div className="flex items-start gap-3 border-b border-[var(--color-border)] pb-2" key={run._id}><Clock3 className="mt-0.5 text-[var(--color-ink-faint)]" size={14} /><div className="grid flex-1 gap-1"><div className="flex items-center justify-between gap-2"><span className="text-[0.78rem] capitalize text-[var(--color-ink-soft)]">{run.trigger.replace(/_/g, " ")}</span><AccountStatusPill status={run.status} /></div><span className="text-[0.7rem] text-[var(--color-ink-faint)]">{formatAccountDate(run.createdAt)}</span></div></div>) : <p className="m-0 text-[0.8rem] text-[var(--color-ink-muted)]">No Agent runs yet.</p>}
        </div>
      </div>
      {detail.references.length ? <div className="grid gap-3"><ManagedSectionHeading title="Account references" description="Identity, style, voice, and brand assets available whenever the Agent creates for this account." /><div className="flex flex-wrap gap-3">{detail.references.map((reference) => <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[0.76rem] text-[var(--color-ink-soft)]" key={reference._id}>{reference.asset.name}<span className="text-[var(--color-ink-faint)]">{reference.role.replace(/_/g, " ")}</span></div>)}</div></div> : null}
    </div>
  );
}

export function ManagedAccountInspector({ detail, connectionPanel }: { detail: AccountDetail; connectionPanel: ReactNode }) {
  const navigate = useNavigate();
  const runNow = useMutation(api.accounts.managedAccounts.runNow);
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [runStatus, setRunStatus] = useState("");
  const { account } = detail;
  const profileUrl = accountProfileUrl(account);

  useEffect(() => {
    setTab("overview");
    setRunStatus("");
  }, [account._id]);

  const startRun = async () => {
    setRunStatus("Starting account Agent…");
    try {
      await runNow({ id: account._id });
      setRunStatus("The Agent is deciding what to create next");
    } catch (error) {
      setRunStatus(error instanceof Error ? error.message : "Unable to start Agent");
    }
  };

  return (
    <section className="min-w-0 bg-[var(--color-surface)]">
      <header className="grid gap-4 border-b border-[var(--color-border)] px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {account.avatarUrl ? <img alt="" className="size-12 rounded-full border border-[var(--color-border)] object-cover" src={account.avatarUrl} /> : <div className="grid size-12 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-muted)]"><Bot size={20} /></div>}
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 truncate text-[1.25rem] font-[800] text-[var(--color-ink)]">{account.displayName || `@${account.username.replace(/^@/, "")}`}</h2><AccountStatusPill status={account.autopilotStatus ?? "off"} /></div>
            <div className="flex flex-wrap items-center gap-2 text-[0.76rem] text-[var(--color-ink-muted)]"><span>@{account.username.replace(/^@/, "")}</span><span>·</span><span>{platformLabel(account.platform)}</span><span>·</span><span>{account.status.replace(/_/g, " ")}</span>{profileUrl ? <a className="inline-flex items-center gap-1 text-[var(--color-accent-strong)]" href={profileUrl} rel="noreferrer" target="_blank">View profile <ExternalLink size={12} /></a> : null}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><button className="secondary-button" onClick={() => navigate(`/create?accountId=${encodeURIComponent(String(account._id))}`)} type="button"><MessageCircle size={15} />Chat with Agent</button><button className="primary-button" onClick={() => void startRun()} type="button"><Sparkles size={15} />Create next post</button></div>
        {runStatus ? <div className="text-[0.76rem] font-[650] text-[var(--color-ink-muted)] lg:col-span-2 lg:text-right">{runStatus}</div> : null}
      </header>
      <nav aria-label="Account sections" className="flex gap-5 overflow-x-auto border-b border-[var(--color-border)] px-5">
        {tabs.map((item) => <button className={`relative min-h-11 whitespace-nowrap border-0 bg-transparent px-0 text-[0.78rem] font-[720] ${tab === item.id ? "text-[var(--color-ink)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--color-accent)]" : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"}`} key={item.id} onClick={() => setTab(item.id)} type="button">{item.label}{item.id === "posts" && detail.pendingApprovalCount ? ` (${detail.pendingApprovalCount})` : ""}</button>)}
      </nav>
      <div className="p-5">
        {tab === "overview" ? <AccountOverview detail={detail} onWritePlaybook={() => setTab("playbook")} /> : null}
        {tab === "playbook" ? <AccountPlaybookEditor account={account} /> : null}
        {tab === "autopilot" ? <AccountAutopilotEditor account={account} /> : null}
        {tab === "posts" ? <AccountPostHistory posts={detail.posts} /> : null}
        {tab === "connection" ? connectionPanel : null}
      </div>
    </section>
  );
}

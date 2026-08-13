import { ArrowRight, ShieldCheck } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { CustomSelect } from "../components/CustomSelect";
import { LoadingSignal } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";

export function OAuthAuthorizePage() {
  const requestId = useMemo(() =>
    new URLSearchParams(window.location.search).get("requestId") as Id<"mcpOauthAuthorizationRequests"> | null,
  []);
  const request = useQuery(
    api.mcp.oauth.authorizationRequest,
    requestId ? { requestId } : "skip"
  );
  const respond = useAction(api.mcp.oauth.respondToAuthorization);
  const { activeWorkspaceId, workspaces } = useWorkspace();
  const [workspaceId, setWorkspaceId] = useState<string>(activeWorkspaceId ?? "");
  const [working, setWorking] = useState<"approve" | "deny" | "">("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!workspaceId && activeWorkspaceId) setWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId, workspaceId]);

  const workspaceOptions = (workspaces ?? []).map(({ workspace }) => ({
    value: workspace._id,
    label: workspace.name,
  }));

  const finish = async (approved: boolean) => {
    if (!requestId || (approved && !workspaceId)) return;
    setWorking(approved ? "approve" : "deny");
    setErrorMessage("");
    try {
      const result = await respond({
        requestId,
        approved,
        workspaceId: approved ? workspaceId as Id<"workspaces"> : undefined,
      });
      window.location.assign(result.redirectUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Authorization failed.");
      setWorking("");
    }
  };

  if (!requestId || request === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-[var(--space-4)]">
        <div className="max-w-[30rem] text-center">
          <h1 className="text-[1.4rem] font-[820] text-[var(--color-ink)]">Authorization unavailable</h1>
          <p className="mt-[var(--space-2)] text-[0.92rem] leading-[1.6] text-[var(--color-muted)]">
            This request is invalid or has expired. Return to your agent and connect Content Engine again.
          </p>
        </div>
      </main>
    );
  }

  if (request === undefined || workspaces === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--color-bg)]">
        <LoadingSignal label="Preparing secure access" />
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-[var(--space-4)] py-[var(--space-7)]">
      <section className="w-full max-w-[34rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_70px_oklch(20%_0.02_250_/_0.12)]">
        <header className="border-b border-[var(--color-border)] px-[var(--space-5)] py-[var(--space-5)]">
          <div className="mb-[var(--space-4)] grid size-10 place-items-center rounded-full bg-[oklch(94%_0.04_175)] text-[var(--color-accent-strong)]">
            <ShieldCheck size={20} />
          </div>
          <p className="text-[0.72rem] font-[780] uppercase tracking-[0.1em] text-[var(--color-muted)]">
            Content Engine access
          </p>
          <h1 className="mt-[0.4rem] text-[1.45rem] font-[840] leading-[1.2] text-[var(--color-ink)]">
            Connect {request.clientName}
          </h1>
          <p className="mt-[var(--space-2)] text-[0.92rem] leading-[1.6] text-[var(--color-muted)]">
            This lets the agent use Content Engine’s creation, account, and publishing tools on your behalf.
          </p>
        </header>

        <div className="px-[var(--space-5)] py-[var(--space-5)]">
          <label className="block text-[0.8rem] font-[760] text-[var(--color-ink)]">
            Workspace
          </label>
          <div className="mt-[var(--space-2)]">
            <CustomSelect
              onChange={setWorkspaceId}
              options={workspaceOptions}
              placeholder="Choose a workspace"
              value={workspaceId}
            />
          </div>

          <div className="mt-[var(--space-5)] border-t border-[var(--color-border)] pt-[var(--space-4)]">
            <div className="text-[0.78rem] font-[760] text-[var(--color-ink)]">Requested access</div>
            <ul className="mt-[var(--space-3)] grid gap-[var(--space-3)]">
              {request.scopes.map((scope) => (
                <li className="flex gap-[var(--space-2)] text-[0.86rem] leading-[1.45] text-[var(--color-muted)]" key={scope.id}>
                  <span className="mt-[0.5rem] size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
                  {scope.description}
                </li>
              ))}
            </ul>
          </div>

          {errorMessage ? (
            <p className="mt-[var(--space-4)] text-[0.84rem] text-[var(--color-danger)]">{errorMessage}</p>
          ) : null}

          <div className="mt-[var(--space-5)] flex flex-col-reverse gap-[var(--space-2)] sm:flex-row sm:justify-end">
            <button className="secondary-button" disabled={Boolean(working)} type="button" onClick={() => void finish(false)}>
              {working === "deny" ? "Canceling…" : "Cancel"}
            </button>
            <button className="primary-button" disabled={Boolean(working) || !workspaceId} type="button" onClick={() => void finish(true)}>
              {working === "approve" ? "Connecting…" : "Allow access"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ChecklistItem, Metric, Page, Panel } from "../components/ui";
import { useWorkspace } from "../contexts/WorkspaceContext";

export function Dashboard() {
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const workspaceArgs = activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {};
  const brands = useQuery(api.accounts.brands.list, workspaceArgs);
  const accounts = useQuery(api.accounts.socialAccounts.list, workspaceArgs);
  const workflows = useQuery(api.workflows.definitions.list, workspaceArgs);
  const runs = useQuery(api.workflows.runs.list, workspaceArgs);
  const artifacts = useQuery(api.artifacts.records.list, workspaceArgs);

  const runningRuns = runs?.filter((run) => run.status === "running").length ?? 0;
  const approvalRuns =
    runs?.filter((run) => run.status === "waiting_for_approval").length ?? 0;

  return (
    <Page
      title="Operations Dashboard"
      description={`The control room for ${activeWorkspace?.name ?? "this workspace"}.`}
    >
      <div className="metric-grid">
        <Metric label="Brands" value={brands?.length ?? 0} />
        <Metric label="Social Accounts" value={accounts?.length ?? 0} />
        <Metric label="Workflows" value={workflows?.length ?? 0} />
        <Metric label="Artifacts" value={artifacts?.length ?? 0} />
      </div>

      <div className="two-column">
        <Panel title="Run Health">
          <div className="status-row">
            <span>Running now</span>
            <strong>{runningRuns}</strong>
          </div>
          <div className="status-row">
            <span>Waiting for approval</span>
            <strong>{approvalRuns}</strong>
          </div>
          <div className="status-row">
            <span>Total runs</span>
            <strong>{runs?.length ?? 0}</strong>
          </div>
        </Panel>

        <Panel title="Architecture Baseline">
          <ChecklistItem done label="Provider-backed social accounts" />
          <ChecklistItem done label="Workflow definitions and versions" />
          <ChecklistItem done label="Run events and artifacts" />
          <ChecklistItem done label="Distribution plans and metrics" />
        </Panel>
      </div>
    </Page>
  );
}

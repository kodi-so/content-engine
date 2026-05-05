import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Metric, Page } from "../components/ui";

export function AnalyticsPage() {
  const metrics = useQuery(api.publishing.metrics.list, {});

  return (
    <Page title="Analytics" description="Performance data will feed future workflow decisions.">
      <div className="metric-grid">
        <Metric label="Metric Snapshots" value={metrics?.length ?? 0} />
        <Metric
          label="Total Views"
          value={metrics?.reduce((sum, item) => sum + (item.metrics.views ?? 0), 0) ?? 0}
        />
        <Metric
          label="Total Likes"
          value={metrics?.reduce((sum, item) => sum + (item.metrics.likes ?? 0), 0) ?? 0}
        />
      </div>
    </Page>
  );
}

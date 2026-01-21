import { useState } from "react";
import { useQuery } from "convex/react";
import { RefreshCw, BarChart3 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  useAnalytics,
  SummaryCards,
  AccountTabs,
  AccountStatsCard,
  DateRangePicker,
  ContentTable,
  DateRange,
} from "../features/analytics";

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [selectedAccountId, setSelectedAccountId] = useState<Id<"accounts"> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { stats, accountStats, postedContent, refreshMetrics, isLoading } = useAnalytics({
    accountId: selectedAccountId ?? undefined,
    dateRange,
  });

  // Get accounts with their stats (for AccountStatsCard)
  const accounts = useQuery(api.accounts.list);
  const selectedAccount = selectedAccountId
    ? accounts?.find((a) => a._id === selectedAccountId)
    : null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshMetrics();
    } catch (err) {
      console.error("Failed to refresh metrics:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatLastUpdated = (timestamp: number | null) => {
    if (!timestamp) return null;
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return "just now";
    if (minutes === 1) return "1 minute ago";
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return "1 hour ago";
    return `${hours} hours ago`;
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Analytics</h1>
          <p>Track your TikTok content performance and engagement metrics</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#374151",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: isRefreshing ? "not-allowed" : "pointer",
              opacity: isRefreshing ? 0.7 : 1,
            }}
          >
            <RefreshCw
              size={16}
              style={{
                animation: isRefreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="card">
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "#6b7280",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                border: "3px solid #e5e7eb",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                margin: "0 auto",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ marginTop: "1rem" }}>Loading analytics...</p>
          </div>
        </div>
      ) : stats?.totalPosts === 0 && postedContent.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={48} style={{ opacity: 0.3, marginBottom: "1rem" }} />
            <h3>No TikTok Posts Yet</h3>
            <p style={{ maxWidth: "400px", margin: "0.5rem auto 0" }}>
              When you post content to TikTok via Content Engine, your analytics
              will appear here. Views, likes, comments, and shares are updated
              hourly.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          {stats && (
            <div style={{ marginBottom: "1.5rem" }}>
              <SummaryCards stats={stats} />
            </div>
          )}

          {/* Account Filter */}
          {accountStats && (
            <AccountTabs
              accounts={accountStats}
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
            />
          )}

          {/* Account Stats (from user.info.stats scope) */}
          {selectedAccount ? (
            <AccountStatsCard account={selectedAccount} />
          ) : (
            // Show all account stats when "All Accounts" is selected
            accounts?.filter(a => a.platform === "tiktok" && a.followerCount !== undefined).map(account => (
              <AccountStatsCard key={account._id} account={account} />
            ))
          )}

          {/* Content Table */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <ContentTable posts={postedContent} isLoading={isLoading} />
          </div>

          {/* Footer */}
          {stats?.metricsLastUpdated && (
            <div
              style={{
                marginTop: "1rem",
                fontSize: "0.75rem",
                color: "#9ca3af",
                textAlign: "center",
              }}
            >
              Metrics updated hourly &bull; Last updated:{" "}
              {formatLastUpdated(stats.metricsLastUpdated)}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

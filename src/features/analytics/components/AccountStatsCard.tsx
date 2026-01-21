import { Users, UserPlus, Heart, Video } from "lucide-react";

interface AccountStatsCardProps {
  account: {
    username: string;
    displayName?: string;
    avatarUrl?: string;
    followerCount?: number;
    followingCount?: number;
    likesCount?: number;
    videoCount?: number;
    statsLastUpdated?: number;
  };
}

function formatNumber(num: number | undefined): string {
  if (num === undefined || num === null) return "-";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function AccountStatsCard({ account }: AccountStatsCardProps) {
  const hasStats = account.followerCount !== undefined;

  if (!hasStats) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2rem",
        padding: "1rem 1.5rem",
        background: "white",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
        marginBottom: "1.5rem",
      }}
    >
      {/* Account Info */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {account.avatarUrl ? (
          <img
            src={account.avatarUrl}
            alt={account.displayName || account.username}
            style={{ width: "48px", height: "48px", borderRadius: "50%" }}
          />
        ) : (
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              color: "#6b7280",
              fontSize: "1.25rem",
            }}
          >
            {(account.displayName || account.username)[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, fontSize: "1rem" }}>
            {account.displayName || account.username}
          </div>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
            @{account.username}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: "2rem", marginLeft: "auto" }}>
        <StatItem
          icon={Users}
          label="Followers"
          value={formatNumber(account.followerCount)}
          color="#3b82f6"
        />
        <StatItem
          icon={UserPlus}
          label="Following"
          value={formatNumber(account.followingCount)}
          color="#8b5cf6"
        />
        <StatItem
          icon={Heart}
          label="Total Likes"
          value={formatNumber(account.likesCount)}
          color="#ef4444"
        />
        <StatItem
          icon={Video}
          label="Videos"
          value={formatNumber(account.videoCount)}
          color="#10b981"
        />
      </div>
    </div>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.375rem",
          marginBottom: "0.25rem",
        }}
      >
        <Icon size={16} color={color} />
        <span style={{ fontWeight: 600, fontSize: "1.125rem" }}>{value}</span>
      </div>
      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{label}</div>
    </div>
  );
}
